/**
 * Simulated production data — a realistic book of business for demos and for
 * developing screens that would otherwise be empty.
 *
 * There is no live database yet, so every screen that reads real orders has nothing
 * to show. This generates a plausible Kraków cleaning business: ~24 households, most
 * of them on a fortnightly cycle (the product's most common cadence), each with a
 * history of visits that are paid, done-but-unpaid, upcoming or occasionally canceled.
 *
 * It writes the SAME store shape the app persists, so it flows through the normal
 * gateway — no special "demo mode" branch in the UI. Deterministic by default (seeded
 * PRNG) so screenshots and numbers stay stable between runs.
 */
import { CLEANING_PRICES, FREQ_MULT, type CleaningFrequency } from '../domain';
import type { KeyValueStore } from './preferences';

const STORE_KEY = 'heyhomie.orders.v1';

/** Small deterministic PRNG (mulberry32) — same seed, same book of business. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const FIRST = ['Marek', 'Anna', 'Piotr', 'Katarzyna', 'Tomasz', 'Agnieszka', 'Paweł', 'Magdalena', 'Michał', 'Joanna', 'Krzysztof', 'Ewa', 'Jakub', 'Zofia', 'Andrzej', 'Alicja', 'Rafał', 'Natalia', 'Bartosz', 'Karolina', 'Łukasz', 'Monika', 'Grzegorz', 'Julia'];
const LAST = ['Nowak', 'Kowalski', 'Wiśniewski', 'Wójcik', 'Kowalczyk', 'Kamiński', 'Lewandowski', 'Zieliński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski'];
const DISTRICTS = ['Stare Miasto', 'Kazimierz', 'Podgórze', 'Krowodrza', 'Nowa Huta', 'Grzegórzki', 'Bronowice', 'Dębniki'];
const STREETS = ['Długa', 'Karmelicka', 'Starowiślna', 'Józefa', 'Kalwaryjska', 'Mogilska', 'Zwierzyniecka', 'Lea', 'Wielicka', 'Rakowicka'];

/** Cadence mix — fortnightly dominates, as the product assumes. */
const CADENCE: { freq: CleaningFrequency; weight: number; everyDays: number }[] = [
    { freq: 'biweekly', weight: 55, everyDays: 14 },
    { freq: 'weekly', weight: 15, everyDays: 7 },
    { freq: 'monthly', weight: 15, everyDays: 30 },
    { freq: 'once', weight: 15, everyDays: 0 },
];

const pick = <T,>(r: () => number, arr: T[]): T => arr[Math.floor(r() * arr.length)];

function pickCadence(r: () => number) {
    const total = CADENCE.reduce((s, c) => s + c.weight, 0);
    let n = r() * total;
    for (const c of CADENCE) {
        n -= c.weight;
        if (n <= 0) return c;
    }
    return CADENCE[0];
}

export interface DemoSeedOptions {
    /** Households to generate (default 24). */
    clients?: number;
    /** "Today" — history is generated backwards and a little forwards from here. */
    now?: Date;
    seed?: number;
}

interface SeedAccount { id: string; phone: string; email: string; firstName: string; lastName: string; createdAt: string; verifiedVia: 'phone' }
interface SeedDraft { id: string; clientId: string; contact: { phone: string; email: string }; cityId: string; serviceId: string; stage: string; updatedAt: string; scheduledAt: string; estValue: number }
interface SeedPayment { id: string; orderId: string; method: string; status: string; provider: string; createdAt: string; amount: number; currency: string; completedAt?: string; paidAt?: string }

export interface DemoSeedData {
    accounts: SeedAccount[];
    drafts: SeedDraft[];
    leads: unknown[];
    payments: SeedPayment[];
    canceled: string[];
}

/**
 * Build the book of business. Visits before "now" are settled (mostly paid, some
 * still awaiting payment); the next visit of each cycle sits in the future as an
 * upcoming booking, which is what the client app's "next cleaning" reads.
 */
export function buildDemoSeed(opts: DemoSeedOptions = {}): DemoSeedData {
    const r = rng(opts.seed ?? 20260804);
    const count = opts.clients ?? 24;
    const now = opts.now ?? new Date();

    const accounts: SeedAccount[] = [];
    const drafts: SeedDraft[] = [];
    const payments: SeedPayment[] = [];
    const canceled: string[] = [];

    for (let i = 0; i < count; i++) {
        const firstName = FIRST[i % FIRST.length];
        const lastName = pick(r, LAST);
        const clientId = `cl-${String(i + 1).padStart(2, '0')}`;
        const phone = `+486${String(Math.floor(r() * 90000000) + 10000000)}`;
        const email = `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/[^a-z]/g, '')}@example.pl`;
        const cadence = pickCadence(r);

        // Household shape drives the price via the canonical table.
        const rooms = 1 + Math.floor(r() * 4);
        const baths = 1 + Math.floor(r() * 2);
        const plan = r() < 0.25 ? 'general' : 'standard';
        const t = CLEANING_PRICES[plan];
        const base = t.base + rooms * t.room + baths * t.bath;
        const price = Math.round(base * FREQ_MULT[cadence.freq]);

        // How long they've been a customer, and therefore how many visits exist.
        const monthsActive = 1 + Math.floor(r() * 8);
        const joined = new Date(now.getTime() - monthsActive * 30 * 86400000);
        accounts.push({
            id: clientId,
            phone,
            email,
            firstName,
            lastName,
            createdAt: joined.toISOString().slice(0, 10),
            verifiedVia: 'phone',
        });

        const visits = cadence.everyDays === 0 ? 1 : Math.max(1, Math.floor((monthsActive * 30) / cadence.everyDays));
        const city = 'krakow';
        const serviceId = plan === 'general' ? 'general_cleaning' : 'standard_cleaning';

        for (let v = 0; v < visits; v++) {
            // Walk backwards from the most recent visit.
            const daysAgo = cadence.everyDays === 0 ? Math.floor(r() * 60) : v * cadence.everyDays + Math.floor(r() * 3);
            const at = new Date(now.getTime() - daysAgo * 86400000);
            const id = `ord-${clientId}-${v}`;

            // ~6% of visits were called off; the rest are settled or awaiting payment.
            const isCanceled = r() < 0.06;
            const isPaid = !isCanceled && r() < 0.82;
            const isDone = !isCanceled && !isPaid && r() < 0.5;

            drafts.push({
                id,
                clientId,
                contact: { phone, email },
                cityId: city,
                serviceId,
                stage: 'confirmed',
                updatedAt: at.toISOString(),
                // Contract v2: the visit instant is its own field. For a past visit it
                // coincides with `updatedAt`, but the two are no longer the same idea —
                // the analytics screens key off `updatedAt`, the client app off this.
                scheduledAt: at.toISOString(),
                estValue: price,
            });
            if (isCanceled) canceled.push(id);

            const paidAt = new Date(at.getTime() + 20 * 3600000).toISOString();
            payments.push({
                id: `pay-${id}`,
                orderId: id,
                method: r() < 0.75 ? 'card' : 'pay_later',
                status: isCanceled ? 'awaiting_completion' : isPaid ? 'paid' : isDone ? 'due' : 'awaiting_completion',
                provider: 'stripe',
                createdAt: at.toISOString(),
                amount: price,
                currency: 'PLN',
                ...(isPaid ? { completedAt: at.toISOString(), paidAt } : {}),
                ...(isDone ? { completedAt: at.toISOString() } : {}),
            });
        }

        // The upcoming visit for anyone on a cycle — this is the client app's "next cleaning".
        if (cadence.everyDays > 0) {
            const nextAt = new Date(now.getTime() + (1 + Math.floor(r() * cadence.everyDays)) * 86400000);
            const id = `ord-${clientId}-next`;
            drafts.push({
                id,
                clientId,
                contact: { phone, email },
                cityId: city,
                serviceId,
                stage: 'confirmed',
                // The booking was made now; the visit is in the future. Before contract
                // v2 this row had to lie in `updatedAt` to make the client app show an
                // upcoming visit at all.
                updatedAt: now.toISOString(),
                scheduledAt: nextAt.toISOString(),
                estValue: price,
            });
            payments.push({
                id: `pay-${id}`,
                orderId: id,
                method: 'card',
                status: 'awaiting_completion',
                provider: 'stripe',
                createdAt: nextAt.toISOString(),
                amount: price,
                currency: 'PLN',
            });
        }
    }

    return { accounts, drafts, leads: [], payments, canceled };
}

/** A one-line summary for logs/dev screens. */
export function describeDemoSeed(d: DemoSeedData): string {
    const paid = d.payments.filter(p => p.status === 'paid').length;
    const revenue = d.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
    return `${d.accounts.length} clients · ${d.drafts.length} orders · ${paid} paid (${revenue} PLN) · ${d.canceled.length} canceled`;
}

/**
 * Write the simulated book into the app's store. Call BEFORE `orderGateway.init(kv)`.
 * Existing data is left alone unless `force` is set, so a demo never overwrites work.
 */
export async function seedDemoStore(kv: KeyValueStore, opts: DemoSeedOptions & { force?: boolean } = {}): Promise<boolean> {
    const existing = await kv.getItem(STORE_KEY);
    if (existing && !opts.force) return false;
    await kv.setItem(STORE_KEY, JSON.stringify(buildDemoSeed(opts)));
    return true;
}
