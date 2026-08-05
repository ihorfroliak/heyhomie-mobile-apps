import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import {
    ARRIVAL_SLOTS,
    bookableDates,
    cleaningPrice,
    formatMoney,
    tr,
    type ArrivalSlotId,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { parseCount, parseFrequency, parsePlan, serviceIdFor, todayYmd } from '../../lib/bookingFlow';
import { track } from '../../lib/analytics';

/**
 * Booking step 3 — "When suits you?" — ported from the "HeyHomie Client · Booking
 * Flow v1" design (the `isWhen` block).
 *
 * Layout, spacing, radii and type sizes are 1:1 from the design markup; colours
 * resolve through the design tokens. The horizontal day strip keeps the design's
 * edge-to-edge bleed (the body has no side padding — each section pads itself).
 *
 * The calendar is canon: `bookableDates` opens tomorrow and runs a fortnight
 * (BOOKING_LEAD_DAYS / BOOKING_HORIZON_DAYS), and the windows are `ARRIVAL_SLOTS`.
 *
 * The design marks one window "Fully booked" to show that state. We have no slot
 * capacity feed yet, so every window here is genuinely open — inventing scarcity
 * to decorate the screen would be a lie the client acts on.
 */

const STEPS = 5;
const STEP = 3;

/** "Wed" / "6" / "Aug" for a `YYYY-MM-DD` — noon anchor keeps the day stable. */
const dayParts = (ymd: string, locale: string) => {
    const d = new Date(`${ymd}T12:00:00`);
    return {
        dow: d.toLocaleDateString(locale, { weekday: 'short' }),
        num: String(d.getDate()),
        mon: d.toLocaleDateString(locale, { month: 'short' }),
    };
};

export default function BookingWhen() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const params = useLocalSearchParams<{ plan?: string; frequency?: string; rooms?: string; kitchens?: string; bathrooms?: string }>();

    const plan = parsePlan(params.plan);
    const frequency = parseFrequency(params.frequency);
    const rooms = parseCount(params.rooms, 2);
    const kitchens = parseCount(params.kitchens, 1);
    const bathrooms = parseCount(params.bathrooms, 1);

    const days = useMemo(() => bookableDates(todayYmd()), []);
    // The design lands on the third open day — far enough out to be realistic.
    const [date, setDate] = useState<string>(() => days[2] ?? days[0]);
    const [slot, setSlot] = useState<ArrivalSlotId>('midday');

    const price = useMemo(
        () => cleaningPrice({ plan, rooms, bathrooms, frequency, gearOnSite: true }).total,
        [plan, rooms, bathrooms, frequency],
    );

    const onContinue = () => {
        track({ name: 'funnel_step', stage: 'slot_picked', serviceId: serviceIdFor(plan) });
        router.push({ pathname: '/book', params: { plan, frequency, rooms, kitchens, bathrooms, date, slot } });
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
                        accessibilityLabel="Back to your home"
                    >
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.eyebrow}>Step {STEP} of {STEPS}</Txt>
                        <Txt style={styles.title}>When suits you?</Txt>
                    </View>
                </View>
                <View style={styles.progress}>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <View key={i} style={[styles.bar, i < STEP && styles.barOn]} />
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body}>
                {/* ── day strip (bleeds to the edge) ── */}
                <Txt style={[styles.sectionLabel, styles.inset]}>Pick a day</Txt>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayStrip}>
                    {days.map(d => {
                        const on = d === date;
                        const p = dayParts(d, locale);
                        return (
                            <Pressable
                                key={d}
                                style={[styles.day, on && styles.dayOn]}
                                onPress={() => setDate(d)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${p.dow} ${p.num} ${p.mon}`}
                            >
                                <Txt style={[styles.dayDow, on && styles.dayDowOn]}>{p.dow}</Txt>
                                <Txt style={[styles.dayNum, on && styles.dayNumOn]}>{p.num}</Txt>
                                <Txt style={[styles.dayMon, on && styles.dayDowOn]}>{p.mon}</Txt>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                {/* ── arrival window ── */}
                <Txt style={[styles.sectionLabel, styles.inset, styles.slotsLabel]}>Pick a time</Txt>
                <View style={[styles.inset, styles.slots]}>
                    {ARRIVAL_SLOTS.map(s => {
                        const on = s.id === slot;
                        return (
                            <Pressable
                                key={s.id}
                                style={[styles.slot, on && styles.slotOn]}
                                onPress={() => setSlot(s.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${tr(s.label, locale)}, ${s.window}`}
                            >
                                <View style={{ flex: 1 }}>
                                    <Txt style={styles.slotLabel}>{tr(s.label, locale)}</Txt>
                                    <Txt style={styles.slotWindow}>{s.window}</Txt>
                                </View>
                                {on ? <Txt style={styles.slotTag}>Selected</Txt> : null}
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── what the window means ── */}
                <View style={[styles.inset, styles.note]}>
                    <Ionicons name="sparkles-outline" size={15} color={colors.blue} />
                    <Txt style={styles.noteText}>
                        Your homie arrives inside the window you pick. For your <Txt style={styles.noteStrong}>first cleaning</Txt> we come
                        along personally to walk through your place with you.
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

    /* The body has no side padding so the day strip can run to the edge. */
    body: { paddingTop: 18, paddingBottom: 24 },
    inset: { marginHorizontal: 20 },
    sectionLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.84, textTransform: 'uppercase', color: colors.grey, marginBottom: 11 },

    dayStrip: { flexDirection: 'row', gap: 8, paddingTop: 2, paddingBottom: 6, paddingHorizontal: 20 },
    day: { width: 58, paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
    dayOn: { borderColor: colors.primary, backgroundColor: colors.primary },
    dayDow: { fontSize: 11, fontWeight: '700', color: colors.grey },
    dayDowOn: { color: 'rgba(255,255,255,0.6)' },
    dayNum: { fontSize: 19, fontWeight: '700', color: colors.primary, marginTop: 2 },
    dayNumOn: { color: colors.white },
    dayMon: { fontSize: 10.5, fontWeight: '700', color: colors.grey, marginTop: 1 },

    slotsLabel: { marginTop: 22 },
    slots: { gap: 8 },
    slot: {
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 15, paddingHorizontal: 17,
        borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
    },
    slotOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    slotLabel: { fontSize: 15, fontWeight: '700', color: colors.primary },
    slotWindow: { fontSize: 12.5, color: colors.grey, marginTop: 2 },
    slotTag: { fontSize: 11, fontWeight: '700', color: colors.success },

    note: { marginTop: 18, flexDirection: 'row', gap: 11, paddingVertical: 15, paddingHorizontal: 17, backgroundColor: colors.bgLight, borderRadius: 14 },
    noteText: { flex: 1, fontSize: 12.5, lineHeight: 18.75, color: colors.grey },
    noteStrong: { color: colors.primary, fontWeight: '700' },

    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, textTransform: 'uppercase', color: colors.grey },
    price: { fontSize: 25, fontWeight: '700', letterSpacing: -0.25, color: colors.primary, marginTop: 1 },
    cta: { height: 52, paddingHorizontal: 30, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
