/**
 * Worker payout LEDGER — the durable record of what each homie has earned.
 *
 * `payouts.ts` answers "how much is this job worth"; this module answers "what do we
 * actually owe, and has it been paid". It is the missing link the contract `Order` does
 * not carry: an order knows its price but not who did the work, so a payout entry binds
 * a worker to an order (or to a bonus/adjustment) and tracks it through to settlement.
 *
 * Orthogonal to the frozen OrderGateway contract — nothing here changes an order.
 * Pure + framework-free: the transitions below are the same ones the server applies.
 */
import type { WorkerType } from './missions';
import { payoutRateFor } from './payouts';

export type PayoutStatus = 'pending' | 'approved' | 'paid' | 'canceled';

/** What an entry pays for. `job` is tied to an order; the others stand alone. */
export type PayoutKind = 'job' | 'bonus' | 'adjustment';

export interface PayoutEntry {
    id: string;
    workerId: string;
    workerType: WorkerType;
    /** The order this pays for — required for `job`, absent otherwise. */
    orderId?: string;
    kind: PayoutKind;
    /** PLN, whole units. Negative only for an `adjustment` (a deduction). */
    amount: number;
    /** Settlement period, 'YYYY-MM'. */
    period: string;
    status: PayoutStatus;
    note?: string;
    createdAt: string; // ISO
    approvedAt?: string;
    paidAt?: string;
}

/** Statuses a payout can no longer move out of. */
export const isTerminalPayout = (s: PayoutStatus): boolean => s === 'paid' || s === 'canceled';

/**
 * What a homie earns for one job, from the ORDER price and their engagement type.
 * `override` (an admin's final say) wins; otherwise the rate for the worker type.
 * Never negative, always whole zł.
 */
export function jobPayoutAmount(orderAmount: number, workerType: WorkerType, override?: number): number {
    if (override != null) return Math.max(0, Math.round(override));
    return Math.max(0, Math.round(orderAmount * payoutRateFor(workerType)));
}

/** Settlement period for a timestamp, 'YYYY-MM'. */
export const periodOf = (iso: string): string => iso.slice(0, 7);

/* ------------------------------------------------------------------ */
/* Transitions — pure. Each returns the SAME reference when it is a     */
/* no-op, so a caller can skip the write (mirrors orderService).        */
/* ------------------------------------------------------------------ */

/** pending → approved. Anything else is a no-op. */
export function approvePayout(e: PayoutEntry, at: string): PayoutEntry {
    return e.status === 'pending' ? { ...e, status: 'approved', approvedAt: at } : e;
}

/** approved → paid. Paying a pending entry is NOT allowed (approval is the control). */
export function payPayout(e: PayoutEntry, at: string): PayoutEntry {
    return e.status === 'approved' ? { ...e, status: 'paid', paidAt: at } : e;
}

/** pending | approved → canceled. Settled money is never un-paid here (that needs a
 *  compensating `adjustment` entry, so the ledger stays append-only in spirit).
 *  `at` is unused today — kept for signature symmetry with the other transitions. */
export function cancelPayout(e: PayoutEntry, _at: string): PayoutEntry {
    return isTerminalPayout(e.status) ? e : { ...e, status: 'canceled' };
}

/* ------------------------------------------------------------------ */
/* Rollups                                                             */
/* ------------------------------------------------------------------ */

export interface PayoutTotals {
    /** Entries that still need a decision. */
    pending: number;
    /** Approved but not yet transferred — what we owe right now. */
    approved: number;
    /** Already transferred. */
    paid: number;
    /** pending + approved — the outstanding liability. */
    owed: number;
    count: number;
}

/** Money totals by status. Canceled entries contribute nothing. */
export function payoutTotals(entries: PayoutEntry[]): PayoutTotals {
    let pending = 0;
    let approved = 0;
    let paid = 0;
    for (const e of entries) {
        if (e.status === 'pending') pending += e.amount;
        else if (e.status === 'approved') approved += e.amount;
        else if (e.status === 'paid') paid += e.amount;
    }
    return { pending, approved, paid, owed: pending + approved, count: entries.length };
}

export interface WorkerPayoutSummary {
    workerId: string;
    workerType: WorkerType;
    jobs: number;
    totals: PayoutTotals;
}

/** Per-worker rollup, biggest outstanding first. */
export function workerPayoutSummaries(entries: PayoutEntry[]): WorkerPayoutSummary[] {
    const byWorker = new Map<string, PayoutEntry[]>();
    for (const e of entries) {
        const list = byWorker.get(e.workerId);
        if (list) list.push(e);
        else byWorker.set(e.workerId, [e]);
    }
    return [...byWorker.entries()]
        .map(([workerId, list]) => ({
            workerId,
            workerType: list[0].workerType,
            jobs: list.filter(e => e.kind === 'job' && e.status !== 'canceled').length,
            totals: payoutTotals(list),
        }))
        .sort((a, b) => b.totals.owed - a.totals.owed);
}

/** Entries in one settlement period, e.g. '2026-08'. */
export const payoutsInPeriod = (entries: PayoutEntry[], period: string): PayoutEntry[] =>
    entries.filter(e => e.period === period);
