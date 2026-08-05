/**
 * Shared state for the ported booking flow (/booking/service → /booking/size → …).
 *
 * The steps are separate routes, so the choices travel as URL params. These helpers
 * are the one place that parses them, so every step reads the same defaults and a
 * hand-typed or stale URL can never put a screen into an impossible state.
 */
import {
    accessMethod,
    addOns,
    arrivalSlot,
    bookableDates,
    CLEANING_FREQUENCIES,
    FREQ_MULT,
    VISIT_NOTES_MAX,
    type AccessMethodId,
    type AddOnId,
    type ArrivalSlotId,
    type CleaningFrequency,
    type CleaningPlan,
} from '@heyhomie/domain';

/** The catalog's cleaning cadences, narrowed to the ones the price table prices. */
export const BOOKING_FREQUENCIES: CleaningFrequency[] = CLEANING_FREQUENCIES.filter(
    (f): f is CleaningFrequency => f in FREQ_MULT,
);

/** expo-router hands back `string | string[]`; take the first value either way. */
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export const parsePlan = (v: string | string[] | undefined): CleaningPlan => (first(v) === 'general' ? 'general' : 'standard');

export const parseFrequency = (v: string | string[] | undefined): CleaningFrequency => {
    const raw = first(v);
    return BOOKING_FREQUENCIES.find(f => f === raw) ?? 'once';
};

/** A whole-number room count, clamped at `min` — never NaN, never zero rooms. */
export const parseCount = (v: string | string[] | undefined, fallback: number, min = 1): number => {
    const n = Number(first(v));
    return Number.isFinite(n) ? Math.max(min, Math.floor(n)) : fallback;
};

/** The catalog service a cleaning plan maps to. */
export const serviceIdFor = (plan: CleaningPlan): string => (plan === 'general' ? 'general_cleaning' : 'standard_cleaning');

/** Today as a local `YYYY-MM-DD` — toISOString would shift the day across timezones. */
export const todayYmd = (d: Date = new Date()): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A booking day, accepted only if it is still one the calendar actually offers. */
export const parseDate = (v: string | string[] | undefined, days: string[] = bookableDates(todayYmd())): string =>
    days.find(d => d === first(v)) ?? days[0] ?? todayYmd();

export const parseSlot = (v: string | string[] | undefined): ArrivalSlotId => (arrivalSlot(first(v) ?? '')?.id ?? 'morning');

export const parseAccess = (v: string | string[] | undefined): AccessMethodId => (accessMethod(first(v) ?? '')?.id ?? 'meet');

/** Free text off a URL, trimmed to the domain's cap so a long note can't overflow. */
export const parseText = (v: string | string[] | undefined, max = VISIT_NOTES_MAX): string => (first(v) ?? '').slice(0, max);

const ADD_ON_IDS = new Set<string>(addOns.map(a => a.id));

/**
 * Add-on selections travel as `oven:1,windows:3`. Unknown ids and junk quantities
 * are dropped rather than trusted — the price is computed from whatever survives.
 */
export const parseAddOns = (v: string | string[] | undefined): Partial<Record<AddOnId, number>> => {
    const out: Partial<Record<AddOnId, number>> = {};
    for (const part of (first(v) ?? '').split(',')) {
        const [id, qty] = part.split(':');
        if (!ADD_ON_IDS.has(id)) continue;
        const n = Math.floor(Number(qty));
        if (Number.isFinite(n) && n > 0) out[id as AddOnId] = n;
    }
    return out;
};

export const formatAddOns = (sel: Partial<Record<AddOnId, number>>): string =>
    Object.entries(sel)
        .filter(([, q]) => Number(q) > 0)
        .map(([id, q]) => `${id}:${q}`)
        .join(',');
