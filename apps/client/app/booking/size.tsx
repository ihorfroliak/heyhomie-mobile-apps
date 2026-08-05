import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import {
    cleaningPrice,
    estimateMissionMinutes,
    formatDuration,
    formatMoney,
    workersFor,
    TRAVEL_BUFFER_MINUTES,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { parseFrequency, parsePlan, serviceIdFor } from '../../lib/bookingFlow';
import { track } from '../../lib/analytics';

/**
 * Booking step 2 — "Your home" — ported from the "HeyHomie Client · Booking Flow v1"
 * design (the `isSize` block).
 *
 * Same rule as steps before it: layout, spacing, radii and type sizes are 1:1 from
 * the design markup; colours resolve through the design tokens.
 *
 * The numbers are canon, not the design's: preset and footer prices come from
 * `cleaningPrice` (DOMAIN_RULES §1–§2), the estimate from `estimateMissionMinutes`
 * (§5) and the crew from `workersFor` — the design's local `rooms >= 3` shortcut is
 * not the real staffing rule. Kitchens have no price of their own (the base already
 * covers kitchen + hallway), so the counter feeds the time estimate only.
 */

const STEPS = 5;
const STEP = 2;

interface Preset {
    id: string;
    label: string;
    rooms: number;
    kitchens: number;
    bathrooms: number;
    tag?: string;
}

const PRESETS: Preset[] = [
    { id: 'studio', label: 'Studio', rooms: 1, kitchens: 1, bathrooms: 1 },
    { id: '1bed', label: '1-bed', rooms: 2, kitchens: 1, bathrooms: 1, tag: 'popular' },
    { id: '2bed', label: '2-bed', rooms: 3, kitchens: 1, bathrooms: 1 },
    { id: '3bed', label: '3-bed', rooms: 4, kitchens: 1, bathrooms: 2 },
];

const describe = (p: Preset): string =>
    `${p.rooms} ${p.rooms === 1 ? 'room' : 'rooms'} · ${p.bathrooms} ${p.bathrooms === 1 ? 'bath' : 'baths'}`;

export default function BookingSize() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const params = useLocalSearchParams<{ plan?: string; frequency?: string }>();

    const plan = parsePlan(params.plan);
    const frequency = parseFrequency(params.frequency);

    // "1-bed" is the design's default selection, and the most common Kraków flat.
    const [preset, setPreset] = useState<string>('1bed');
    const [rooms, setRooms] = useState(2);
    const [kitchens, setKitchens] = useState(1);
    const [bathrooms, setBathrooms] = useState(1);
    const [refineOpen, setRefineOpen] = useState(false);

    const pickPreset = (p: Preset) => {
        setPreset(p.id);
        setRooms(p.rooms);
        setKitchens(p.kitchens);
        setBathrooms(p.bathrooms);
    };
    /** Any manual nudge takes the selection off the presets, exactly as the design does. */
    const bump = (set: (fn: (v: number) => number) => void, delta: number, min: number) => {
        setPreset('custom');
        set(v => Math.max(min, v + delta));
    };

    /**
     * The running total for the clean itself, at the chosen cadence. Add-ons and the
     * gear fee land later in the flow, so this is a subtotal — the note under the
     * summary says so rather than letting the number look final.
     */
    const price = useMemo(
        () => cleaningPrice({ plan, rooms, bathrooms, frequency, gearOnSite: true }).total,
        [plan, rooms, bathrooms, frequency],
    );
    const minutes = estimateMissionMinutes({ rooms, kitchens, bathrooms });
    const workers = workersFor(plan, { recurring: frequency !== 'once' });

    const onContinue = () => {
        track({ name: 'funnel_step', stage: 'home_sized', serviceId: serviceIdFor(plan) });
        router.push({ pathname: '/book', params: { plan, frequency, rooms, kitchens, bathrooms } });
    };

    const counters: { key: string; label: string; hint: string; value: number; min: number; set: (fn: (v: number) => number) => void }[] = [
        { key: 'rooms', label: 'Rooms', hint: 'Bedrooms and living rooms', value: rooms, min: 1, set: setRooms },
        { key: 'kitchens', label: 'Kitchens', hint: 'Usually one — included in the base price', value: kitchens, min: 1, set: setKitchens },
        { key: 'bathrooms', label: 'Bathrooms', hint: 'Including separate toilets', value: bathrooms, min: 1, set: setBathrooms },
    ];

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── header + progress ── */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Pressable
                        style={styles.back}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Back to the service step"
                    >
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.eyebrow}>Step {STEP} of {STEPS}</Txt>
                        <Txt style={styles.title}>Your home</Txt>
                    </View>
                </View>
                <View style={styles.progress}>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <View key={i} style={[styles.bar, i < STEP && styles.barOn]} />
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                <Txt style={styles.intro}>Pick the closest match — you can fine-tune it below.</Txt>

                {/* ── presets ── */}
                <View style={styles.presets}>
                    {PRESETS.map(p => {
                        const on = p.id === preset;
                        const presetPrice = formatMoney(
                            cleaningPrice({ plan, rooms: p.rooms, bathrooms: p.bathrooms, frequency, gearOnSite: true }).total,
                            'PLN',
                            locale,
                        );
                        return (
                            <Pressable
                                key={p.id}
                                style={[styles.preset, on && styles.presetOn]}
                                onPress={() => pickPreset(p)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${p.label}, ${describe(p)}, ${presetPrice}`}
                            >
                                <View style={styles.presetTop}>
                                    <Txt style={styles.presetLabel}>{p.label}</Txt>
                                    {p.tag ? <Txt style={styles.presetTag}>{p.tag}</Txt> : null}
                                </View>
                                <Txt style={styles.presetDesc}>{describe(p)}</Txt>
                                <Txt style={styles.presetPrice}>{presetPrice}</Txt>
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── fine-tune ── */}
                <Pressable
                    style={styles.toggle}
                    onPress={() => setRefineOpen(v => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: refineOpen }}
                    accessibilityLabel="Fine-tune the rooms"
                >
                    <Txt style={styles.toggleText}>Fine-tune the rooms</Txt>
                    <Ionicons name={refineOpen ? 'chevron-up' : 'chevron-down'} size={13} color={colors.blue} />
                </Pressable>

                {refineOpen ? (
                    <View style={styles.panel}>
                        {counters.map((c, i) => {
                            const atMin = c.value <= c.min;
                            return (
                                <View key={c.key} style={[styles.counter, i === counters.length - 1 && styles.counterLast]}>
                                    <View style={{ flex: 1 }}>
                                        <Txt style={styles.counterLabel}>{c.label}</Txt>
                                        <Txt style={styles.counterHint}>{c.hint}</Txt>
                                    </View>
                                    <View style={styles.counterCtrl}>
                                        <Pressable
                                            style={styles.counterBtn}
                                            disabled={atMin}
                                            onPress={() => bump(c.set, -1, c.min)}
                                            accessibilityRole="button"
                                            accessibilityState={{ disabled: atMin }}
                                            accessibilityLabel={`One fewer ${c.label.toLowerCase()}`}
                                        >
                                            <Txt style={[styles.counterSign, atMin && styles.counterSignOff]}>−</Txt>
                                        </Pressable>
                                        <Txt style={styles.counterValue}>{c.value}</Txt>
                                        <Pressable
                                            style={styles.counterBtn}
                                            onPress={() => bump(c.set, 1, c.min)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`One more ${c.label.toLowerCase()}`}
                                        >
                                            <Txt style={styles.counterSign}>+</Txt>
                                        </Pressable>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : null}

                {/* ── what that means ── */}
                <View style={styles.summary}>
                    <View style={styles.sumRow}>
                        <Txt style={styles.sumLabel}>Estimated time</Txt>
                        <Txt style={styles.sumValue}>{formatDuration(minutes)}</Txt>
                    </View>
                    <View style={styles.sumRow}>
                        <Txt style={styles.sumLabel}>Homies assigned</Txt>
                        <Txt style={styles.sumValue}>{workers === 1 ? '1 homie' : `${workers} homies`}</Txt>
                    </View>
                    <Txt style={styles.sumNote}>
                        Includes a {TRAVEL_BUFFER_MINUTES} min travel buffer. Pets are welcome and never change the price.
                        Extras and the equipment fee are added in the next steps.
                    </Txt>
                </View>
            </ScrollView>

            {/* ── footer ── */}
            <View style={styles.footer}>
                <View style={styles.footerRow}>
                    <View>
                        <Txt style={styles.priceLabel}>Your price</Txt>
                        <Txt style={styles.price}>{formatMoney(price, 'PLN', locale)}</Txt>
                    </View>
                    <Pressable
                        style={styles.cta}
                        onPress={onContinue}
                        accessibilityRole="button"
                        accessibilityLabel="Continue"
                    >
                        <Txt style={styles.ctaText}>Continue</Txt>
                    </Pressable>
                </View>
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
    intro: { fontSize: 13.5, lineHeight: 20.25, color: colors.grey, marginBottom: 14 },

    presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    preset: {
        width: '48%', flexGrow: 1, borderRadius: 15, borderWidth: 2, borderColor: colors.border,
        paddingVertical: 14, paddingHorizontal: 15,
    },
    presetOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    presetTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
    presetLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
    presetTag: {
        fontSize: 9.5, fontWeight: '800', letterSpacing: 0.57, textTransform: 'uppercase', color: colors.primary,
        backgroundColor: colors.salad, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5, overflow: 'hidden',
    },
    presetDesc: { fontSize: 12, color: colors.grey, marginTop: 4 },
    presetPrice: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 8 },

    toggle: {
        marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bgLight, borderRadius: 14,
    },
    toggleText: { fontSize: 13.5, fontWeight: '700', color: colors.blue },

    panel: { marginTop: 10, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 18 },
    counter: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.bgLight,
    },
    counterLast: { borderBottomWidth: 0 },
    counterLabel: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
    counterHint: { fontSize: 12, color: colors.grey, marginTop: 2 },
    counterCtrl: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    counterSign: { fontSize: 19, fontWeight: '700', color: colors.primary },
    counterSignOff: { color: colors.border },
    counterValue: { minWidth: 30, textAlign: 'center', fontSize: 16, fontWeight: '800', color: colors.primary },

    summary: { marginTop: 18, borderRadius: 14, backgroundColor: colors.bgLight, paddingVertical: 16, paddingHorizontal: 18 },
    sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5 },
    sumLabel: { fontSize: 13, color: colors.grey },
    sumValue: { fontSize: 13.5, fontWeight: '700', color: colors.primary },
    sumNote: { fontSize: 11.5, lineHeight: 16.7, color: colors.grey, marginTop: 8 },

    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, textTransform: 'uppercase', color: colors.grey },
    price: { fontSize: 25, fontWeight: '700', letterSpacing: -0.25, color: colors.primary, marginTop: 1 },
    cta: { height: 52, paddingHorizontal: 30, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
