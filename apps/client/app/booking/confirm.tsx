import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable, TextInput, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import { orderGateway } from '@heyhomie/api';
import {
    addOns,
    arrivalSlot,
    arrivalStartIso,
    cityName,
    cleaningPrice,
    formatMoney,
    formatVisitSite,
    frequencyLabel,
    isValidPolishPhone,
    normalizePhone,
    serviceName,
    tr,
    validateBilling,
    CANCELLATION_WINDOW_HOURS,
    type BillingDetails,
    type CleaningPriceLine,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { parseAccess, parseAddOns, parseCount, parseDate, parseFrequency, parsePlan, parseSlot, parseText, prettyDay, serviceIdFor } from '../../lib/bookingFlow';
import { track } from '../../lib/analytics';

/**
 * Booking step 5 — "Almost there" — ported from the "HeyHomie Client · Booking
 * Flow v1" design (the `isConfirm` block). This is where the flow stops being a
 * preview and actually books: the button calls `orderGateway.submitOrder`.
 *
 * Layout, spacing, radii and type sizes are 1:1 with the design markup; colours
 * resolve through the design tokens.
 *
 * The price breakdown is not re-derived here — it is `cleaningPrice().lines`, the
 * same canonical computation every step above used, so the total on this screen
 * cannot disagree with the total the client already saw.
 *
 * NOT ported: the design's "Add a voucher code" row. There is no voucher or promo
 * model anywhere in the product, and discounts are canon that belongs in
 * heyhomie-shared/DOMAIN_RULES.md first — a field that accepts codes and silently
 * ignores them is worse than no field.
 */

const STEPS = 5;
const STEP = 5;

const TRUST = ['Insured\nhomies', 'Eco\ndetergents', `Free cancel\nup to ${CANCELLATION_WINDOW_HOURS} h`];

export default function BookingConfirm() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const params = useLocalSearchParams<{
        plan?: string; frequency?: string; rooms?: string; kitchens?: string; bathrooms?: string; date?: string; slot?: string;
        line1?: string; flat?: string; floor?: string; entryCode?: string; access?: string; notes?: string; addons?: string; invoice?: string;
    }>();

    const plan = parsePlan(params.plan);
    const frequency = parseFrequency(params.frequency);
    const rooms = parseCount(params.rooms, 2);
    const bathrooms = parseCount(params.bathrooms, 1);
    const selectedAddOns = useMemo(() => parseAddOns(params.addons), [params.addons]);
    const date = parseDate(params.date);
    const slot = parseSlot(params.slot);
    const site = {
        line1: parseText(params.line1),
        flat: parseText(params.flat, 12),
        floor: parseText(params.floor, 12),
        access: parseAccess(params.access),
        notes: parseText(params.notes),
    };

    const serviceId = serviceIdFor(plan);
    // The city the flow ran in. The client app is Kraków-only today; the field is
    // here so the order carries a real city id rather than a guess.
    const cityId = 'krakow';

    const [phone, setPhone] = useState('');
    const [wantInvoice, setWantInvoice] = useState(params.invoice === '1');
    const [billing, setBilling] = useState<Partial<BillingDetails>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const phoneValid = isValidPolishPhone(phone);
    const billingCheck = validateBilling(billing);
    const canBook = phoneValid && (!wantInvoice || billingCheck.valid) && !submitting;
    const setBill = (k: keyof BillingDetails, v: string) => setBilling(prev => ({ ...prev, [k]: v }));

    const quote = useMemo(
        () => cleaningPrice({ plan, rooms, bathrooms, frequency, addOns: selectedAddOns, gearOnSite: true }),
        [plan, rooms, bathrooms, frequency, selectedAddOns],
    );

    /** Turn a canonical price line into the label the client reads. */
    const lineLabel = (l: CleaningPriceLine): string => {
        if (l.id === 'base') return 'Base clean — kitchen and hallway';
        if (l.id === 'rooms') return `Rooms × ${l.qty}`;
        if (l.id === 'baths') return `Bathrooms × ${l.qty}`;
        if (l.id === 'gear') return 'Cleaning equipment';
        if (l.id === 'discount') return `${tr(frequencyLabel[frequency], locale)} discount`;
        const a = addOns.find(x => x.id === l.id);
        return a ? `${tr(a.label, locale)}${l.qty ? ` × ${l.qty}` : ''}` : l.id;
    };

    const window = arrivalSlot(slot)?.window ?? '';
    const summaryWhen = `${prettyDay(date, locale)} · ${window}`;
    const summaryWhere = site.line1 ? formatVisitSite({ ...site, city: cityName(cityId, locale) }) : cityName(cityId, locale);

    const onBook = async () => {
        if (!canBook) return;
        setSubmitting(true);
        setError(null);
        try {
            track({ name: 'funnel_step', stage: 'confirmed', serviceId });
            const result = await orderGateway.submitOrder({
                contact: { phone: normalizePhone(phone) },
                cityId,
                serviceId,
                estValue: quote.total,
                scheduledAt: arrivalStartIso(date, slot),
                paymentMethod: 'card',
            });
            track({ name: 'mission_booked', plan, minutes: 0, addOns: Object.keys(selectedAddOns).length });
            // The contract `Order` carries no visit time (only `updatedAt`), so the
            // success screen is handed the slot we just submitted rather than reading
            // back a booking timestamp and calling it the visit.
            router.replace({ pathname: '/booking/done', params: { orderId: result.draft.id, date, slot } });
        } catch (e) {
            // Booking is the one step where silence is unacceptable — the client has
            // to know whether their cleaning exists.
            setError(e instanceof Error ? e.message : 'We could not place the booking. Please try again.');
        } finally {
            setSubmitting(false);
        }
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
                        accessibilityLabel="Back to the address and extras"
                    >
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.eyebrow}>Step {STEP} of {STEPS}</Txt>
                        <Txt style={styles.title}>Almost there</Txt>
                    </View>
                </View>
                <View style={styles.progress}>
                    {Array.from({ length: STEPS }, (_, i) => (
                        <View key={i} style={[styles.bar, i < STEP && styles.barOn]} />
                    ))}
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
                {/* ── what you are booking ── */}
                <View style={styles.summary}>
                    <Txt style={styles.summaryTitle}>{serviceName(serviceId, locale)}</Txt>
                    <Txt style={styles.summaryMeta}>{summaryWhen}</Txt>
                    <Txt style={styles.summaryMeta}>{summaryWhere}</Txt>

                    <View style={styles.breakdown}>
                        {quote.lines.map(l => {
                            const credit = l.value < 0;
                            return (
                                <View key={`${l.id}-${l.qty ?? ''}`} style={styles.line}>
                                    <Txt style={[styles.lineLabel, credit && styles.lineCredit]}>{lineLabel(l)}</Txt>
                                    <Txt style={[styles.lineValue, credit && styles.lineCredit]}>
                                        {credit ? '−' : ''}{formatMoney(Math.abs(l.value), 'PLN', locale)}
                                    </Txt>
                                </View>
                            );
                        })}
                    </View>

                    <View style={styles.totalRow}>
                        <Txt style={styles.totalLabel}>Total</Txt>
                        <Txt style={styles.totalValue}>{formatMoney(quote.total, 'PLN', locale)}</Txt>
                    </View>
                </View>

                {/* ── who we text ── */}
                <Txt style={styles.sectionLabel}>Your phone number</Txt>
                <View style={[styles.phoneRow, phone.length > 0 && !phoneValid && styles.phoneRowError]}>
                    <Txt style={styles.phonePrefix}>+48</Txt>
                    <View style={styles.phoneDivider} />
                    <TextInput
                        style={styles.phoneInput}
                        placeholder="600 000 000"
                        placeholderTextColor={colors.grey}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                        accessibilityLabel="Your phone number"
                    />
                </View>
                <Txt style={styles.phoneHint}>
                    We'll text you the confirmation. No password to remember — your account is created for you.
                </Txt>

                {/* ── company invoice (the step-4 row lands here) ── */}
                <Pressable
                    style={styles.invoiceRow}
                    onPress={() => setWantInvoice(v => !v)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: wantInvoice }}
                    accessibilityLabel="I need a company invoice"
                >
                    <Txt style={styles.invoiceText}>I need a company invoice</Txt>
                    <Ionicons name={wantInvoice ? 'chevron-up' : 'chevron-down'} size={13} color={colors.blue} />
                </Pressable>
                {wantInvoice ? (
                    <View style={styles.invoicePanel}>
                        <TextInput style={styles.input} placeholder="Company name" placeholderTextColor={colors.grey} value={billing.companyName ?? ''} onChangeText={t => setBill('companyName', t)} accessibilityLabel="Company name" />
                        <TextInput style={styles.input} placeholder="NIP (10 digits)" placeholderTextColor={colors.grey} keyboardType="number-pad" value={billing.nip ?? ''} onChangeText={t => setBill('nip', t)} accessibilityLabel="NIP" />
                        <TextInput style={styles.input} placeholder="Street and number" placeholderTextColor={colors.grey} value={billing.line1 ?? ''} onChangeText={t => setBill('line1', t)} accessibilityLabel="Invoice street and number" />
                        <View style={styles.invoiceRowFields}>
                            <TextInput style={[styles.input, { width: 110 }]} placeholder="00-000" placeholderTextColor={colors.grey} value={billing.zipCode ?? ''} onChangeText={t => setBill('zipCode', t)} accessibilityLabel="Postcode" />
                            <TextInput style={[styles.input, { flex: 1 }]} placeholder="City" placeholderTextColor={colors.grey} value={billing.city ?? ''} onChangeText={t => setBill('city', t)} accessibilityLabel="Invoice city" />
                        </View>
                        {(billing.nip ?? '').length > 0 && !billingCheck.nipValid ? <Txt style={styles.error}>That NIP checksum doesn't add up.</Txt> : null}
                    </View>
                ) : null}

                {/* ── when the money moves ── */}
                <View style={styles.payCard}>
                    <View style={styles.payHead}>
                        <View style={styles.payDot} />
                        <Txt style={styles.payTitle}>Pay after the cleaning</Txt>
                    </View>
                    <Txt style={styles.payBody}>
                        Every payment is charged the morning after your service is done. Nothing leaves your account before
                        your home is clean.
                    </Txt>
                </View>

                {/* ── reassurance ── */}
                <View style={styles.trust}>
                    {TRUST.map(t => (
                        <View key={t} style={styles.trustTile}>
                            <Txt style={styles.trustText}>{t}</Txt>
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* ── footer ── */}
            <View style={styles.footer}>
                {error ? <Txt style={styles.errorBanner}>{error}</Txt> : null}
                <Pressable
                    style={[styles.cta, !canBook && styles.ctaOff]}
                    disabled={!canBook}
                    onPress={onBook}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canBook, busy: submitting }}
                    accessibilityLabel={`Book for ${formatMoney(quote.total, 'PLN', locale)}`}
                >
                    <Txt style={styles.ctaText}>{submitting ? 'Booking…' : "Let's book!"}</Txt>
                    <Txt style={styles.ctaPrice}>{formatMoney(quote.total, 'PLN', locale)}</Txt>
                </Pressable>
                <Txt style={styles.footNote}>
                    {phoneValid || phone.length === 0
                        ? `Free cancellation up to ${CANCELLATION_WINDOW_HOURS} hours before the visit.`
                        : 'That is not a Polish mobile number yet.'}
                </Txt>
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

    summary: { borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, padding: 18 },
    summaryTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
    summaryMeta: { fontSize: 13, color: colors.grey, marginTop: 3 },
    breakdown: { marginTop: 15, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
    lineLabel: { flex: 1, fontSize: 13, color: colors.grey },
    lineValue: { fontSize: 13, fontWeight: '700', color: colors.primary },
    lineCredit: { color: colors.success },
    totalRow: {
        flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
        marginTop: 13, paddingTop: 13, borderTopWidth: 1, borderTopColor: colors.border,
    },
    totalLabel: { fontSize: 16, fontWeight: '700', color: colors.primary },
    totalValue: { fontSize: 24, fontWeight: '700', letterSpacing: -0.24, color: colors.primary },

    sectionLabel: {
        fontSize: 12, fontWeight: '700', letterSpacing: 0.84, textTransform: 'uppercase',
        color: colors.grey, marginTop: 24, marginBottom: 10,
    },
    phoneRow: {
        height: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: 13,
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10,
    },
    phoneRowError: { borderColor: colors.danger },
    phonePrefix: { fontSize: 15, fontWeight: '700', color: colors.primary },
    phoneDivider: { width: 1, height: 20, backgroundColor: colors.border },
    phoneInput: { flex: 1, height: '100%', fontSize: 15, color: colors.primary },
    phoneHint: { fontSize: 12, lineHeight: 18, color: colors.grey, marginTop: 8 },

    invoiceRow: {
        marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bgLight, borderRadius: 14,
    },
    invoiceText: { fontSize: 13.5, fontWeight: '700', color: colors.blue },
    invoicePanel: { marginTop: 10, gap: 8 },
    invoiceRowFields: { flexDirection: 'row', gap: 8 },
    input: {
        height: 46, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
        paddingHorizontal: 14, fontSize: 14, color: colors.primary,
    },
    error: { fontSize: 12, color: colors.danger },

    payCard: { marginTop: 22, borderRadius: 14, backgroundColor: colors.bgLight, paddingVertical: 16, paddingHorizontal: 18 },
    payHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    payDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
    payTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
    payBody: { fontSize: 12.5, lineHeight: 18.75, color: colors.grey, marginTop: 7 },

    trust: { flexDirection: 'row', gap: 9, marginTop: 14 },
    trustTile: {
        flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 12,
        paddingVertical: 13, paddingHorizontal: 8, alignItems: 'center',
    },
    trustText: { fontSize: 11.5, fontWeight: '700', lineHeight: 15, color: colors.primary, textAlign: 'center' },

    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
    errorBanner: { fontSize: 12.5, color: colors.danger, marginBottom: 9 },
    cta: {
        height: 54, borderRadius: 15, backgroundColor: colors.salad,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    },
    ctaOff: { backgroundColor: colors.border },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    ctaPrice: { fontSize: 16, fontWeight: '700', color: 'rgba(20,19,56,0.55)' },
    footNote: { fontSize: 11.5, color: colors.grey, textAlign: 'center', marginTop: 9 },
});
