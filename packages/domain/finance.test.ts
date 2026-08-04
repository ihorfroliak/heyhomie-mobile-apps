/** Run with: npx -y tsx packages/domain/finance.test.ts */
import { liveFinanceReport, isVatExempt, netFromGross, grossFromNet, vatAmount, orderMargin, totalExpenses, emptyExpenses, monthlyReport, reportsByMonth, dateRange, withinRange, sumExpensesInRange, financeReportForRange, type MonthlyExpenses } from './finance';
import { payoutRateFor } from './payouts';
import type { Mission } from './missions';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const mk = (over: Partial<Mission>): Mission =>
    ({
        id: 'm',
        status: 'done',
        plan: 'standard',
        params: { rooms: 1, kitchens: 1, bathrooms: 1 },
        addOns: [],
        scheduledAt: '2025-05-01',
        durationMinutes: 180,
        travelBufferMinutes: 15,
        workerCount: 1,
        address: { id: 'a', name: 'H', line1: 'x', zipCode: '0', city: 'krakow' },
        client: { id: 'c', firstName: 'A' },
        price: 200,
        currency: 'PLN',
        ...over,
    }) as Mission;

// VAT
ok('exempt below threshold', isVatExempt(100000));
ok('not exempt above threshold', !isVatExempt(300000));
eq('net = gross at 0%', netFromGross(200, 0), 200);
eq('net from gross at 23%', netFromGross(123, 23), 100);
eq('vat amount at 23%', vatAmount(123, 23), 23);
eq('gross from net at 8%', grossFromNet(100, 8), 108);

// order margin — price 200 gross, 0% VAT, homie paid 120 → margin 80 (40%)
const m1 = orderMargin(200, 0, 120);
eq('order margin PLN', m1.marginPln, 80);
eq('order margin %', m1.marginPct, 40);

// expenses
const exp: MonthlyExpenses = { ...emptyExpenses(), accountant: 500, onlineServices: 200, contractorPay: 3000, taxes: 800, socialContributions: 1600 };
eq('total expenses', totalExpenses(exp), 6100);

// monthly report — 2 done missions @200 each, homie payout = 70% of price = 140 each
const rep = monthlyReport([mk({ id: 'a', price: 200 }), mk({ id: 'b', price: 200 })], exp, 0);
eq('orders', rep.orders, 2);
eq('revenue gross', rep.revenueGross, 400);
eq('revenue net (0% VAT)', rep.revenueNet, 400);
eq('avg check', rep.avgCheck, 200);
eq('worker payouts (70%)', rep.workerPayouts, 280);
eq('gross margin', rep.grossMargin, 120);
eq('gross margin %', rep.grossMarginPct, 30);
eq('net profit (delta) = margin − expenses', rep.netProfit, 120 - 6100);

// payout rate by worker type
eq('employee payout rate', payoutRateFor('employee'), 0.7);
eq('b2b payout rate', payoutRateFor('b2b'), 0.6);

// monthly trend
const months = reportsByMonth([mk({ id: 'a', status: 'done', scheduledAt: '2025-04-10', price: 200 }), mk({ id: 'b', status: 'done', scheduledAt: '2025-05-10', price: 200 }), mk({ id: 'c', status: 'done', scheduledAt: '2025-05-20', price: 200 })], 0);
eq('two months, sorted', months.map(x => x.month), ['2025-04', '2025-05']);
eq('may orders', months[1].orders, 2);
eq('may net revenue', months[1].revenueNet, 400);
eq('may gross margin (400 − 280)', months[1].grossMargin, 120);

// periods
eq('month range', dateRange('month', '2025-05-15'), { start: '2025-05-01', end: '2025-05-31' });
eq('quarter range (Q2)', dateRange('quarter', '2025-05-15'), { start: '2025-04-01', end: '2025-06-30' });
eq('year range', dateRange('year', '2025-05-15'), { start: '2025-01-01', end: '2025-12-31' });

const rangeMissions = [mk({ id: 'r1', status: 'done', scheduledAt: '2025-04-10', price: 100 }), mk({ id: 'r2', status: 'done', scheduledAt: '2025-05-10', price: 100 }), mk({ id: 'r3', status: 'done', scheduledAt: '2025-08-10', price: 100 })];
eq('withinRange keeps Q2 only', withinRange(rangeMissions, '2025-04-01', '2025-06-30').map(m => m.id), ['r1', 'r2']);

const byMonth = {
    '2025-04': { ...emptyExpenses(), accountant: 100 },
    '2025-05': { ...emptyExpenses(), accountant: 200 },
    '2025-08': { ...emptyExpenses(), accountant: 999 },
};
eq('sumExpensesInRange (Q2) excludes August', sumExpensesInRange(byMonth, '2025-04-01', '2025-06-30').accountant, 300);

const rangeRep = financeReportForRange(rangeMissions, byMonth, 0, { start: '2025-04-01', end: '2025-06-30' });
eq('range report revenue (Q2)', rangeRep.revenueGross, 200);
eq('range report expenses (Q2)', rangeRep.expenses, 300);


// ---- LIVE margin: real orders + real payout ledger + entered expenses ----
{
    const pay = (amount: number, status: 'paid' | 'awaiting_completion') => ({
        id: 'p', orderId: 'o', method: 'card' as const, status, provider: 'stripe' as const,
        createdAt: '2026-08-01T00:00:00.000Z', amount, currency: 'PLN',
    });
    const ord = (id: string, status: 'paid' | 'completed' | 'canceled', amount: number) => ({
        id, status, updatedAt: '2026-08-01T00:00:00.000Z', payment: pay(amount, status === 'paid' ? 'paid' : 'awaiting_completion'),
    });
    const po = (id: string, amount: number, status: 'pending' | 'approved' | 'paid' | 'canceled') => ({
        id, workerId: 'w1', workerType: 'employee' as const, orderId: id, kind: 'job' as const,
        amount, period: '2026-08', status, createdAt: '2026-08-01T00:00:00.000Z',
    });

    const orders = [ord('o1', 'paid', 219), ord('o2', 'paid', 359), ord('o3', 'completed', 269), ord('o4', 'canceled', 500)];
    const payouts = [po('a', 153, 'paid'), po('b', 251, 'approved'), po('c', 100, 'pending'), po('d', 999, 'canceled')];
    const exp = { ...emptyExpenses(), accountant: 200 };
    const r = liveFinanceReport({ orders, payouts, expenses: exp });

    eq('live: revenue counts only collected money', r.revenueGross, 578); // 219 + 359
    eq('live: billable-but-unpaid is reported separately', r.outstanding, 269);
    eq('live: canceled orders contribute nothing', r.revenueGross + r.outstanding, 847);
    eq('live: paid order count', r.paidOrders, 2);
    eq('live: worker cost is ACCRUED (paid + owed)', r.workerPayouts, 504); // 153 + 251 + 100
    eq('live: settled payouts tracked separately', r.payoutsSettled, 153);
    eq('live: canceled payouts cost nothing', r.workerPayouts, 504);
    eq('live: gross margin = net revenue − worker cost', r.grossMargin, 74); // 578 - 504
    eq('live: net profit = margin − expenses', r.netProfit, -126); // 74 - 200
    eq('live: margin %', r.grossMarginPct, 12.8);
    const vatted = liveFinanceReport({ orders, payouts, expenses: exp, vat: 23 });
    ok('live: VAT lowers net revenue and margin', vatted.revenueNet < r.revenueNet && vatted.grossMargin < r.grossMargin);
    const empty = liveFinanceReport({ orders: [], payouts: [], expenses: emptyExpenses() });
    eq('live: empty period is zeros, no divide-by-zero', [empty.revenueGross, empty.grossMargin, empty.grossMarginPct, empty.netProfitPct], [0, 0, 0, 0]);
}

console.log(`
${passed} passed, ${fail.length} failed`);
if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
console.log('All finance tests passed.');
