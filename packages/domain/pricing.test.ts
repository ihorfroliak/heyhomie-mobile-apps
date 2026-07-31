/** Run with: npx -y tsx packages/domain/pricing.test.ts
 *  Canonical cleaning prices — must match heyhomie-shared/DOMAIN_RULES.md §1–§7 and the
 *  web calculator exactly (same worked examples the web engine is verified against). */
import { cleaningPrice, CLEANING_PRICE_TABLE, CLEANING_PRICES, ADDON_PRICE } from './pricing';

let passed = 0;
const fail: string[] = [];
const ok = (n: string, c: boolean) => (c ? passed++ : fail.push(n));
const eq = (n: string, got: unknown, exp: unknown) => (JSON.stringify(got) === JSON.stringify(exp) ? passed++ : fail.push(`${n} (got ${JSON.stringify(got)}, expected ${JSON.stringify(exp)})`));

const total = (i: Parameters<typeof cleaningPrice>[0]) => cleaningPrice(i).total;

// DOMAIN_RULES §1.2 worked examples (gear on site → no fee)
eq('standard 2r/1b once', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: true }), 219);
eq('general 2r/1b once', total({ plan: 'general', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: true }), 359);
// §2 frequency discount: round(219*0.85)=186
eq('standard weekly -15%', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'weekly', gearOnSite: true }), 186);
// §7 gear fee: standard one-off, no gear → +15 = 234
eq('standard once +gear', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: false }), 234);
// §7 general never charges gear
eq('general no gear fee', total({ plan: 'general', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: false }), 359);
// §7 standard cyclic: 15 until the 10th visit, free after
eq('standard weekly visit 3 +gear', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'weekly', gearOnSite: false, visitIndex: 3 }), 201);
eq('standard weekly visit 11 free gear', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'weekly', gearOnSite: false, visitIndex: 11 }), 186);
// §3 add-on: standard + 2 windows (25*2=50) → 219+50=269
eq('standard +2 windows', total({ plan: 'standard', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: true, addOns: { windows: 2 } }), 269);
// §3 included-in-general add-on contributes 0 on general (oven is already included)
eq('general hides oven cost', total({ plan: 'general', rooms: 2, bathrooms: 1, frequency: 'once', gearOnSite: true, addOns: { oven: 1 } }), 359);
// flat add-on ignores quantity >1 (counts as 1)
eq('flat add-on counts once', total({ plan: 'standard', rooms: 1, bathrooms: 1, frequency: 'once', gearOnSite: true, addOns: { balcony: 5 } }), 119 + 30 + 40 + 30);

// breakdown shape + discount line
const r = cleaningPrice({ plan: 'general', rooms: 3, bathrooms: 2, frequency: 'biweekly', gearOnSite: true, addOns: { windows: 4 } });
ok('undiscounted > total under discount', r.undiscounted > r.total && r.discountPln > 0);
ok('breakdown has a negative discount line', r.lines.some(l => l.id === 'discount' && l.value < 0));
ok('breakdown base line = plan base', r.lines[0].id === 'base' && r.lines[0].value === CLEANING_PRICES.general.base);

// canon table (what the server serves)
eq('table standard base', CLEANING_PRICE_TABLE.plans.standard.base, 119);
eq('table currency PLN', CLEANING_PRICE_TABLE.currency, 'PLN');
eq('table has all 10 add-on prices', Object.keys(ADDON_PRICE).length, 10);
eq('windows add-on price', CLEANING_PRICE_TABLE.addOns.windows, 25);

console.log(`\n${passed} passed, ${fail.length} failed`);
if (fail.length) {
    fail.forEach(f => console.log('  FAIL: ' + f));
    process.exit(1);
}
console.log('All pricing tests passed.');
