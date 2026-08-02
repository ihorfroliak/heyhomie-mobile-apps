/** Run with: npx -y tsx packages/domain/orderAnalytics.test.ts
 *  Admin KPIs computed from real contract orders — money, statuses, per-client rollups,
 *  monthly series. Only what an order genuinely carries (no invented mission fields). */
import { orderKpis, orderClientProfiles, ordersByMonth, ordersWithinLastDays, orderAt, maskContact, isOrderPaid, type OrderLike } from './orderAnalytics';
import type { PaymentIntent } from './payment';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const pay = (amount: number, status: PaymentIntent['status'], extra: Partial<PaymentIntent> = {}): PaymentIntent => ({
    id: 'pay', orderId: 'o', method: 'card', status, provider: 'stripe', createdAt: '2026-01-01T00:00:00.000Z', amount, currency: 'PLN', ...extra,
});

const o = (id: string, status: OrderLike['status'], amount: number, updatedAt: string, clientId?: string, extra: Partial<OrderLike> = {}): OrderLike => ({
    id, status, updatedAt, clientId, payment: pay(amount, status === 'paid' ? 'paid' : 'awaiting_completion'), ...extra,
});

// ---- KPIs ----
const set: OrderLike[] = [
    o('1', 'paid', 219, '2026-05-02T10:00:00.000Z', 'c1'),
    o('2', 'paid', 359, '2026-05-10T10:00:00.000Z', 'c1'),
    o('3', 'completed', 269, '2026-05-12T10:00:00.000Z', 'c2'),
    o('4', 'confirmed', 189, '2026-06-01T10:00:00.000Z', 'c3'),
    o('5', 'canceled', 200, '2026-06-02T10:00:00.000Z', 'c3'),
];
const k = orderKpis(set);
eq('counts by status', [k.total, k.paid, k.completed, k.confirmed, k.canceled], [5, 2, 1, 1, 1]);
eq('revenue = paid only', k.revenue, 578); // 219 + 359
eq('outstanding = completed + confirmed', k.outstanding, 458); // 269 + 189
eq('canceled money is NOT counted', k.revenue + k.outstanding, 1036); // 200 excluded
eq('avgOrder over paid orders', k.avgOrder, 289); // 578 / 2
eq('cancel rate %', k.cancelRate, 20);
eq('currency picked up', k.currency, 'PLN');

const empty = orderKpis([]);
eq('empty set is all zeros', [empty.total, empty.revenue, empty.avgOrder, empty.cancelRate], [0, 0, 0, 0]);
eq('missing amount counts as 0', orderKpis([{ id: 'x', status: 'paid', updatedAt: '2026-01-01T00:00:00.000Z' }]).revenue, 0);

// ---- payment-status fallback ----
ok('paid via payment.status too', isOrderPaid({ id: 'p', status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z', payment: pay(100, 'paid') }));
ok('awaiting_completion is not paid', !isOrderPaid(set[2]));

// ---- timeline ----
eq('orderAt prefers paidAt', orderAt({ id: 't', status: 'paid', updatedAt: '2026-05-09T00:00:00.000Z', payment: pay(10, 'paid', { paidAt: '2026-05-03T00:00:00.000Z' }) }), '2026-05-03T00:00:00.000Z');
eq('orderAt falls back to updatedAt', orderAt(set[3]), '2026-06-01T10:00:00.000Z');

// ---- client profiles ----
const profiles = orderClientProfiles(set);
eq('one row per client', profiles.length, 3);
const c1 = profiles.find(p => p.id === 'c1')!;
eq('c1 lifetime value (paid only)', c1.totalSpent, 578);
eq('c1 order + paid counts', [c1.orders, c1.paidOrders], [2, 2]);
eq('c1 avg over paid orders', c1.avgOrder, 289);
eq('c1 first/last span', [c1.firstOrderAt, c1.lastOrderAt], ['2026-05-02T10:00:00.000Z', '2026-05-10T10:00:00.000Z']);
const c2 = profiles.find(p => p.id === 'c2')!;
eq('unpaid client spends 0', [c2.totalSpent, c2.paidOrders, c2.avgOrder], [0, 0, 0]);
ok('sorted by most recent activity', profiles[0].lastOrderAt >= profiles[profiles.length - 1].lastOrderAt);
eq('orders without a clientId are skipped', orderClientProfiles([o('9', 'paid', 100, '2026-05-01T00:00:00.000Z')]).length, 0);

// ---- contact masking (no raw PII in the label) ----
eq('email masked', maskContact({ email: 'marek@wp.pl' }), 'm***@wp.pl');
eq('phone masked to last 4', maskContact({ phone: '+48123456789' }), '…6789');
eq('no contact → undefined', maskContact(undefined), undefined);
eq('label falls back to the id', orderClientProfiles([o('1', 'paid', 10, '2026-05-01T00:00:00.000Z', 'c9')])[0].label, 'c9');
eq('label uses the masked email', orderClientProfiles([o('1', 'paid', 10, '2026-05-01T00:00:00.000Z', 'c9', { contact: { email: 'ana@x.pl' } })])[0].label, 'a***@x.pl');

// ---- monthly series ----
const months = ordersByMonth(set);
eq('two months, oldest first', months.map(m => m.month), ['2026-05', '2026-06']);
eq('may: 3 orders, 578 collected', [months[0].orders, months[0].revenue], [3, 578]);
eq('june: 2 orders, nothing collected', [months[1].orders, months[1].revenue], [2, 0]);

// ---- windowing ----
// cutoff = 2026-05-06, so order 1 (05-02) drops out and order 2 (05-10) stays.
eq('last 30 days from 2026-06-05', ordersWithinLastDays(set, 30, '2026-06-05T00:00:00.000Z').map(x => x.id), ['2', '3', '4', '5']);
eq('last 7 days keeps only June', ordersWithinLastDays(set, 7, '2026-06-05T00:00:00.000Z').map(x => x.id), ['4', '5']);
eq('last 365 days keeps everything', ordersWithinLastDays(set, 365, '2026-06-05T00:00:00.000Z').length, 5);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) {
    fail.forEach(f => console.log('  FAIL: ' + f));
    process.exit(1);
}
console.log('All order-analytics tests passed.');
