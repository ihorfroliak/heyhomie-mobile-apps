/**
 * HeyHomie — canonical cleaning PRICE model.
 *
 * Single source of truth for cleaning prices, matching heyhomie-shared/DOMAIN_RULES.md
 * §1–§7 and the web calculator (heyhomie-web `lib/cleaning/calculator.js`) exactly, so
 * every surface shows the SAME price for the same order. The server exposes this table
 * over `GET /pricing/cleaning`; the apps compute with `cleaningPrice(...)`.
 *
 * This supersedes the older "pricing is on the Rails backend" note in cleaning.ts:
 * the canon now lives here (the shared TS domain), per the DOMAIN_RULES decision.
 * Pure + framework-free → unit-tested in the gate. Amounts are integer PLN.
 */
import { addOnsFor, type AddOnId, type CleaningPlan } from './cleaning';

export type CleaningFrequency = 'once' | 'weekly' | 'biweekly' | 'monthly';

/** §1.1 — base (kitchen + hallway) + per-room + per-bathroom, by plan. PLN. */
export const CLEANING_PRICES: Record<CleaningPlan, { base: number; room: number; bath: number }> = {
    standard: { base: 119, room: 30, bath: 40 },
    general: { base: 194, room: 50, bath: 65 },
};

/** §2 — frequency multiplier applied to the clean (not to add-ons / gear). */
export const FREQ_MULT: Record<CleaningFrequency, number> = {
    once: 1,
    weekly: 0.85,
    biweekly: 0.9,
    monthly: 0.95,
};

/** §3 — add-on prices (PLN). Structure (id/inGeneral/time/qty) lives in cleaning.ts. */
export const ADDON_PRICE: Record<AddOnId, number> = {
    oven: 40,
    fridge: 35,
    hood: 45,
    cabinets: 35,
    microwave: 25,
    bins: 20,
    balcony: 30,
    windows: 25,
    ironing: 45,
    hours: 55,
};

/** §7 — gear (vacuum/mop/bucket) fee: standard only; cyclic waives it after the 10th. */
export const GEAR_FEE = 15;
export const FREE_GEAR_AFTER = 10;

export interface CleaningPriceInput {
    plan: CleaningPlan;
    rooms: number;
    bathrooms: number;
    frequency: CleaningFrequency;
    /** { addOnId: quantity }. Non-qty add-ons count as 1 when > 0. */
    addOns?: Partial<Record<AddOnId, number>>;
    /** Customer already has cleaning gear on site → no gear fee. */
    gearOnSite?: boolean;
    /** 1-based visit number in a cyclic plan (for the gear-fee waiver). */
    visitIndex?: number;
}

export interface CleaningPriceLine {
    id: string; // 'base' | 'rooms' | 'baths' | <AddOnId> | 'gear' | 'discount'
    qty?: number;
    value: number; // PLN (negative for the discount line)
}

export interface CleaningPriceResult {
    /** PLN after the frequency discount — what the customer pays this visit. */
    total: number;
    /** PLN before the discount (for a struck-through original). */
    undiscounted: number;
    discountPln: number;
    cleanBase: number;
    addOnsCost: number;
    gearFee: number;
    lines: CleaningPriceLine[];
}

/**
 * Canonical price for a booking. Mirrors the web engine: the frequency discount applies
 * to the clean only; add-ons and the gear fee are charged at face value. Add-ons already
 * covered by a general clean (`includedInGeneral`) contribute nothing on general.
 */
export function cleaningPrice(input: CleaningPriceInput): CleaningPriceResult {
    const type = CLEANING_PRICES[input.plan] ?? CLEANING_PRICES.standard;
    const mult = FREQ_MULT[input.frequency] ?? 1;
    const rooms = Math.max(0, input.rooms || 0);
    const baths = Math.max(0, input.bathrooms || 0);

    const roomsCost = rooms * type.room;
    const bathsCost = baths * type.bath;
    const cleanBase = type.base + roomsCost + bathsCost;

    // Only add-ons offered on this plan can contribute (general hides its included ones).
    const visible = addOnsFor(input.plan);
    const sel = input.addOns ?? {};
    const active = visible
        .map(a => ({ a, qty: a.pricing === 'flat' ? (Number(sel[a.id]) > 0 ? 1 : 0) : Math.max(0, Number(sel[a.id]) || 0) }))
        .filter(x => x.qty > 0);
    const addOnsCost = active.reduce((s, x) => s + ADDON_PRICE[x.a.id] * x.qty, 0);

    // Gear fee: general always free; standard one-off +15; standard cyclic until the 10th.
    let gearFee = 0;
    if (!input.gearOnSite && input.plan !== 'general') {
        const cyclic = input.frequency !== 'once';
        const past10 = cyclic && (input.visitIndex || 1) > FREE_GEAR_AFTER;
        if (!past10) gearFee = GEAR_FEE;
    }

    const discountedClean = Math.round(cleanBase * mult);
    const total = discountedClean + addOnsCost + gearFee;
    const undiscounted = cleanBase + addOnsCost + gearFee;

    const lines: CleaningPriceLine[] = [{ id: 'base', value: type.base }];
    if (rooms > 0) lines.push({ id: 'rooms', qty: rooms, value: roomsCost });
    if (baths > 0) lines.push({ id: 'baths', qty: baths, value: bathsCost });
    for (const x of active) lines.push({ id: x.a.id, qty: x.a.pricing === 'flat' ? undefined : x.qty, value: ADDON_PRICE[x.a.id] * x.qty });
    if (gearFee > 0) lines.push({ id: 'gear', value: gearFee });
    if (mult < 1) lines.push({ id: 'discount', value: -(cleanBase - discountedClean) });

    return { total, undiscounted, discountPln: undiscounted - total, cleanBase, addOnsCost, gearFee, lines };
}

/** The serializable canon table the server returns over `GET /pricing/cleaning`. */
export const CLEANING_PRICE_TABLE = {
    currency: 'PLN',
    plans: CLEANING_PRICES,
    frequency: FREQ_MULT,
    addOns: ADDON_PRICE,
    gearFee: GEAR_FEE,
    freeGearAfter: FREE_GEAR_AFTER,
} as const;
