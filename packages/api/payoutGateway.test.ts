/** Run with: npx -y tsx packages/api/payoutGateway.test.ts
 *  The payout gateway the admin UI talks to: snapshot/subscribe wiring, the ledger
 *  surviving a reload (persisted repo), and tenancy never reaching the UI. */
import { makeLocalPayoutGateway, PAYOUTS_KEY } from './payoutGateway';
import { memoryKeyValueStore } from './preferences';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

void (async () => {
    const kv = memoryKeyValueStore();
    const gw = makeLocalPayoutGateway();
    await gw.init(kv);

    eq('starts empty', gw.snapshot().length, 0);

    let notified = 0;
    const unsub = gw.subscribe(() => notified++);

    const job = await gw.createForJob({ workerId: 'w1', workerType: 'employee', orderId: 'o1', orderAmount: 219 });
    eq('job amount comes from the order price + rate', job.amount, 153);
    eq('snapshot updated', gw.snapshot().length, 1);
    ok('subscribers were notified', notified > 0);
    ok('the UI never sees tenancy or the version', !('tenantId' in job) && !('version' in job));

    // lifecycle through the gateway
    eq('approve', (await gw.approve(job.id))?.status, 'approved');
    eq('pay', (await gw.pay(job.id))?.status, 'paid');
    eq('snapshot reflects the final status', gw.snapshot()[0].status, 'paid');

    const bonus = await gw.createAdjustment({ workerId: 'w1', workerType: 'employee', kind: 'bonus', amount: 100 });
    eq('bonus has no order link', bonus.orderId, undefined);
    eq('newest first', gw.snapshot()[0].id, bonus.id);

    unsub();
    const before = notified;
    await gw.createForJob({ workerId: 'w2', workerType: 'b2b', orderId: 'o2', orderAmount: 219 });
    eq('unsubscribed listeners stop firing', notified, before);

    // ---- the ledger survives a reload (this is why the repo is persisted) ----
    ok('the store actually holds the ledger', !!(await kv.getItem(PAYOUTS_KEY)));
    const revived = makeLocalPayoutGateway();
    await revived.init(kv);
    eq('all three entries came back', revived.snapshot().length, 3);
    eq('the paid entry stayed paid', revived.snapshot().find(p => p.id === job.id)?.status, 'paid');
    eq('the double-pay guard survives too', await revived.createForJob({ workerId: 'w9', workerType: 'employee', orderId: 'o1', orderAmount: 219 }).then(() => 'created').catch(e => (e as { internalCode?: string }).internalCode), 'CONFLICT');

    // ---- a corrupted entry must not crash the admin ----
    const badKv = memoryKeyValueStore();
    await badKv.setItem(PAYOUTS_KEY, '{not json');
    const safe = makeLocalPayoutGateway();
    await safe.init(badKv);
    eq('corrupted storage → empty ledger, no throw', safe.snapshot().length, 0);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) {
        fail.forEach(f => console.log('  FAIL: ' + f));
        process.exit(1);
    }
    console.log('All payout-gateway tests passed.');
})();
