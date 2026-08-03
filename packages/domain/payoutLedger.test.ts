/** Run with: npx -y tsx packages/domain/payoutLedger.test.ts
 *  The worker payout ledger — amounts from the order price, the pending→approved→paid
 *  lifecycle with its terminal guards, and the money rollups the admin screens read. */
import {
    jobPayoutAmount,
    periodOf,
    approvePayout,
    payPayout,
    cancelPayout,
    isTerminalPayout,
    payoutTotals,
    workerPayoutSummaries,
    payoutsInPeriod,
    type PayoutEntry,
} from './payoutLedger';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const AT = '2026-08-03T10:00:00.000Z';
const e = (over: Partial<PayoutEntry> = {}): PayoutEntry => ({
    id: 'p1', workerId: 'w1', workerType: 'employee', orderId: 'o1', kind: 'job',
    amount: 153, period: '2026-08', status: 'pending', createdAt: AT, ...over,
});

// ---- amount from the order price ----
eq('employee earns 70% of the order', jobPayoutAmount(219, 'employee'), 153); // 219*0.7 = 153.3 → 153
eq('b2b earns 60%', jobPayoutAmount(219, 'b2b'), 131); // 131.4 → 131
eq('admin override wins', jobPayoutAmount(219, 'employee', 180), 180);
eq('override is rounded + never negative', jobPayoutAmount(219, 'employee', -50), 0);
eq('zero-price order pays zero', jobPayoutAmount(0, 'employee'), 0);
eq('period is YYYY-MM', periodOf('2026-08-03T10:00:00.000Z'), '2026-08');

// ---- lifecycle ----
const pending = e();
const approved = approvePayout(pending, AT);
eq('pending → approved', [approved.status, approved.approvedAt], ['approved', AT]);
const paid = payPayout(approved, AT);
eq('approved → paid', [paid.status, paid.paidAt], ['paid', AT]);

ok('approving twice is a no-op (same reference)', approvePayout(approved, AT) === approved);
ok('paying a PENDING entry is refused — approval is the control', payPayout(pending, AT) === pending);
ok('paying twice is a no-op', payPayout(paid, AT) === paid);
ok('paid is terminal — cancel refused', cancelPayout(paid, AT) === paid);
ok('approving a paid entry is refused', approvePayout(paid, AT) === paid);

const canceled = cancelPayout(pending, AT);
eq('pending → canceled', canceled.status, 'canceled');
eq('an approved entry can still be canceled', cancelPayout(approved, AT).status, 'canceled');
ok('canceled is terminal', cancelPayout(canceled, AT) === canceled && approvePayout(canceled, AT) === canceled);
ok('terminal check', isTerminalPayout('paid') && isTerminalPayout('canceled') && !isTerminalPayout('pending') && !isTerminalPayout('approved'));

// ---- totals ----
const ledger: PayoutEntry[] = [
    e({ id: 'a', amount: 153, status: 'paid' }),
    e({ id: 'b', amount: 131, status: 'approved' }),
    e({ id: 'c', amount: 100, status: 'pending' }),
    e({ id: 'd', amount: 999, status: 'canceled' }),
    e({ id: 'f', amount: -30, kind: 'adjustment', orderId: undefined, status: 'approved' }),
];
const t = payoutTotals(ledger);
eq('paid total', t.paid, 153);
eq('approved total includes a negative adjustment', t.approved, 101); // 131 - 30
eq('pending total', t.pending, 100);
eq('owed = pending + approved', t.owed, 201);
ok('canceled money is excluded from every bucket', t.paid + t.approved + t.pending === 354);
eq('empty ledger is all zeros', payoutTotals([]), { pending: 0, approved: 0, paid: 0, owed: 0, count: 0 });

// ---- per-worker ----
const multi: PayoutEntry[] = [
    e({ id: '1', workerId: 'w1', amount: 100, status: 'approved' }),
    e({ id: '2', workerId: 'w1', amount: 50, status: 'paid' }),
    e({ id: '3', workerId: 'w2', workerType: 'b2b', amount: 400, status: 'pending' }),
    e({ id: '4', workerId: 'w2', workerType: 'b2b', amount: 60, kind: 'bonus', orderId: undefined, status: 'pending' }),
];
const sums = workerPayoutSummaries(multi);
eq('one row per worker', sums.length, 2);
eq('biggest outstanding first', sums[0].workerId, 'w2'); // 460 owed vs 100
eq('w2 owed', sums[0].totals.owed, 460);
eq('w2 job count excludes the bonus', sums[0].jobs, 1);
eq('worker type carried through', sums[0].workerType, 'b2b');
eq('w1 owed / paid split', [sums[1].totals.owed, sums[1].totals.paid], [100, 50]);
eq('canceled jobs are not counted as jobs', workerPayoutSummaries([e({ status: 'canceled' })])[0].jobs, 0);

// ---- period filter ----
eq('period filter', payoutsInPeriod([e({ id: 'x', period: '2026-07' }), e({ id: 'y', period: '2026-08' })], '2026-08').map(x => x.id), ['y']);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) {
    fail.forEach(f => console.log('  FAIL: ' + f));
    process.exit(1);
}
console.log('All payout-ledger tests passed.');
