import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import { orderGateway } from '@heyhomie/api';
import {
    accessMethod,
    cancellationFee,
    cityName,
    formatMoney,
    formatVisitSite,
    isLateCancellation,
    serviceName,
    tr,
    CANCELLATION_WINDOW_HOURS,
    type Locale,
} from '@heyhomie/domain';
import { colors } from '@heyhomie/design';

/**
 * "Your cleaning" — the tracking screen from the "HeyHomie Client · Booking Flow v1"
 * design, on the live order.
 *
 * The four rail steps are the real order lifecycle: an order is confirmed, a homie
 * is assigned, the visit happens, and payment is taken the morning AFTER the visit
 * (never at booking). Which step is live is derived from the order's own status and
 * payment status, so this screen cannot drift from what the backend thinks.
 *
 * The design's second step reads "Olena is your homie" with a personality blurb. The
 * contract `Order` carries no homie, so that step states what is actually true —
 * that a homie is matched before the visit — rather than naming an invented person.
 * Likewise the design's Address and Duration rows are dropped: neither is on the
 * order (see OPEN_ITEMS — the visit site stops at the app until a contract version
 * carries it), and a row filled with a plausible guess is worse than one absent.
 *
 * "Call it off" is real: it runs `orderGateway.cancelOrder`, behind a confirm tap,
 * and states the fee the cancellation policy would actually charge.
 */

type StepState = 'done' | 'active' | 'todo';

interface Step {
    key: string;
    title: string;
    body: string;
    state: StepState;
}

function stepsFor(status: string, paidStatus: string | undefined, when: string): Step[] {
    const done = status === 'completed' || status === 'paid';
    const paid = status === 'paid' || paidStatus === 'paid';
    const state = (reached: boolean, live: boolean): StepState => (reached ? 'done' : live ? 'active' : 'todo');
    return [
        { key: 'confirmed', title: 'Order confirmed', body: when, state: 'done' },
        { key: 'homie', title: 'Homie assigned', body: 'We match you with a vetted homie before the visit.', state: state(done, !done) },
        { key: 'visit', title: 'Cleaning in progress', body: 'Your homie works through the checklist.', state: state(done, false) },
        { key: 'payment', title: 'Payment charged', body: `Charged the morning after the visit — never before.`, state: state(paid, done && !paid) },
    ];
}

const DOT_COLOR: Record<StepState, string> = {
    done: colors.salad,
    active: colors.blue,
    todo: colors.border,
};

export default function Pending() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const { orderId } = useLocalSearchParams<{ orderId?: string }>();
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot, orderGateway.ordersSnapshot);
    const [confirmingCancel, setConfirmingCancel] = useState(false);

    /**
     * A specific order when one was named (arriving from "Track my order"), otherwise
     * the most recent live one. The explicit id matters: orders sort by `updatedAt`,
     * which the demo seed uses as the visit date, so a just-booked order would lose
     * the sort to a seeded future visit and the client would be shown someone else's.
     */
    const order = useMemo(() => {
        const named = orderId ? orders.find(o => o.id === orderId) : undefined;
        if (named) return named;
        const live = orders.filter(o => o.status === 'confirmed' || o.status === 'completed');
        return live.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    }, [orders, orderId]);

    if (!order) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <View style={styles.header}>
                    <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <Txt style={styles.title}>Your cleaning</Txt>
                </View>
                <View style={styles.empty}>
                    <Txt style={styles.emptyTitle}>Nothing booked right now</Txt>
                    <Txt style={styles.emptyText}>
                        When you book a cleaning you can follow it here, from confirmation through to payment.
                    </Txt>
                    <Pressable
                        style={styles.cta}
                        onPress={() => router.push('/booking/service')}
                        accessibilityRole="button"
                        accessibilityLabel="Book a cleaning"
                    >
                        <Txt style={styles.ctaText}>Book a cleaning</Txt>
                    </Pressable>
                </View>
            </SafeAreaView>
        );
    }

    const stamp = (iso: string) => {
        const d = new Date(iso);
        return `${d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
    };
    const bookedText = stamp(order.updatedAt);
    const steps = stepsFor(order.status, order.payment?.status, bookedText);
    const amount = order.payment?.amount;
    const nowIso = new Date().toISOString();
    const cancellable = order.status === 'confirmed';
    const canceled = order.status === 'canceled';

    /**
     * Contract v2 — the visit instant is on the order, so the cancellation policy can
     * finally be COMPUTED rather than merely stated. Before v2 the only timestamp
     * available was `updatedAt`, and measuring hours to a past moment told every
     * client they owed 50%.
     */
    const visitAt = order.scheduledAt;
    const late = visitAt ? isLateCancellation(visitAt, nowIso) : false;
    const fee = visitAt && amount != null ? cancellationFee(visitAt, nowIso, amount) : 0;

    const onCancel = () => {
        if (!confirmingCancel) {
            setConfirmingCancel(true);
            return;
        }
        orderGateway.cancelOrder(order.id);
        setConfirmingCancel(false);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.header}>
                    <Pressable style={styles.back} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
                        <Ionicons name="chevron-back" size={17} color={colors.primary} />
                    </Pressable>
                    <Txt style={styles.title}>Your cleaning</Txt>
                </View>

                {/* ── the rail (or the fact that there is nothing left to track) ── */}
                {canceled ? (
                    <View style={styles.canceledCard}>
                        <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                        <View style={{ flex: 1 }}>
                            <Txt style={styles.canceledTitle}>Called off</Txt>
                            <Txt style={styles.canceledBody}>
                                This cleaning is cancelled and nothing will be charged for it. Book again whenever you need us.
                            </Txt>
                        </View>
                    </View>
                ) : (
                <View style={styles.rail}>
                    {steps.map((s, i) => (
                        <View key={s.key}>
                            <View style={styles.step}>
                                <View style={[styles.dot, { backgroundColor: DOT_COLOR[s.state] }, s.state === 'todo' && styles.dotTodo]} />
                                <View style={{ flex: 1 }}>
                                    <Txt style={[styles.stepTitle, s.state === 'todo' && styles.muted]}>{s.title}</Txt>
                                    <Txt style={styles.stepBody}>{s.body}</Txt>
                                </View>
                            </View>
                            {i < steps.length - 1 ? (
                                <View style={[styles.connector, steps[i + 1].state !== 'todo' && styles.connectorOn]} />
                            ) : null}
                        </View>
                    ))}
                </View>
                )}

                {/* ── what the order knows ── */}
                <View style={styles.details}>
                    <View style={styles.detailRow}>
                        <Txt style={styles.detailLabel}>Service</Txt>
                        <Txt style={styles.detailValue}>{serviceName(order.serviceId ?? 'standard_cleaning', locale)}</Txt>
                    </View>
                    {/* Contract v2 — the real address, when the order carries one. */}
                    {order.site ? (
                        <View style={styles.detailRow}>
                            <Txt style={styles.detailLabel}>Address</Txt>
                            <Txt style={styles.detailValue}>{formatVisitSite(order.site)}</Txt>
                        </View>
                    ) : order.cityId ? (
                        <View style={styles.detailRow}>
                            <Txt style={styles.detailLabel}>City</Txt>
                            <Txt style={styles.detailValue}>{cityName(order.cityId, locale)}</Txt>
                        </View>
                    ) : null}
                    {order.site ? (
                        <View style={styles.detailRow}>
                            <Txt style={styles.detailLabel}>Getting in</Txt>
                            <Txt style={styles.detailValue}>{tr(accessMethod(order.site.access)?.label ?? { pl: '', en: '', uk: '' }, locale)}</Txt>
                        </View>
                    ) : null}
                    {/* Two different facts, kept apart: when the order was placed, and
                        when someone is cleaning. Contract v2 carries both. */}
                    {visitAt ? (
                        <View style={styles.detailRow}>
                            <Txt style={styles.detailLabel}>Visit</Txt>
                            <Txt style={styles.detailValue}>{stamp(visitAt)}</Txt>
                        </View>
                    ) : null}
                    <View style={styles.detailRow}>
                        <Txt style={styles.detailLabel}>Booked</Txt>
                        <Txt style={styles.detailValue}>{bookedText}</Txt>
                    </View>
                    <View style={[styles.detailRow, styles.detailRowLast]}>
                        <Txt style={styles.detailLabel}>Total</Txt>
                        <Txt style={styles.detailValue}>
                            {amount != null ? formatMoney(amount, order.payment?.currency ?? 'PLN', locale) : 'Confirmed after the visit'}
                        </Txt>
                    </View>
                </View>

                {/* ── actions ── */}
                {canceled ? (
                    <Pressable
                        style={styles.cta}
                        onPress={() => router.push('/booking/service')}
                        accessibilityRole="button"
                        accessibilityLabel="Book a cleaning"
                    >
                        <Txt style={styles.ctaText}>Book a cleaning</Txt>
                    </Pressable>
                ) : (
                <View style={styles.actions}>
                    <Pressable
                        style={styles.action}
                        onPress={() => router.push('/booking/when')}
                        accessibilityRole="button"
                        accessibilityLabel="Move this visit"
                    >
                        <Txt style={styles.actionText}>Move it</Txt>
                    </Pressable>
                    <Pressable
                        style={styles.action}
                        onPress={() => router.push('/profile')}
                        accessibilityRole="button"
                        accessibilityLabel="Message us"
                    >
                        <Txt style={styles.actionText}>Message us</Txt>
                    </Pressable>
                </View>
                )}

                {cancellable ? (
                    <Pressable
                        style={styles.cancel}
                        onPress={onCancel}
                        accessibilityRole="button"
                        accessibilityLabel={confirmingCancel ? 'Tap again to cancel this cleaning' : 'Cancel this cleaning'}
                    >
                        <Txt style={styles.cancelText}>
                            {confirmingCancel
                                ? 'Tap again to call it off'
                                : fee > 0
                                  ? `Call it off · ${formatMoney(fee, 'PLN', locale)} fee`
                                  : 'Call it off · free'}
                        </Txt>
                    </Pressable>
                ) : null}
                {canceled ? null : (
                    <Txt style={styles.cancelNote}>
                        {visitAt && late
                            ? `Inside the ${CANCELLATION_WINDOW_HOURS} h window, so half the price applies.`
                            : `Free up to ${CANCELLATION_WINDOW_HOURS} hours before the visit; inside that window half the price applies.`}
                    </Txt>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

/* Numbers below mirror the design file 1:1; colours resolve through the tokens. */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 },

    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 0 },
    back: {
        width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border,
        alignItems: 'center', justifyContent: 'center',
    },
    title: { fontSize: 19, fontWeight: '700', color: colors.primary },

    rail: { marginTop: 20, borderRadius: 18, backgroundColor: colors.bgLight, padding: 20 },
    step: { flexDirection: 'row', gap: 13 },
    dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    dotTodo: { borderWidth: 2, borderColor: colors.border, backgroundColor: 'transparent' },
    stepTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
    muted: { color: colors.grey },
    stepBody: { fontSize: 12, lineHeight: 17, color: colors.grey, marginTop: 1 },
    connector: { width: 2, height: 18, backgroundColor: colors.border, marginLeft: 4, marginVertical: 2 },
    connectorOn: { backgroundColor: colors.salad },

    details: { marginTop: 14, borderWidth: 1.5, borderColor: colors.border, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 6 },
    detailRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.bgLight,
    },
    detailRowLast: { borderBottomWidth: 0 },
    detailLabel: { fontSize: 13.5, color: colors.grey },
    detailValue: { fontSize: 13.5, fontWeight: '700', color: colors.primary, flexShrink: 1, textAlign: 'right' },

    actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
    action: { flex: 1, height: 48, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    actionText: { fontSize: 14, fontWeight: '700', color: colors.primary },
    cancel: { marginTop: 9, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 14, fontWeight: '700', color: colors.danger },
    cancelNote: { fontSize: 11.5, color: colors.grey, textAlign: 'center', marginTop: 2 },

    canceledCard: {
        marginTop: 20, borderRadius: 18, backgroundColor: colors.bgLight, padding: 20,
        flexDirection: 'row', alignItems: 'flex-start', gap: 13,
    },
    canceledTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
    canceledBody: { fontSize: 12.5, lineHeight: 18, color: colors.grey, marginTop: 2 },

    empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
    emptyTitle: { fontSize: 19, fontWeight: '700', color: colors.primary },
    emptyText: { fontSize: 13.5, lineHeight: 20, color: colors.grey, marginTop: 8 },
    cta: { marginTop: 20, height: 52, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    ctaText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
