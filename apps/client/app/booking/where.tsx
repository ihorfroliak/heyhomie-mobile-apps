import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import {
    ACCESS_METHODS,
    ADDON_PRICE,
    addOns,
    cleaningPrice,
    formatMoney,
    tr,
    validateVisitSite,
    VISIT_NOTES_MAX,
    type AccessMethodId,
    type AddOnId,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { formatAddOns, parseCount, parseFrequency, parsePlan, serviceIdFor } from '../../lib/bookingFlow';
import { track } from '../../lib/analytics';

/**
 * Booking step 4 — "Where, and anything extra?" — ported from the "HeyHomie Client ·
 * Booking Flow v1" design (the `isWhere` block).
 *
 * Layout, spacing, radii and type sizes are 1:1 with the design markup; colours
 * resolve through the design tokens.
 *
 * Two deliberate departures from the design file:
 *
 * 1. The design shows a pre-saved "Home · ul. Karmelicka 14/3" card. There is no
 *    saved-address book in the client app yet, so this screen asks for the address
 *    instead of pretending to remember one. That closes a real hole: until now a
 *    cleaning could be booked without ever stating where it happens.
 * 2. Add-on prices and minutes come from `ADDON_PRICE` / `addOns` (DOMAIN_RULES §3),
 *    and the ones a general clean already covers are shown as "included" rather
 *    than sold twice — the design's own rule, on our canon.
 *
 * KNOWN LIMIT: the frozen OrderGateway contract carries no address, access method
 * or note, so those three travel with the flow and are shown back to the client,
 * but stop at the app. Widening the contract needs a versioned change (CLAUDE.md).
 * The add-ons DO reach the order — they are part of the submitted price.
 */

const STEPS = 5;
const STEP = 4;

export default function BookingWhere() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const params = useLocalSearchParams<{
        plan?: string; frequency?: string; rooms?: string; kitchens?: string; bathrooms?: string; date?: string; slot?: string;
    }>();

    const plan = parsePlan(params.plan);
    const frequency = parseFrequency(params.frequency);
    const rooms = parseCount(params.rooms, 2);
    const kitchens = parseCount(params.kitchens, 1);
    const bathrooms = parseCount(params.bathrooms, 1);

    const [line1, setLine1] = useState('');
    const [flat, setFlat] = useState('');
    const [floor, setFloor] = useState('');
    const [entryCode, setEntryCode] = useState('');
    const [access, setAccess] = useState<AccessMethodId>('meet');
    const [notes, setNotes] = useState('');
    const [selected, setSelected] = useState<Partial<Record<AddOnId, number>>>({});

    const site = { line1, flat, floor, entryCode, access, notes };
    const check = validateVisitSite(site);
    // Only complain once there is something to complain about — an untouched field
    // is not an error, it is just empty.
    const showLine1Error = line1.trim().length > 0 && !check.line1Valid;

    const quote = useMemo(
        () => cleaningPrice({ plan, rooms, bathrooms, frequency, addOns: selected, gearOnSite: true }),
        [plan, rooms, bathrooms, frequency, selected],
    );

    const toggle = (id: AddOnId) =>
        setSelected(prev => {
            const next = { ...prev };
            if (next[id]) delete next[id];
            else next[id] = 1;
            return next;
        });
    const setQty = (id: AddOnId, q: number) => setSelected(prev => ({ ...prev, [id]: Math.max(1, q) }));

    /** `invoice` opens the company-invoice fields straight away on the next screen. */
    const goToConfirm = (invoice: boolean) => {
        track({ name: 'funnel_step', stage: 'site_given', serviceId: serviceIdFor(plan) });
        router.push({
            pathname: '/booking/confirm',
            params: {
                plan, frequency, rooms, kitchens, bathrooms,
                date: params.date ?? '', slot: params.slot ?? '',
                line1, flat, floor, entryCode, access, notes,
                addons: formatAddOns(selected),
                invoice: invoice ? '1' : '',
            },
        });
    };
    const onContinue = () => goToConfirm(false);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            {/* ── header + progress ── */}
            <View style={styles.header}>
                <View style={styles.headerRow}>
                    <Pressable
                        style={styles.back}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel="Back to the date and time"
                    >
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.eyebrow}>Step {STEP} of {STEPS}</Txt>
                        <Txt style={styles.title}>Where, and anything extra?</Txt>
                    </View>
                </View>
                <View style={styles.progress}>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <View key={i} style={[styles.bar, i < STEP && styles.barOn]} />
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                {/* ── the flat ── */}
                <View style={styles.addressCard}>
                    <View style={styles.addressHead}>
                        <View style={styles.addressIcon}>
                            <Ionicons name="home-outline" size={16} color={colors.blue} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Txt style={styles.addressTitle}>Where are we cleaning?</Txt>
                            <Txt style={styles.addressHint}>Street and number — so your homie finds the door.</Txt>
                        </View>
                    </View>
                    <View style={styles.fields}>
                        <TextInput
                            style={[styles.input, showLine1Error && styles.inputError]}
                            placeholder="Street and number"
                            placeholderTextColor={colors.grey}
                            value={line1}
                            onChangeText={setLine1}
                            accessibilityLabel="Street and number"
                        />
                        <View style={styles.fieldRow}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Flat"
                                placeholderTextColor={colors.grey}
                                value={flat}
                                onChangeText={setFlat}
                                accessibilityLabel="Flat"
                            />
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Floor"
                                placeholderTextColor={colors.grey}
                                value={floor}
                                onChangeText={setFloor}
                                accessibilityLabel="Floor"
                            />
                        </View>
                        {showLine1Error ? <Txt style={styles.error}>Add the house number too — "ul. Karmelicka 14".</Txt> : null}
                    </View>
                </View>

                {/* ── the way in ── */}
                <Txt style={styles.sectionLabel}>How does your homie get in?</Txt>
                <View style={styles.options}>
                    {ACCESS_METHODS.map(a => {
                        const on = a.id === access;
                        return (
                            <Pressable
                                key={a.id}
                                style={[styles.option, on && styles.optionOn]}
                                onPress={() => setAccess(a.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`${tr(a.label, locale)}. ${tr(a.hint, locale)}`}
                            >
                                <View style={[styles.dot, on && styles.dotOn]} />
                                <View style={{ flex: 1 }}>
                                    <Txt style={styles.optionLabel}>{tr(a.label, locale)}</Txt>
                                    {on ? <Txt style={styles.optionHint}>{tr(a.hint, locale)}</Txt> : null}
                                </View>
                            </Pressable>
                        );
                    })}
                </View>
                {access === 'code' ? (
                    <TextInput
                        style={[styles.input, styles.codeInput, check.codeMissing && styles.inputError]}
                        placeholder="Entry code"
                        placeholderTextColor={colors.grey}
                        value={entryCode}
                        onChangeText={setEntryCode}
                        accessibilityLabel="Entry code"
                    />
                ) : null}

                {/* ── extras ── */}
                <Txt style={styles.sectionLabel}>Add something extra</Txt>
                <View style={styles.options}>
                    {addOns.map(a => {
                        // A general clean already covers these — shown, but never sold twice.
                        const free = a.includedInGeneral && plan === 'general';
                        const qty = selected[a.id] ?? 0;
                        const on = free || qty > 0;
                        const countable = a.pricing !== 'flat';
                        const unit = a.unitLabel ? tr(a.unitLabel, locale) : '';
                        return (
                            <Pressable
                                key={a.id}
                                style={[styles.addon, on && styles.addonOn, free && styles.addonFree]}
                                disabled={free}
                                onPress={() => toggle(a.id)}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: on, disabled: free }}
                                accessibilityLabel={`${tr(a.label, locale)}, ${free ? 'included in a deep clean' : `plus ${ADDON_PRICE[a.id]} zloty`}`}
                            >
                                <View style={{ flex: 1 }}>
                                    <View style={styles.addonTop}>
                                        <Txt style={styles.addonLabel}>{tr(a.label, locale)}</Txt>
                                        <Txt style={styles.addonPrice}>
                                            {free ? 'included' : `+${formatMoney(ADDON_PRICE[a.id], 'PLN', locale)}${countable ? ` / ${unit}` : ''}`}
                                        </Txt>
                                    </View>
                                    <Txt style={styles.addonMeta}>
                                        {free
                                            ? 'part of a deep clean at no extra charge'
                                            : `adds ${a.addedMinutesPerUnit} min${countable ? ` per ${unit}` : ''}`}
                                    </Txt>
                                </View>
                                {on && countable && !free ? (
                                    <View style={styles.qty}>
                                        <Pressable
                                            style={styles.qtyBtn}
                                            onPress={() => (qty <= 1 ? toggle(a.id) : setQty(a.id, qty - 1))}
                                            accessibilityRole="button"
                                            accessibilityLabel={`One fewer ${tr(a.label, locale)}`}
                                        >
                                            <Txt style={styles.qtySign}>−</Txt>
                                        </Pressable>
                                        <Txt style={styles.qtyValue}>{qty}</Txt>
                                        <Pressable
                                            style={styles.qtyBtn}
                                            onPress={() => setQty(a.id, qty + 1)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`One more ${tr(a.label, locale)}`}
                                        >
                                            <Txt style={styles.qtySign}>+</Txt>
                                        </Pressable>
                                    </View>
                                ) : (
                                    <View style={[styles.check, on && styles.checkOn]}>
                                        {on ? <Ionicons name="checkmark" size={14} color={colors.primary} /> : null}
                                    </View>
                                )}
                            </Pressable>
                        );
                    })}
                </View>

                {/* ── note to the homie ── */}
                <View style={styles.noteCard}>
                    <Txt style={styles.noteTitle}>Anything we should know?</Txt>
                    <Txt style={styles.noteHint}>A cat that hides, a squeaky door, a spot that always gets missed — tell your homie here.</Txt>
                    <TextInput
                        style={[styles.input, styles.noteInput]}
                        placeholder="Your note (optional)"
                        placeholderTextColor={colors.grey}
                        value={notes}
                        onChangeText={t => setNotes(t.slice(0, VISIT_NOTES_MAX))}
                        multiline
                        accessibilityLabel="Note for your homie"
                    />
                    <Txt style={styles.noteCount}>{notes.length}/{VISIT_NOTES_MAX}</Txt>
                </View>

                {/* The NIP form lives on the checkout screen — this row goes there with the
                    section already open, rather than duplicating a second invoice form here. */}
                <Pressable
                    style={styles.invoice}
                    disabled={!check.valid}
                    onPress={() => goToConfirm(true)}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !check.valid }}
                    accessibilityLabel="I need a company invoice — continue to checkout"
                >
                    <Txt style={styles.invoiceText}>I need a company invoice</Txt>
                    <Ionicons name="chevron-forward" size={13} color={colors.blue} />
                </Pressable>
            </ScrollView>

            {/* ── footer ── */}
            <View style={styles.footer}>
                <View style={styles.footerRow}>
                    <View>
                        <Txt style={styles.priceLabel}>Your price</Txt>
                        <Txt style={styles.price}>{formatMoney(quote.total, 'PLN', locale)}</Txt>
                    </View>
                    <Pressable
                        style={[styles.cta, !check.valid && styles.ctaOff]}
                        disabled={!check.valid}
                        onPress={onContinue}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: !check.valid }}
                        accessibilityLabel="Continue"
                    >
                        <Txt style={styles.ctaText}>Continue</Txt>
                    </Pressable>
                </View>
                {!check.valid ? (
                    <Txt style={styles.blocker}>
                        {check.codeMissing ? 'Add the entry code so your homie can get in.' : 'Add the street and number first.'}
                    </Txt>
                ) : null}
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

    addressCard: { borderRadius: 15, borderWidth: 2, borderColor: colors.border, paddingVertical: 15, paddingHorizontal: 16 },
    addressHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    addressIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    addressTitle: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
    addressHint: { fontSize: 12.5, color: colors.grey, marginTop: 1 },
    fields: { gap: 8, marginTop: 12 },
    fieldRow: { flexDirection: 'row', gap: 8 },
    input: {
        height: 46, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
        paddingHorizontal: 14, fontSize: 14, color: colors.primary,
    },
    inputError: { borderColor: colors.danger },
    error: { fontSize: 12, color: colors.danger },
    codeInput: { marginTop: 8 },

    sectionLabel: {
        fontSize: 12, fontWeight: '700', letterSpacing: 0.84, textTransform: 'uppercase',
        color: colors.grey, marginTop: 24, marginBottom: 10,
    },
    options: { gap: 8 },
    option: {
        flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 14, paddingHorizontal: 16,
        borderRadius: 13, borderWidth: 1.5, borderColor: colors.border,
    },
    optionOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
    dotOn: { borderColor: colors.primary, backgroundColor: colors.salad },
    optionLabel: { fontSize: 14, fontWeight: '700', color: colors.primary },
    optionHint: { fontSize: 12, color: colors.grey, marginTop: 2 },

    addon: {
        flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
        borderRadius: 14, borderWidth: 1.5, borderColor: colors.border,
    },
    addonOn: { borderColor: colors.primary, backgroundColor: colors.bgLight },
    addonFree: { opacity: 0.72 },
    addonTop: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
    addonLabel: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
    addonPrice: { fontSize: 13.5, fontWeight: '800', color: colors.blue },
    addonMeta: { fontSize: 12, color: colors.grey, marginTop: 2 },
    check: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: colors.salad, borderColor: colors.salad },
    qty: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    qtyBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    qtySign: { fontSize: 17, fontWeight: '700', color: colors.primary },
    qtyValue: { minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.primary },

    noteCard: { marginTop: 16, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 17 },
    noteTitle: { fontSize: 13.5, fontWeight: '700', color: colors.primary, marginBottom: 8 },
    noteHint: { fontSize: 12.5, lineHeight: 18.75, color: colors.grey },
    noteInput: { height: 78, paddingTop: 12, textAlignVertical: 'top', marginTop: 10 },
    noteCount: { alignSelf: 'flex-end', fontSize: 11, color: colors.grey, marginTop: 4 },

    invoice: {
        marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bgLight, borderRadius: 14,
    },
    invoiceText: { fontSize: 13.5, fontWeight: '700', color: colors.blue },

    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    priceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.66, textTransform: 'uppercase', color: colors.grey },
    price: { fontSize: 25, fontWeight: '700', letterSpacing: -0.25, color: colors.primary, marginTop: 1 },
    cta: { height: 52, paddingHorizontal: 30, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    ctaOff: { backgroundColor: colors.border },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    blocker: { fontSize: 12, color: colors.grey, marginTop: 9 },
});
