/**
 * Shared state for the ported booking flow (/booking/service → /booking/size → …).
 *
 * The steps are separate routes, so the choices travel as URL params. These helpers
 * are the one place that parses them, so every step reads the same defaults and a
 * hand-typed or stale URL can never put a screen into an impossible state.
 */
import { CLEANING_FREQUENCIES, FREQ_MULT, type CleaningFrequency, type CleaningPlan } from '@heyhomie/domain';

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
