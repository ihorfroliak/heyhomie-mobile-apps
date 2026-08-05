import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import {
    checklistFor,
    cleaningPrice,
    formatMoney,
    frequencyLabel,
    goodToKnow,
    heavyWorkNote,
    serviceName,
    tr,
    FREQ_MULT,
    type CleaningFrequency,
    type CleaningPlan,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { BOOKING_FREQUENCIES, serviceIdFor } from '../../lib/bookingFlow';
import { track } from '../../lib/analytics';

/**
 * Booking step 1 — "What do you need?" — ported from the "HeyHomie Client ·
 * Booking Flow v1" design (the `isService` block).
 *
 * Same rule as the Home port: layout, spacing, radii and type sizes are taken 1:1
 * from the design markup, but COLOURS resolve through the design tokens rather than
 * the hexes in that file (it predates the brand refresh in heyhomie-shared/BRAND.md).
 *
 * Everything factual is canon, not the design's placeholder numbers: the "from"
 * prices come from `cleaningPrice` (heyhomie-shared DOMAIN_RULES §1–§2), the
 * frequency savings are derived from `FREQ_MULT`, and the room-by-room panel is the
 * real scope-of-service checklist. The design file still carries the old 79/129
 * price table — the canon (119/194) wins.
 */

const STEPS = 5;

const PLANS: CleaningPlan[] = ['standard', 'general'];

/** What the checklist below actually covers on the selected plan. */
const PLAN_NOTE: Record<CleaningPlan, string> = {
    standard: 'Standard cleaning covers the tasks below. Switch to Deep for the insides of cupboards, oven, fridge and hood.',
    general: 'Deep cleaning covers every task below, including the ones only a general clean reaches.',
};

/** A save badge derived from the canonical multiplier — never a hardcoded percent. */
const saveLabel = (f: CleaningFrequency): string => {
    const mult = FREQ_MULT[f];
    return mult < 1 ? `save ${Math.round((1 - mult) * 100)}%` : '';
};

export default function BookingService() {
    const locale = useLocale() as Locale;
    const router = useRouter();

    const [plan, setPlan] = useState<CleaningPlan>('standard');
    const [frequency, setFrequency] = useState<CleaningFrequency>('once');
    const [includedOpen, setIncludedOpen] = useState(false);

    /**
     * The "from" price: the smallest real home (1 room + 1 bathroom; kitchen and
     * hallway are folded into the base) at the cadence the client has picked, so the
     * save badge actually moves the number. Gear is excluded — it depends on what the
     * client already has at home, and is settled at checkout.
     */
    const priceFrom = (p: CleaningPlan): string =>
        formatMoney(cleaningPrice({ plan: p, rooms: 1, bathrooms: 1, frequency, gearOnSite: true }).total, 'PLN', locale);

    const included = useMemo(
        () => checklistFor(plan).map(a => ({
            id: a.id,
            room: tr(a.label, locale),
            count: `${a.items.length} tasks`,
            items: a.items.map(i => `• ${tr(i.label, locale)}`).join('\n'),
        })),
        [plan, locale],
    );

    const pickPlan = (p: CleaningPlan, serviceId: string) => {
        setPlan(p);
        track({ name: 'funnel_step', stage: 'service_selected', serviceId });
    };

    const onContinue = () => {
        track({ name: 'funnel_step', stage: 'scope_selected', serviceId: serviceIdFor(plan) });
        router.push({ pathname: '/booking/size', params: { plan, frequency } });
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── header + progress ── */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Pressable
                        style={styles.back}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.eyebrow}>Step 1 of {STEPS}</Txt>
                        <Txt style={styles.title}>What do you need?</Txt>
                    </View>
                </View>
                <View style={styles.progress}>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <View key={i} style={[styles.bar, i === 0 && styles.barOn]} />
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                {/* ── plans ── */}
                <View style={styles.plans}>
                    {PLANS.map(p => {
                        const on = p === plan;
                        const serviceId = serviceIdFor(p);
                        return (
                            <Pressable
                                key={p}
                                style={[styles.planCard, on && styles.planCardOn]}
                                onPress={() => pickPlan(p, serviceId)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${serviceName(serviceId, locale)}, from ${priceFrom(p)}`}
                            >
                                <View style={styles.planTop}>
                                    <Txt style={styles.planName}>{serviceName(serviceId, locale)}</Txt>
                                    <Txt style={styles.planFrom}>from {priceFrom(p)}</Txt>
                                </View>
                                <Txt style={styles.planBlurb}>
                                    {p === 'general'
                                        ? 'Everything in a standard clean, plus the insides of cupboards, oven, fridge and hood, grout and deep-set dirt.'
                                        : 'The everyday reset — floors, surfaces, kitchen and bathroom, bins out, beds made.'}
                                </Txt>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── what's included, room by room ── */}
                <Pressable
                    style={styles.toggle}
                    onPress={() => setIncludedOpen(v => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: includedOpen }}
                    accessibilityLabel="What's included, room by room"
                >
                    <Txt style={styles.toggleText}>What's included, room by room</Txt>
                    <Ionicons name={includedOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.blue} />
                </Pressable>

                {includedOpen ? (
                    <View style={styles.panel}>
                        <Txt style={styles.panelNote}>{PLAN_NOTE[plan]}</Txt>
                        {included.map(g => (
                            <View key={g.id} style={styles.group}>
                                <View style={styles.groupTop}>
                                    <Txt style={styles.groupRoom}>{g.room}</Txt>
                                    <Txt style={styles.groupCount}>{g.count}</Txt>
                                </View>
                                <Txt style={styles.groupItems}>{g.items}</Txt>
                            </View>
                        ))}
                        <Txt style={styles.heavy}>{tr(heavyWorkNote, locale)}</Txt>
                        <Txt style={styles.gear}>{tr(goodToKnow[0], locale)}</Txt>
                    </View>
                ) : null}

                {/* ── how often ── */}
                <Txt style={styles.sectionLabel}>How often?</Txt>
                <View style={styles.freqGrid}>
                    {BOOKING_FREQUENCIES.map(f => {
                        const on = f === frequency;
                        const save = saveLabel(f);
                        return (
                            <Pressable
                                key={f}
                                style={[styles.freq, on && styles.freqOn]}
                                onPress={() => setFrequency(f)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${tr(frequencyLabel[f], locale)}${save ? `, ${save}` : ''}`}
                            >
                                <Txt style={styles.freqLabel}>{tr(frequencyLabel[f], locale)}</Txt>
                                {/* One-off has no badge; `minHeight` keeps every chip the same size
                                    without a filler glyph a screen reader would have to announce. */}
                                {save ? <Txt style={styles.freqSave}>{save}</Txt> : null}
                            </Pressable>
                        );
                    })}
                </View>
                <Txt style={styles.freqNote}>Recurring visits keep the same homie whenever we can — and cost less every time.</Txt>
            </ScrollView>

            {/* ── footer ── */}
            <View style={styles.footer}>
                <Pressable
                    style={styles.cta}
                    onPress={onContinue}
                    accessibilityRole="button"
                    accessibilityLabel="Continue to your home"
                >
                    <Txt style={styles.ctaText}>Continue</Txt>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

/* Numbers below mirror the design file 1:1; colours resolve through the tokens. */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },

    header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, backgroundColor: colors.white },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    back: {
        width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 0.88, textTransform: 'uppercase', color: colors.grey },
    title: { fontSize: 17, fontWeight: '700', color: colors.primary, marginTop: 1 },
    progress: { flexDirection: 'row', gap: 4, marginTop: 14 },
    bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: colors.border },
    barOn: { backgroundColor: colors.salad },

    body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 24 },

    plans: { gap: 10 },
    planCard: { borderRadius: 16, borderWidth: 2, borderColor: colors.border, paddingVertical: 17, paddingHorizontal: 18 },
    planCardOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    planTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    planName: { fontSize: 18, fontWeight: '700', color: colors.primary, flexShrink: 1 },
    planFrom: { fontSize: 13, fontWeight: '700', color: colors.grey },
    planBlurb: { fontSize: 13, lineHeight: 18.9, color: colors.grey, marginTop: 6 },

    toggle: {
        marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bgLight, borderRadius: 14,
    },
    toggleText: { fontSize: 13.5, fontWeight: '700', color: colors.blue },

    panel: { marginTop: 10, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 18 },
    panelNote: {
        fontSize: 12.5, lineHeight: 18.75, fontWeight: '700', color: colors.primary,
        paddingBottom: 13, marginBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    group: { marginBottom: 15 },
    groupTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
    groupRoom: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: colors.primary, flexShrink: 1 },
    groupCount: { fontSize: 10.5, fontWeight: '700', color: colors.blue },
    groupItems: { fontSize: 12.5, lineHeight: 20, color: colors.grey, marginTop: 6 },
    heavy: { fontSize: 11.5, lineHeight: 17.25, color: colors.grey, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    gear: { fontSize: 12, lineHeight: 18, color: colors.grey, marginTop: 9 },

    sectionLabel: {
        fontSize: 12, fontWeight: '700', letterSpacing: 0.84, textTransform: 'uppercase',
        color: colors.grey, marginTop: 24, marginBottom: 10,
    },
    freqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    freq: {
        width: '48%', flexGrow: 1, minHeight: 63, gap: 3, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border,
        paddingVertical: 13, paddingHorizontal: 14,
    },
    freqOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    freqLabel: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
    freqSave: { fontSize: 11.5, fontWeight: '700', color: colors.success },
    freqNote: { fontSize: 12, lineHeight: 18, color: colors.grey, marginTop: 10 },

    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
    cta: { height: 52, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
