/**
 * Order-native analytics — admin KPIs computed from REAL orders.
 *
 * Why this exists instead of reusing the Mission analytics: the frozen contract `Order`
 * deliberately carries only a thin projection (id, client, city, status, payment, updatedAt).
 * It has no plan / rooms / schedule / address / homie, so projecting orders into `Mission`
 * would mean inventing those fields. These functions instead compute only what an order
 * genuinely knows — money, status, counts, per-client rollups, time series.
 *
 * Pure + framework-free. `OrderLike` is structural: the contract `Order` satisfies it, so
 * the domain layer keeps its rule of never importing from `@heyhomie/api`.
 */
import type { PaymentIntent } from './payment';

/** Contract order statuses (structural copy — see the note above about layering). */
export type OrderLikeStatus = 'confirmed' | 'completed' | 'canceled' | 'paid';

/** The minimal order shape these analytics read. The contract `Order` satisfies it. */
export interface OrderLike {
    id: string;
    clientId?: string;
    cityId?: string;
    contact?: { phone?: string; email?: string };
    updatedAt: string;
    status: OrderLikeStatus;
    payment?: PaymentIntent;
}

/** Money on an order (0 when the amount hasn't been set yet). */
export const orderAmount = (o: OrderLike): number => o.payment?.amount ?? 0;

/** True once the money is actually collected. */
export const isOrderPaid = (o: OrderLike): boolean => o.status === 'paid' || o.payment?.status === 'paid';

/**
 * The best timestamp an order carries for "when did this happen".
 * `paidAt` → `completedAt` → `updatedAt`. NOTE: this is the ORDER's timeline, not a
 * scheduled visit date — the contract has no schedule.
 */
export function orderAt(o: OrderLike): string {
    return o.payment?.paidAt ?? o.payment?.completedAt ?? o.updatedAt;
}

export interface OrderKpis {
    total: number;
    confirmed: number;
    completed: number;
    paid: number;
    canceled: number;
    /** Money actually collected (paid orders). */
    revenue: number;
    /** Billable but not yet collected — completed/confirmed and not paid. */
    outstanding: number;
    /** Average value of a paid order (0 when none). */
    avgOrder: number;
    /** Share of all orders that were canceled, 0..100 (1 decimal). */
    cancelRate: number;
    currency: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Headline admin numbers over a set of orders. */
export function orderKpis(orders: OrderLike[]): OrderKpis {
    let confirmed = 0;
    let completed = 0;
    let paid = 0;
    let canceled = 0;
    let revenue = 0;
    let outstanding = 0;
    let currency = 'PLN';

    for (const o of orders) {
        if (o.payment?.currency) currency = o.payment.currency;
        const amount = orderAmount(o);
        switch (o.status) {
            case 'confirmed':
                confirmed++;
                outstanding += amount;
                break;
            case 'completed':
                completed++;
                outstanding += amount;
                break;
            case 'paid':
                paid++;
                revenue += amount;
                break;
            case 'canceled':
                canceled++;
                break;
        }
    }

    const total = orders.length;
    return {
        total,
        confirmed,
        completed,
        paid,
        canceled,
        revenue: round2(revenue),
        outstanding: round2(outstanding),
        avgOrder: paid > 0 ? round2(revenue / paid) : 0,
        cancelRate: total > 0 ? round1((canceled / total) * 100) : 0,
        currency,
    };
}

/** Per-client rollup built only from what an order carries. */
export interface OrderClientProfile {
    id: string;
    /** Best available label — the contract has no name, so email/phone (masked) or the id. */
    label: string;
    city?: string;
    orders: number;
    /** Paid orders only — lifetime value actually collected. */
    paidOrders: number;
    totalSpent: number;
    avgOrder: number;
    firstOrderAt: string;
    lastOrderAt: string;
}

/** Mask an email/phone for display: `marek@x.pl` → `m***@x.pl`, `+48123456789` → `…6789`. */
export function maskContact(contact?: { phone?: string; email?: string }): string | undefined {
    const email = contact?.email?.trim();
    if (email && email.includes('@')) {
        const [user, host] = email.split('@');
        return `${user.slice(0, 1)}***@${host}`;
    }
    const phone = contact?.phone?.trim();
    if (phone && phone.length >= 4) return `…${phone.slice(-4)}`;
    return undefined;
}

/** Group orders by client, newest activity first. Orders with no clientId are skipped. */
export function orderClientProfiles(orders: OrderLike[]): OrderClientProfile[] {
    const byClient = new Map<string, OrderClientProfile>();

    for (const o of orders) {
        const id = o.clientId;
        if (!id) continue;
        const at = orderAt(o);
        const spent = isOrderPaid(o) ? orderAmount(o) : 0;
        const existing = byClient.get(id);

        if (!existing) {
            byClient.set(id, {
                id,
                label: maskContact(o.contact) ?? id,
                city: o.cityId,
                orders: 1,
                paidOrders: isOrderPaid(o) ? 1 : 0,
                totalSpent: spent,
                avgOrder: spent,
                firstOrderAt: at,
                lastOrderAt: at,
            });
            continue;
        }

        existing.orders++;
        if (isOrderPaid(o)) existing.paidOrders++;
        existing.totalSpent = round2(existing.totalSpent + spent);
        existing.avgOrder = existing.paidOrders > 0 ? round2(existing.totalSpent / existing.paidOrders) : 0;
        if (at < existing.firstOrderAt) existing.firstOrderAt = at;
        if (at > existing.lastOrderAt) existing.lastOrderAt = at;
        if (!existing.city && o.cityId) existing.city = o.cityId;
        if (existing.label === id) existing.label = maskContact(o.contact) ?? id;
    }

    return [...byClient.values()].sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
}

export interface OrderMonth {
    month: string; // 'YYYY-MM'
    orders: number;
    /** Collected money in that month (paid orders). */
    revenue: number;
}

/** Monthly series over the order timeline (see `orderAt`), oldest first. */
export function ordersByMonth(orders: OrderLike[]): OrderMonth[] {
    const map = new Map<string, OrderMonth>();
    for (const o of orders) {
        const month = orderAt(o).slice(0, 7);
        const row = map.get(month) ?? { month, orders: 0, revenue: 0 };
        row.orders++;
        if (isOrderPaid(o)) row.revenue = round2(row.revenue + orderAmount(o));
        map.set(month, row);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** Orders whose timeline falls in the last `days` (inclusive), relative to `nowIso`. */
export function ordersWithinLastDays(orders: OrderLike[], days: number, nowIso: string): OrderLike[] {
    const cutoff = new Date(new Date(nowIso).getTime() - days * 86_400_000).toISOString();
    return orders.filter(o => orderAt(o) >= cutoff);
}

export interface OrderFunnelStep {
    /** 'confirmed' | 'completed' | 'paid' */
    stage: Exclude<OrderLikeStatus, 'canceled'>;
    /** Orders that reached this stage or beyond (canceled never counts as reached). */
    reached: number;
    /** Share of the booked orders that got this far, 0..100 (1 decimal). */
    pct: number;
}

/**
 * The FULFILMENT funnel — booked → done → paid, over real orders.
 *
 * This is not the acquisition funnel (the contract carries no browsing/booking stages);
 * it is what happens to an order after it exists. `completed` and `paid` both imply the
 * job was done, and `paid` implies completion, so the steps are cumulative. Canceled
 * orders are excluded from `reached` and reported separately by `orderKpis`.
 */
export function orderFunnel(orders: OrderLike[]): OrderFunnelStep[] {
    const live = orders.filter(o => o.status !== 'canceled');
    const booked = live.length;
    const done = live.filter(o => o.status === 'completed' || o.status === 'paid').length;
    const paid = live.filter(o => isOrderPaid(o)).length;
    const pct = (n: number) => (booked > 0 ? round1((n / booked) * 100) : 0);
    return [
        { stage: 'confirmed', reached: booked, pct: pct(booked) },
        { stage: 'completed', reached: done, pct: pct(done) },
        { stage: 'paid', reached: paid, pct: pct(paid) },
    ];
}
