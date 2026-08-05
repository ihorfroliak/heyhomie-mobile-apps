/**
 * Scheduling for recurring services — generating occurrences and the two kinds
 * of reschedule the product needs, plus the late-cancellation penalty.
 *
 * Two reschedule modes (client- or admin-initiated, same logic):
 *  A. shiftSeries   — move a visit and RE-SYNC the whole cadence from the new
 *                     date (e.g. bump a biweekly visit by a week → the next one
 *                     is +2 weeks from the moved date, not the original).
 *  B. moveOccurrence — nudge a SINGLE visit (an hour/day earlier or later)
 *                     without touching the rest of the cycle.
 * Plus skipOccurrence — cancel one visit from the cycle (…on, on, off, on…).
 *
 * Also owns WHEN a visit can be booked in the first place: the arrival windows a
 * client picks from, and the range of days that are open for booking.
 *
 * Pure date math on ISO strings; tested.
 */
import type { Localized } from './cleaning';
import type { Frequency } from './missions';

const round2 = (n: number) => Math.round(n * 100) / 100;

const addDays = (iso: string, n: number): string => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString();
};
/**
 * Add months, clamping the day to the target month's length: a monthly visit
 * booked on Jan 31 recurs on Feb 28 (29 in leap years), not Mar 3 — naive
 * setUTCMonth would overflow "Feb 31" into March and silently drift the series.
 */
const addMonths = (iso: string, n: number): string => {
    const d = new Date(iso);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + n);
    const daysInTarget = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, daysInTarget));
    return d.toISOString();
};
const isWeekend = (iso: string): boolean => {
    const day = new Date(iso).getUTCDay();
    return day === 0 || day === 6;
};

/**
 * The next visit date after `iso` for an interval cadence. Returns null for
 * 'once'. twice/thrice-week use approximate intervals; the exact weekday pattern
 * is chosen at booking and confirmed by the backend.
 */
export function nextOccurrence(iso: string, freq: Frequency): string | null {
    switch (freq) {
        case 'weekly':
            return addDays(iso, 7);
        case 'biweekly':
            return addDays(iso, 14);
        case 'monthly':
            return addMonths(iso, 1);
        case 'every_other_day':
            return addDays(iso, 2);
        case 'thrice_week':
            return addDays(iso, 2); // ~3×/week
        case 'twice_week':
            return addDays(iso, 3); // ~2×/week
        case 'every_workday': {
            let next = addDays(iso, 1);
            while (isWeekend(next)) next = addDays(next, 1);
            return next;
        }
        case 'once':
        default:
            return null;
    }
}

/** The first `count` occurrences starting at (and including) `anchorIso`. */
export function generateOccurrences(anchorIso: string, freq: Frequency, count: number): string[] {
    const out = [anchorIso];
    let cur = anchorIso;
    for (let i = 1; i < count; i++) {
        const next = nextOccurrence(cur, freq);
        if (!next) break;
        out.push(next);
        cur = next;
    }
    return out;
}

/**
 * Reschedule mode A. Move the visit at `index` to `newIso`, then regenerate all
 * LATER visits from it by the cadence — full re-sync. Earlier visits untouched.
 */
export function shiftSeries(occurrences: string[], index: number, newIso: string, freq: Frequency): string[] {
    if (index < 0 || index >= occurrences.length) return occurrences;
    const out = occurrences.slice(0, index);
    out.push(newIso);
    let cur = newIso;
    for (let i = index + 1; i < occurrences.length; i++) {
        const next = nextOccurrence(cur, freq);
        if (!next) break;
        out.push(next);
        cur = next;
    }
    return out;
}

/** Reschedule mode B. Move only the visit at `index`; the rest of the cycle stays. */
export function moveOccurrence(occurrences: string[], index: number, newIso: string): string[] {
    return occurrences.map((o, i) => (i === index ? newIso : o));
}

/** Cancel a single visit from the cycle (the others keep their dates). */
export function skipOccurrence(occurrences: string[], index: number): string[] {
    return occurrences.filter((_, i) => i !== index);
}

/* ------------------------------------------------------------------ */
/* Booking a visit — arrival windows and the open days                 */
/* ------------------------------------------------------------------ */

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

export type ArrivalSlotId = 'morning' | 'midday' | 'afternoon' | 'evening';

/**
 * A three-hour window the homie arrives inside — not an exact start time, because
 * the previous visit's real duration moves the day around.
 */
export interface ArrivalSlot {
    id: ArrivalSlotId;
    label: Localized;
    /** Display string for the window. */
    window: string;
    /** Local hour the window opens / closes (24h). */
    startHour: number;
    endHour: number;
}

export const ARRIVAL_SLOTS: ArrivalSlot[] = [
    { id: 'morning', label: L('Rano', 'Morning', 'Зранку'), window: '08:00 – 11:00', startHour: 8, endHour: 11 },
    { id: 'midday', label: L('W południe', 'Midday', 'Опівдні'), window: '11:00 – 14:00', startHour: 11, endHour: 14 },
    { id: 'afternoon', label: L('Po południu', 'Afternoon', 'Вдень'), window: '14:00 – 17:00', startHour: 14, endHour: 17 },
    { id: 'evening', label: L('Wieczorem', 'Evening', 'Ввечері'), window: '17:00 – 20:00', startHour: 17, endHour: 20 },
];

export const arrivalSlot = (id: string): ArrivalSlot | undefined => ARRIVAL_SLOTS.find(s => s.id === id);

/** Earliest a visit can be booked: tomorrow — today never has crew left to plan. */
export const BOOKING_LEAD_DAYS = 1;
/** How far ahead the booking calendar goes. */
export const BOOKING_HORIZON_DAYS = 14;

/**
 * The days open for booking, as `YYYY-MM-DD`, starting `leadDays` after `fromYmd`.
 *
 * Takes and returns plain calendar dates rather than instants: a booking day is
 * what the client sees on their wall, so anchoring at UTC noon keeps the arithmetic
 * clear of the ±1 day that timezone offsets would otherwise introduce.
 */
export function bookableDates(fromYmd: string, count: number = BOOKING_HORIZON_DAYS, leadDays: number = BOOKING_LEAD_DAYS): string[] {
    const base = new Date(`${fromYmd}T12:00:00Z`);
    if (Number.isNaN(base.getTime())) return [];
    const out: string[] = [];
    for (let i = 0; i < Math.max(0, count); i++) {
        const d = new Date(base);
        d.setUTCDate(d.getUTCDate() + leadDays + i);
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}

/**
 * The instant a booked visit starts: the calendar day plus the window's opening
 * hour, read in the running device's timezone (a Kraków booking is made in Kraków
 * time). Returns an ISO instant, which is what `scheduledAt` carries.
 */
export function arrivalStartIso(ymd: string, slotId: string): string | undefined {
    const slot = arrivalSlot(slotId);
    if (!slot) return undefined;
    const [y, m, d] = ymd.split('-').map(Number);
    if (!y || !m || !d) return undefined;
    const at = new Date(y, m - 1, d, slot.startHour, 0, 0, 0);
    return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

export const CANCELLATION_WINDOW_HOURS = 24;
export const CANCELLATION_FEE_RATE = 0.5; // 50%

/** Hours between now and a scheduled start (negative if already past). */
export const hoursUntil = (scheduledIso: string, nowIso: string): number =>
    round2((new Date(scheduledIso).getTime() - new Date(nowIso).getTime()) / 3_600_000);

/** A full cancellation is "late" if it lands inside the 24h window. */
export const isLateCancellation = (scheduledIso: string, nowIso: string): boolean =>
    hoursUntil(scheduledIso, nowIso) < CANCELLATION_WINDOW_HOURS;

/**
 * Fee for cancelling a visit. A within-cycle reschedule (moving a single visit
 * to a nearby slot) is exempt — only a FULL cancellation < 24h before start is
 * charged 50%.
 */
export function cancellationFee(scheduledIso: string, nowIso: string, price: number, opts: { isReschedule?: boolean } = {}): number {
    if (opts.isReschedule) return 0;
    return isLateCancellation(scheduledIso, nowIso) ? round2(price * CANCELLATION_FEE_RATE) : 0;
}
