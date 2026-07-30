/**
 * HeyHomie design tokens — shared across client, worker and admin apps.
 * Single source of truth for the brand look so every surface stays consistent.
 */

// Brand tokens migrated to the shared canon (heyhomie-shared/BRAND.md, 2026-07):
// the refreshed web palette is now the single brand for all four surfaces. Keys are
// kept (426 refs across apps/ui) — only the values changed. Canon name in comments.
export const colors = {
    // Brand
    primary: '#141338', // ink — text & primary surfaces (was #14133A)
    salad: '#77ECC8', // mint — primary CTA (canon 'mint'; was #36F0C7)
    pink: '#EB4E87', // accent / highlights (was #FF3C87)
    blue: '#414483', // indigo — links, icons, admin accent (was #5465FC)
    grey: '#52516B', // slate — secondary text (was #727189)
    bgLight: '#F6FBFF', // light surface / fills (was #F4F7FF)
    white: '#FFFFFF',
    border: '#EDEEEF', // (was #E7EBF6)
    yellow: '#F4D779', // canon extra — badges / highlights
    peri: '#C8CFF0', // canon extra — periwinkle tint

    // Semantic
    success: '#1D9E75',
    warning: '#EF9F27',
    danger: '#E24B4A',
    info: '#5465FC',

    // Mission status (maps to Go API statuses)
    status: {
        searching_homie: '#854F0B',
        homie_found: '#0F6E56',
        in_progress: '#185FA5',
        done: '#444441',
        canceled: '#A32D2D',
        unpaid: '#A32D2D',
        freezed: '#727189',
    },
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radii = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

// Canon type (heyhomie-shared/BRAND.md): Manrope everywhere, Montserrat wordmark.
// NOTE: no font is bundled in the apps yet (nothing calls expo-font/useFonts), so
// these currently fall back to the system font — same as Quicksand/Lato did before.
// To actually render Manrope: add @expo-google-fonts/manrope + useFonts in _layout.
export const typography = {
    fontHeading: 'Manrope', // was 'Quicksand'
    fontBody: 'Manrope', // was 'Lato'
    fontAccent: 'Montserrat', // logo wordmark ("homie")
    sizes: { caption: 11, small: 13, body: 15, h3: 17, h2: 22, h1: 28 },
    weights: { regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' },
} as const;

export const shadow = {
    card: {
        shadowColor: '#436CCB',
        shadowOpacity: 0.2,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
    },
} as const;

export type MissionStatusColorKey = keyof typeof colors.status;
