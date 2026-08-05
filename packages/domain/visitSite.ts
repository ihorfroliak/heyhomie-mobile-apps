/**
 * Where the cleaning happens, and how the homie gets in.
 *
 * Two things the booking flow has to establish before a visit can be planned: the
 * exact flat, and the way in when nobody is home. Kept apart from `Address` in
 * missions.ts — that one is a saved address book entry, this is what a single
 * booking states about one visit (including a one-off entry code and a note).
 *
 * Pure + framework-free, pl/en/uk. Validation is deliberately forgiving about
 * formatting (Polish street addresses are written a dozen ways) and strict only
 * where getting it wrong means the homie stands outside the door.
 */
import type { Localized } from './cleaning';

const L = (pl: string, en: string, uk: string): Localized => ({ pl, en, uk });

export type AccessMethodId = 'meet' | 'keys' | 'code';

export interface AccessMethod {
    id: AccessMethodId;
    label: Localized;
    /** What we still need from the client for this option to work. */
    hint: Localized;
    /** True when the option is useless without an entry code. */
    requiresCode: boolean;
}

export const ACCESS_METHODS: AccessMethod[] = [
    {
        id: 'meet',
        label: L('Będę w domu i otworzę', "I'll be home to let them in", 'Буду вдома і відчиню'),
        hint: L('Zadzwonimy przed przyjazdem.', 'We ring before arriving.', 'Зателефонуємо перед приїздом.'),
        requiresCode: false,
    },
    {
        id: 'keys',
        label: L('Klucze są u konsjerża', 'Keys are with the concierge', 'Ключі у консьєржа'),
        hint: L('Homie odbierze i odda klucze na recepcji.', 'Your homie collects and returns the keys at reception.', 'Виконавець забере й поверне ключі на рецепції.'),
        requiresCode: false,
    },
    {
        id: 'code',
        label: L('Podam kod do drzwi', "I'll share an entry code", 'Дам код від дверей'),
        hint: L('Kod jest potrzebny przed wizytą.', 'The code is needed before the visit.', 'Код потрібен до візиту.'),
        requiresCode: true,
    },
];

export const accessMethod = (id: string): AccessMethod | undefined => ACCESS_METHODS.find(a => a.id === id);

/** Free-text note to the homie, capped so it stays readable on a job card. */
export const VISIT_NOTES_MAX = 300;

export interface VisitSite {
    /** Street and number — the one field a visit cannot happen without. */
    line1: string;
    flat?: string;
    floor?: string;
    entryCode?: string;
    city?: string;
    access: AccessMethodId;
    notes?: string;
}

export interface VisitSiteCheck {
    valid: boolean;
    /** A street name AND a number — "Karmelicka" alone does not locate a flat. */
    line1Valid: boolean;
    /** The chosen access method needs a code and none was given. */
    codeMissing: boolean;
    notesValid: boolean;
}

const hasDigit = (s: string) => /\d/.test(s);

export function validateVisitSite(site: Partial<VisitSite>): VisitSiteCheck {
    const line1 = (site.line1 ?? '').trim();
    const line1Valid = line1.length >= 4 && hasDigit(line1);
    const method = accessMethod(site.access ?? '');
    const codeMissing = !!method?.requiresCode && !(site.entryCode ?? '').trim();
    const notesValid = (site.notes ?? '').length <= VISIT_NOTES_MAX;
    return { valid: line1Valid && !codeMissing && notesValid, line1Valid, codeMissing, notesValid };
}

/** Field caps, so a hostile or fat-fingered value cannot bloat a stored order. */
export const VISIT_LINE_MAX = 200;
export const VISIT_SHORT_MAX = 24;

const clamp = (v: string | undefined, max: number): string | undefined => {
    const t = (v ?? '').trim().slice(0, max);
    return t.length > 0 ? t : undefined;
};

/**
 * Trim + cap every field and drop the empties, so what gets stored on an order is
 * the same whichever surface submitted it. Unknown access ids fall back to `meet`
 * rather than persisting a value no screen can render.
 */
export function normalizeVisitSite(site: Partial<VisitSite>): VisitSite {
    return {
        line1: clamp(site.line1, VISIT_LINE_MAX) ?? '',
        flat: clamp(site.flat, VISIT_SHORT_MAX),
        floor: clamp(site.floor, VISIT_SHORT_MAX),
        entryCode: clamp(site.entryCode, VISIT_SHORT_MAX),
        city: clamp(site.city, VISIT_SHORT_MAX * 4),
        access: accessMethod(site.access ?? '')?.id ?? 'meet',
        notes: clamp(site.notes, VISIT_NOTES_MAX),
    };
}

/**
 * What actually gets stored on an order: the normalized site, or nothing at all when
 * there is no street to store. A site without `line1` locates no one, and an empty
 * one would render as a blank Address row — absent is the honest state.
 */
export const toStoredVisitSite = (site: Partial<VisitSite> | undefined): VisitSite | undefined => {
    if (!site) return undefined;
    const normalized = normalizeVisitSite(site);
    return normalized.line1 ? normalized : undefined;
};

/** One line for a summary row: "ul. Karmelicka 14, flat 3, floor 2 · Kraków". */
export function formatVisitSite(site: Partial<VisitSite>): string {
    const parts = [(site.line1 ?? '').trim()];
    if (site.flat?.trim()) parts.push(`flat ${site.flat.trim()}`);
    if (site.floor?.trim()) parts.push(`floor ${site.floor.trim()}`);
    const street = parts.filter(Boolean).join(', ');
    return site.city?.trim() ? `${street} · ${site.city.trim()}` : street;
}
