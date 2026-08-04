/**
 * PayoutGateway — the ONLY surface the admin UI uses for the worker payout ledger.
 *
 * Same inversion as the order gateway, but a SEPARATE contract: the OrderGateway is
 * frozen and payouts are their own aggregate. Two adapters satisfy it identically —
 * a local one (offline; the real `makePayoutService` over a KeyValueStore-persisted
 * repo) and an HTTP one (the deployed `/payouts` routes). Swapping is one env var.
 *
 * Tenancy stays invisible to the UI (hard rule): the local adapter uses a fixed local
 * context, and over HTTP the server derives the tenant from the bearer token.
 */
import type { PayoutEntry, WorkerType } from '../domain';
import type { AuthContext } from './auth';
import { makePayoutService, type CreateAdjustmentInput, type CreateJobPayoutInput, type PayoutRepo, type ServerPayout } from './payoutService';
import { ConflictError } from './errors';
import type { KeyValueStore } from './preferences';
import { auth } from './authClient';

/** UI-facing payout — the server row minus tenancy/version. */
export type Payout = PayoutEntry;

const toPayout = (p: ServerPayout): Payout => {
    const { tenantId: _t, version: _v, ...rest } = p;
    return rest;
};

export interface PayoutGateway {
    /** Composition root injects storage here (called once at startup). */
    init(kv: KeyValueStore): Promise<void>;
    subscribe(listener: () => void): () => void;
    /** Stable snapshot for useSyncExternalStore. */
    snapshot(): Payout[];
    createForJob(input: Omit<CreateJobPayoutInput, never>): Promise<Payout>;
    createAdjustment(input: Omit<CreateAdjustmentInput, never>): Promise<Payout>;
    approve(id: string): Promise<Payout | undefined>;
    pay(id: string): Promise<Payout | undefined>;
    cancel(id: string): Promise<Payout | undefined>;
    /** Re-read from the source (HTTP adapter); a no-op for the local one. */
    refresh(): Promise<void>;
}

export const PAYOUTS_KEY = 'heyhomie.payouts';

/**
 * A PayoutRepo backed by a KeyValueStore, so the offline admin keeps its ledger across
 * reloads. Writes are whole-map saves — the ledger is small and admin-local.
 */
export function persistedPayoutRepo(): PayoutRepo & { hydrate(kv: KeyValueStore): Promise<void> } {
    const map = new Map<string, ServerPayout>();
    let store: KeyValueStore | null = null;
    const persist = () => {
        if (store) void store.setItem(PAYOUTS_KEY, JSON.stringify([...map.values()]));
    };
    return {
        async hydrate(kv) {
            store = kv;
            try {
                const raw = await kv.getItem(PAYOUTS_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) for (const p of parsed as ServerPayout[]) map.set(p.id, p);
            } catch {
                /* corrupted entry — start from an empty ledger rather than crash */
            }
        },
        async get(id, tenantId) {
            const p = map.get(id);
            return p && p.tenantId === tenantId ? p : undefined;
        },
        async insert(p) {
            if (map.has(p.id)) throw new ConflictError('duplicate payout id');
            map.set(p.id, p);
            persist();
        },
        async update(p, expectedVersion) {
            const cur = map.get(p.id);
            if (!cur || cur.tenantId !== p.tenantId || cur.version !== expectedVersion) throw new ConflictError('version conflict');
            const next = { ...p, version: expectedVersion + 1 };
            map.set(p.id, next);
            persist();
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

/** The offline adapter: the REAL service over a persisted repo. */
export function makeLocalPayoutGateway(): PayoutGateway {
    const repo = persistedPayoutRepo();
    const service = makePayoutService(repo);
    // Offline/local tenancy — never surfaced to the UI. Named `localAuth` so it can't
    // be confused with the imported client-auth facade used by the HTTP binding below.
    const localAuth: AuthContext = { userId: 'local-admin', tenantId: 'local', role: 'admin' };
    const listeners = new Set<() => void>();
    let cache: Payout[] = [];

    const reload = async () => {
        cache = (await service.list(localAuth)).map(toPayout).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        listeners.forEach(l => l());
    };

    return {
        async init(kv) {
            await repo.hydrate(kv);
            await reload();
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        snapshot: () => cache,
        async createForJob(input) {
            const created = await service.createForJob(input, localAuth);
            await reload();
            return toPayout(created);
        },
        async createAdjustment(input) {
            const created = await service.createAdjustment(input, localAuth);
            await reload();
            return toPayout(created);
        },
        async approve(id) {
            const p = await service.approve(id, localAuth);
            await reload();
            return toPayout(p);
        },
        async pay(id) {
            const p = await service.pay(id, localAuth);
            await reload();
            return toPayout(p);
        },
        async cancel(id) {
            const p = await service.cancel(id, localAuth);
            await reload();
            return toPayout(p);
        },
        refresh: reload,
    };
}

export interface HttpPayoutConfig {
    baseUrl: string;
    /** Bearer token; the server derives the tenant from it. */
    getToken: () => string | undefined;
    fetchImpl?: typeof fetch;
}

/** The HTTP adapter — the same contract over the deployed `/payouts` routes. */
export function makeHttpPayoutGateway(config: HttpPayoutConfig): PayoutGateway {
    const base = config.baseUrl.replace(/\/$/, '');
    const doFetch = config.fetchImpl ?? (globalThis.fetch as typeof fetch);
    const listeners = new Set<() => void>();
    let cache: Payout[] = [];

    const headers = (): Record<string, string> => {
        const t = config.getToken();
        return { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) };
    };
    const call = async (path: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
        const res = await doFetch(`${base}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
        if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
        return res.status === 204 ? undefined : res.json();
    };
    const reload = async () => {
        cache = ((await call('/payouts', 'GET')) as ServerPayout[]).map(toPayout);
        listeners.forEach(l => l());
    };
    const mutate = async (path: string): Promise<Payout | undefined> => {
        const p = (await call(path, 'POST')) as ServerPayout | undefined;
        await reload();
        return p ? toPayout(p) : undefined;
    };

    return {
        async init() {
            await reload();
        },
        subscribe(l) {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        snapshot: () => cache,
        async createForJob(input) {
            const created = (await call('/payouts/job', 'POST', input)) as ServerPayout;
            await reload();
            return toPayout(created);
        },
        async createAdjustment(input) {
            const created = (await call('/payouts/adjustment', 'POST', input)) as ServerPayout;
            await reload();
            return toPayout(created);
        },
        approve: id => mutate(`/payouts/${id}/approve`),
        pay: id => mutate(`/payouts/${id}/pay`),
        cancel: id => mutate(`/payouts/${id}/cancel`),
        refresh: reload,
    };
}

export type { WorkerType };

/**
 * The active binding, selected at load — mirrors `orderGateway`:
 *  - `EXPO_PUBLIC_ORDERS_API_URL` set → the HTTP adapter against the real `/payouts`
 *    routes, using the client auth facade for the bearer token;
 *  - unset → the local adapter (offline; the real service over a persisted repo).
 * Screens import only this. Swapping backends changes nothing above it.
 */
const API_URL = typeof process !== 'undefined' ? process.env?.EXPO_PUBLIC_ORDERS_API_URL : undefined;

export const payoutGateway: PayoutGateway = API_URL
    ? makeHttpPayoutGateway({ baseUrl: API_URL, getToken: auth.getToken, fetchImpl: auth.authFetch })
    : makeLocalPayoutGateway();
