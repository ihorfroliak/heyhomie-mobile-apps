/**
 * Contract tests for the OrderGateway. Adapter-agnostic: the order lifecycle is
 * run against BOTH the Local adapter and the Http adapter (backed by an
 * in-process fake of the real orders service). No import of bookingStore here —
 * proves the UI's dependency is testable without touching storage internals.
 * Run with: npx -y tsx packages/api/gateway.test.ts
 */
import { localOrderGateway, type OrderGateway } from './orderGateway';
import { makeHttpOrderGateway } from './httpOrderGateway';
import { fakeOrderBackend } from './fakeBackend';
import { memoryKeyValueStore } from './preferences';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));
/** Flush the async chain so stream-reconciled state is settled before asserting. */
const tick = () => new Promise<void>(r => setTimeout(r, 0));

/**
 * The order lifecycle — asserted against the interface only, tick-based so it
 * works for a sync (Local) or eventually-consistent (Http/SSE) adapter alike.
 */
async function runOrderLifecycle(gw: OrderGateway, tag: string) {
    await gw.init(memoryKeyValueStore());
    await tick();

    // submit → get → state consistency
    const r1 = await gw.submitOrder({ contact: { phone: '600 111 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    const id = r1.draft.id;
    await tick();
    eq(`[${tag}] submit → confirmed`, gw.getOrder(id)?.status, 'confirmed');
    ok(`[${tag}] snapshot includes it`, gw.ordersSnapshot().some(o => o.id === id));
    ok(`[${tag}] getOrder matches snapshot entry`, JSON.stringify(gw.getOrder(id)) === JSON.stringify(gw.ordersSnapshot().find(o => o.id === id)));

    // confirm is idempotent (twice → still confirmed)
    gw.confirmOrder(id); gw.confirmOrder(id);
    await tick();
    eq(`[${tag}] confirm idempotent`, gw.getOrder(id)?.status, 'confirmed');

    // complete → settlement chain intact (payment due)
    gw.completeOrder(id, '2025-06-01T14:00:00.000Z');
    await tick();
    eq(`[${tag}] complete → completed`, gw.getOrder(id)?.status, 'completed');
    eq(`[${tag}] payment due after complete`, gw.getOrder(id)?.payment?.status, 'due');

    // settle → paid (card auto-charge), idempotent
    await gw.settleOrder(id, '2025-06-02T03:00:00.000Z');
    await tick();
    eq(`[${tag}] settle → paid`, gw.getOrder(id)?.status, 'paid');
    await gw.settleOrder(id, '2025-06-02T03:00:00.000Z');
    await tick();
    eq(`[${tag}] settle idempotent`, gw.getOrder(id)?.status, 'paid');

    // cancel → transition correctness, idempotent
    const r2 = await gw.submitOrder({ contact: { phone: '600 222 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    gw.cancelOrder(r2.draft.id); gw.cancelOrder(r2.draft.id);
    await tick();
    eq(`[${tag}] cancel → canceled`, gw.getOrder(r2.draft.id)?.status, 'canceled');

    // markPaid → order settled by admin
    const r3 = await gw.submitOrder({ contact: { phone: '600 333 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    gw.markPaid(r3.draft.id);
    await tick();
    eq(`[${tag}] markPaid → paid`, gw.getOrder(r3.draft.id)?.status, 'paid');

    // change feed: a subscriber fires on mutation
    let events = 0;
    const unsub = gw.subscribe(() => { events += 1; });
    const before = events;
    await gw.submitOrder({ contact: { phone: '600 555 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    ok(`[${tag}] change feed emits on mutation`, events > before);
    unsub();

    // reactive snapshot is a STABLE reference between reads
    ok(`[${tag}] snapshot stable ref`, gw.ordersSnapshot() === gw.ordersSnapshot());

    // ── contract v2: the visit slot and site round-trip, identically per adapter ──
    const v2 = await gw.submitOrder({
        contact: { phone: '600 777 000' },
        cityId: 'krakow',
        serviceId: 'standard_cleaning',
        scheduledAt: '2026-08-16T06:00:00.000Z',
        site: { line1: '  ul. Karmelicka 14  ', flat: '3', floor: '2', access: 'code', entryCode: '4821', city: 'Kraków', notes: 'Cat hides' },
    });
    await tick();
    const v2Order = gw.getOrder(v2.draft.id);
    eq(`[${tag}] v2 scheduledAt projects back`, v2Order?.scheduledAt, '2026-08-16T06:00:00.000Z');
    eq(`[${tag}] v2 site line1 is trimmed`, v2Order?.site?.line1, 'ul. Karmelicka 14');
    eq(`[${tag}] v2 site access survives`, v2Order?.site?.access, 'code');
    eq(`[${tag}] v2 site entry code survives`, v2Order?.site?.entryCode, '4821');
    eq(`[${tag}] v2 site note survives`, v2Order?.site?.notes, 'Cat hides');
    ok(`[${tag}] v2 scheduledAt is not updatedAt`, v2Order?.scheduledAt !== v2Order?.updatedAt);
    // …and survive a state transition (transitions must not drop payload fields).
    gw.completeOrder(v2.draft.id, '2026-08-16T10:00:00.000Z');
    await tick();
    eq(`[${tag}] v2 slot survives a transition`, gw.getOrder(v2.draft.id)?.scheduledAt, '2026-08-16T06:00:00.000Z');
    eq(`[${tag}] v2 site survives a transition`, gw.getOrder(v2.draft.id)?.site?.line1, 'ul. Karmelicka 14');

    // An order booked WITHOUT them stays undefined — never defaulted from updatedAt.
    const bare = await gw.submitOrder({ contact: { phone: '600 888 000' }, cityId: 'krakow', serviceId: 'standard_cleaning' });
    await tick();
    eq(`[${tag}] v2 absent slot stays absent`, gw.getOrder(bare.draft.id)?.scheduledAt, undefined);
    eq(`[${tag}] v2 absent site stays absent`, gw.getOrder(bare.draft.id)?.site, undefined);
}

async function main() {
    // Same lifecycle, two adapters — the drop-in guarantee. The fake carries a
    // session AuthContext (one tenant), transparent to the gateway/contract.
    await runOrderLifecycle(localOrderGateway, 'local');
    const devAuth = { userId: 'u-test', tenantId: 't-test', role: 'admin' as const };
    const http = makeHttpOrderGateway(fakeOrderBackend(devAuth));
    await runOrderLifecycle(http, 'http');

    // Leads are out of the orders-backend scope; local keeps the funnel op.
    const lead = await localOrderGateway.captureLead({ phone: '600 444 000', serviceId: 'office_cleaning', cityId: 'warszawa' });
    ok('local captures leads', localOrderGateway.leadsSnapshot().some(l => l.id === lead.id));
    let httpLeadRejected = false;
    try { await http.captureLead({ phone: '1', serviceId: 'office_cleaning', cityId: 'warszawa' }); } catch { httpLeadRejected = true; }
    ok('http rejects leads (out of scope)', httpLeadRejected);

    console.log(`\n${passed} passed, ${fail.length} failed`);
    if (fail.length) { fail.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
    console.log('All gateway contract tests passed.');
}

main();
