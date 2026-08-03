/** Run with: npx -y tsx packages/api/payoutService.test.ts
 *  The authoritative payout service: creation rules, the approve→pay lifecycle,
 *  tenant isolation, the double-pay guard, and exactly-once under concurrency. */
import { makePayoutService, memoryPayoutRepo } from './payoutService';
import type { AuthContext } from './auth';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
const throws = async (n: string, code: string, fn: () => Promise<unknown>) => {
    try {
        await fn();
        fail.push(`${n} (expected ${code}, but it resolved)`);
    } catch (e) {
        const c = (e as { internalCode?: string }).internalCode;
        c === code ? passed++ : fail.push(`${n} (expected ${code}, got ${c})`);
    }
};

const authA: AuthContext = { userId: 'u1', tenantId: 't1', role: 'admin' };
const authB: AuthContext = { userId: 'u2', tenantId: 't2', role: 'admin' };

void (async () => {
    const svc = makePayoutService(memoryPayoutRepo());

    // ---- creation ----
    const job = await svc.createForJob({ workerId: 'w1', workerType: 'employee', orderId: 'o1', orderAmount: 219 }, authA);
    eq('job pays the employee share of the order', job.amount, 153);
    eq('starts pending', job.status, 'pending');
    eq('kind + order link', [job.kind, job.orderId], ['job', 'o1']);
    ok('period is set from creation time', /^\d{4}-\d{2}$/.test(job.period));
    ok('tenant is stamped server-side', job.tenantId === 't1');

    const b2b = await svc.createForJob({ workerId: 'w2', workerType: 'b2b', orderId: 'o2', orderAmount: 219 }, authA);
    eq('b2b share differs', b2b.amount, 131);
    const over = await svc.createForJob({ workerId: 'w3', workerType: 'employee', orderId: 'o3', orderAmount: 219, override: 200 }, authA);
    eq('admin override wins', over.amount, 200);

    // the double-pay guard — the whole point of the ledger
    await throws('the same order cannot be paid twice', 'CONFLICT', () => svc.createForJob({ workerId: 'w9', workerType: 'employee', orderId: 'o1', orderAmount: 219 }, authA));
    // …but a cancelled entry frees the order again
    await svc.cancel(over.id, authA);
    const redo = await svc.createForJob({ workerId: 'w3', workerType: 'employee', orderId: 'o3', orderAmount: 100 }, authA);
    ok('a cancelled payout frees its order for a new one', redo.orderId === 'o3' && redo.status === 'pending');

    // validation
    await throws('workerId is required', 'VALIDATION_FAILED', () => svc.createForJob({ workerId: '', workerType: 'employee', orderId: 'o9', orderAmount: 100 }, authA));
    await throws('a zero adjustment is refused', 'VALIDATION_FAILED', () => svc.createAdjustment({ workerId: 'w1', workerType: 'employee', kind: 'adjustment', amount: 0 }, authA));
    await throws('a negative bonus is refused', 'VALIDATION_FAILED', () => svc.createAdjustment({ workerId: 'w1', workerType: 'employee', kind: 'bonus', amount: -10 }, authA));
    const deduction = await svc.createAdjustment({ workerId: 'w1', workerType: 'employee', kind: 'adjustment', amount: -30, note: 'lost key' }, authA);
    eq('an adjustment may be negative', deduction.amount, -30);
    ok('an adjustment has no order link', deduction.orderId === undefined);

    // ---- lifecycle ----
    const approved = await svc.approve(job.id, authA);
    eq('pending → approved', approved.status, 'approved');
    ok('version bumped on write', approved.version > job.version);
    const paidEntry = await svc.pay(job.id, authA);
    eq('approved → paid', paidEntry.status, 'paid');
    ok('approving again is a no-op (no version bump)', (await svc.approve(job.id, authA)).version === paidEntry.version);
    ok('paying a pending entry is refused by the transition', (await svc.pay(b2b.id, authA)).status === 'pending');

    // ---- tenant isolation ----
    eq('another tenant sees none of these', (await svc.list(authB)).length, 0);
    eq('own tenant sees its ledger', (await svc.list(authA)).length, 5); // o1, o2, o3(cancelled), o3(redo), adjustment
    await throws('cross-tenant approve is denied', 'FORBIDDEN_TENANT_ACCESS', () => svc.approve(job.id, authB));
    await throws('a missing id is denied the same way (no existence leak)', 'FORBIDDEN_TENANT_ACCESS', () => svc.approve('po-nope', authA));
    ok('cross-tenant get is invisible', (await svc.get(job.id, authB)) === undefined);

    // ---- concurrency: parallel approves must apply exactly once ----
    const race = await svc.createForJob({ workerId: 'w5', workerType: 'employee', orderId: 'o5', orderAmount: 300 }, authA);
    const results = await Promise.all([svc.approve(race.id, authA), svc.approve(race.id, authA), svc.approve(race.id, authA)]);
    ok('all parallel approves succeed', results.every(r => r.status === 'approved'));
    const settled = await svc.get(race.id, authA);
    eq('exactly one write applied (version 2)', settled?.version, 2);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All payout-service tests passed.');
})();
