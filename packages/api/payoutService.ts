/**
 * Authoritative payout service — the worker-payout ledger's engine.
 *
 * Mirrors `orderService` exactly: repo-injected so the SAME transitions run in tests
 * (memory repo) and in the deployed Fastify service (Postgres repo); every method takes
 * an `AuthContext`; reads are tenant-scoped at the repo and mutations are deny-by-default
 * via `requireOwned`; writes are optimistic (version CAS) with retry, so concurrent
 * approve/pay calls converge to exactly-once.
 *
 * Orthogonal to the frozen OrderGateway contract — an order is never modified here. A
 * payout only REFERENCES an order id, which is the link the contract itself lacks.
 */
import {
    approvePayout,
    payPayout,
    cancelPayout,
    jobPayoutAmount,
    periodOf,
    type PayoutEntry,
    type PayoutKind,
    type WorkerType,
} from '../domain';
import { requireOwned, type AuthContext } from './auth';
import { ConflictError, ValidationError } from './errors';

/** Server-side row: the ledger entry plus tenancy + the concurrency version. */
export interface ServerPayout extends PayoutEntry {
    tenantId: string; // server-side only — never exposed to the UI
    version: number;
}

/** Always tenant-scoped; `update` is a compare-and-swap (see orderService). */
export interface PayoutRepo {
    get(id: string, tenantId: string): Promise<ServerPayout | undefined>;
    insert(entry: ServerPayout): Promise<void>;
    update(entry: ServerPayout, expectedVersion: number): Promise<ServerPayout>;
    list(tenantId: string): Promise<ServerPayout[]>;
    /** Existing entry for a job, so the same order is never paid twice. */
    findByOrder(orderId: string, tenantId: string): Promise<ServerPayout | undefined>;
}

/** In-memory repo (tests / in-process fake). Tenant-scoped + CAS. */
export function memoryPayoutRepo(): PayoutRepo {
    const map = new Map<string, ServerPayout>();
    return {
        async get(id, tenantId) {
            const p = map.get(id);
            return p && p.tenantId === tenantId ? p : undefined;
        },
        async insert(p) {
            if (map.has(p.id)) throw new ConflictError('duplicate payout id');
            map.set(p.id, p);
        },
        async update(p, expectedVersion) {
            const cur = map.get(p.id);
            if (!cur || cur.tenantId !== p.tenantId || cur.version !== expectedVersion) throw new ConflictError('version conflict');
            const next = { ...p, version: expectedVersion + 1 };
            map.set(p.id, next);
            return next;
        },
        async list(tenantId) {
            return [...map.values()].filter(p => p.tenantId === tenantId);
        },
        async findByOrder(orderId, tenantId) {
            return [...map.values()].find(p => p.tenantId === tenantId && p.orderId === orderId && p.status !== 'canceled');
        },
    };
}

export interface CreateJobPayoutInput {
    workerId: string;
    workerType: WorkerType;
    orderId: string;
    /** The order's amount — the caller reads it from the order; the share is applied here. */
    orderAmount: number;
    /** Admin's final say; wins over the share calculation. */
    override?: number;
    note?: string;
}

export interface CreateAdjustmentInput {
    workerId: string;
    workerType: WorkerType;
    kind: Extract<PayoutKind, 'bonus' | 'adjustment'>;
    /** PLN. A `bonus` must be positive; an `adjustment` may be negative (a deduction). */
    amount: number;
    period?: string; // defaults to the current month
    note?: string;
}

export interface PayoutService {
    createForJob(input: CreateJobPayoutInput, auth: AuthContext): Promise<ServerPayout>;
    createAdjustment(input: CreateAdjustmentInput, auth: AuthContext): Promise<ServerPayout>;
    get(id: string, auth: AuthContext): Promise<ServerPayout | undefined>;
    list(auth: AuthContext): Promise<ServerPayout[]>;
    approve(id: string, auth: AuthContext): Promise<ServerPayout>;
    pay(id: string, auth: AuthContext): Promise<ServerPayout>;
    cancel(id: string, auth: AuthContext): Promise<ServerPayout>;
}

const MAX_CAS_RETRIES = 100;
const uid = () => `po-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;

export function makePayoutService(repo: PayoutRepo): PayoutService {
    /** Optimistic read-modify-write, identical in shape to orderService.mutate. */
    const mutate = async (id: string, auth: AuthContext, transition: (p: ServerPayout, at: string) => PayoutEntry): Promise<ServerPayout> => {
        for (let i = 0; i < MAX_CAS_RETRIES; i++) {
            const cur = requireOwned(await repo.get(id, auth.tenantId), auth);
            const at = new Date().toISOString();
            const next = transition(cur, at);
            if (next === (cur as PayoutEntry)) return cur; // no-op → no write
            try {
                return await repo.update({ ...(next as ServerPayout), tenantId: cur.tenantId, version: cur.version }, cur.version);
            } catch (e) {
                if (e instanceof ConflictError) continue; // stale — re-read and retry
                throw e;
            }
        }
        throw new ConflictError('payout update contention exceeded retry budget');
    };

    return {
        async createForJob(input, auth) {
            if (!input.workerId) throw new ValidationError('workerId is required');
            if (!input.orderId) throw new ValidationError('orderId is required');
            // One live payout per order — re-running a settlement must not double-pay.
            const existing = await repo.findByOrder(input.orderId, auth.tenantId);
            if (existing) throw new ConflictError('this order already has a payout');
            const now = new Date().toISOString();
            const entry: ServerPayout = {
                id: uid(),
                tenantId: auth.tenantId,
                version: 1,
                workerId: input.workerId,
                workerType: input.workerType,
                orderId: input.orderId,
                kind: 'job',
                amount: jobPayoutAmount(input.orderAmount, input.workerType, input.override),
                period: periodOf(now),
                status: 'pending',
                note: input.note,
                createdAt: now,
            };
            await repo.insert(entry);
            return entry;
        },

        async createAdjustment(input, auth) {
            if (!input.workerId) throw new ValidationError('workerId is required');
            if (!Number.isFinite(input.amount) || input.amount === 0) throw new ValidationError('amount must be a non-zero number');
            if (input.kind === 'bonus' && input.amount < 0) throw new ValidationError('a bonus must be positive — use an adjustment for a deduction');
            const now = new Date().toISOString();
            const entry: ServerPayout = {
                id: uid(),
                tenantId: auth.tenantId,
                version: 1,
                workerId: input.workerId,
                workerType: input.workerType,
                kind: input.kind,
                amount: Math.round(input.amount),
                period: input.period ?? periodOf(now),
                status: 'pending',
                note: input.note,
                createdAt: now,
            };
            await repo.insert(entry);
            return entry;
        },

        get: (id, auth) => repo.get(id, auth.tenantId),
        list: auth => repo.list(auth.tenantId),
        approve: (id, auth) => mutate(id, auth, approvePayout),
        pay: (id, auth) => mutate(id, auth, payPayout),
        cancel: (id, auth) => mutate(id, auth, cancelPayout),
    };
}
