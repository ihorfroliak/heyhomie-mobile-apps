import React, { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Txt, useLocale } from '@heyhomie/ui';
import { orderGateway } from '@heyhomie/api';
import { arrivalSlot, formatMoney, serviceName, type Locale } from '@heyhomie/domain';
import { colors } from '@heyhomie/design';
import { parseSlot, prettyDay } from '../../lib/bookingFlow';

/**
 * "You're booked!" — ported from the design's success screen.
 *
 * It reads the order that was just created back out of `orderGateway` by id rather
 * than trusting whatever the previous screen had in hand: what the client is told
 * here is what the system actually stored. If the id no longer resolves the screen
 * says so instead of showing a confident summary of nothing.
 *
 * The three "what happens next" steps are the real lifecycle — matched, cleaned,
 * charged the morning after — the same one `/pending` derives its progress from.
 */
export default function BookingDone() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const { orderId, date, slot } = useLocalSearchParams<{ orderId?: string; date?: string; slot?: string }>();
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot, orderGateway.ordersSnapshot);

    const order = useMemo(() => orders.find(o => o.id === orderId), [orders, orderId]);

    /**
     * The visit slot the client just booked. It comes from the flow, not from the
     * order: the contract `Order` has only `updatedAt` (when it was booked), and
     * showing that as the visit would tell the client the wrong day.
     */
    const visit = typeof date === 'string' && date ? `${prettyDay(date, locale)} · ${arrivalSlot(parseSlot(slot))?.window ?? ''}` : null;
    const amount = order?.payment?.amount;
    const price = amount != null ? formatMoney(amount, order?.payment?.currency ?? 'PLN', locale) : null;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.tick}>
                    <Ionicons name="checkmark" size={32} color={colors.primary} />
                </View>

                <Txt style={styles.title}>{order ? "You're booked!" : 'Booking not found'}</Txt>
                {order ? (
                    <Txt style={styles.subtitle}>
                        {[order.serviceId ? serviceName(order.serviceId, locale) : null, visit, price].filter(Boolean).join(' · ')}
                    </Txt>
                ) : (
                    <Txt style={styles.subtitle}>
                        We couldn't find that booking on this device. Check Activity — if it isn't there either, nothing was
                        charged and you can book again.
                    </Txt>
                )}

                {order ? (
                    <View style={styles.next}>
                        <Txt style={styles.nextLabel}>What happens next</Txt>
                        <View style={styles.step}>
                            <View style={styles.dotOn} />
                            <Txt style={styles.stepText}>
                                <Txt style={styles.stepStrong}>Within a few hours</Txt> — we match you with a homie and text you
                                their name.
                            </Txt>
                        </View>
                        <View style={styles.step}>
                            <View style={styles.dotOff} />
                            <Txt style={styles.stepTextMuted}>
                                <Txt style={styles.stepStrong}>On the day</Txt> — we come along personally for your first cleaning.
                            </Txt>
                        </View>
                        <View style={styles.step}>
                            <View style={styles.dotOff} />
                            <Txt style={styles.stepTextMuted}>
                                <Txt style={styles.stepStrong}>The morning after</Txt> — we charge{price ? ` ${price}` : ''} and
                                email your invoice. Never before the visit.
                            </Txt>
                        </View>
                    </View>
                ) : null}

                <Pressable
                    style={styles.primary}
                    onPress={() => router.replace({ pathname: '/pending', params: orderId ? { orderId } : {} })}
                    accessibilityRole="button"
                    accessibilityLabel="Track my order"
                >
                    <Txt style={styles.primaryText}>Track my order</Txt>
                </Pressable>
                <Pressable
                    style={styles.secondary}
                    onPress={() => router.replace('/')}
                    accessibilityRole="button"
                    accessibilityLabel="Back to home"
                >
                    <Txt style={styles.secondaryText}>Back to home</Txt>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

/* Numbers below mirror the design file 1:1; colours resolve through the tokens. */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.primary },
    body: { paddingHorizontal: 24, paddingTop: 46, paddingBottom: 40 },

    tick: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.45, color: colors.white, marginTop: 24 },
    subtitle: { fontSize: 15, lineHeight: 23.25, color: 'rgba(255,255,255,0.7)', marginTop: 10 },

    next: { marginTop: 28, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', padding: 20 },
    nextLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.84, textTransform: 'uppercase', color: colors.salad },
    step: { flexDirection: 'row', gap: 13, marginTop: 15 },
    dotOn: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: colors.salad, marginTop: 5 },
    dotOff: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', marginTop: 5 },
    stepText: { flex: 1, fontSize: 13.5, lineHeight: 20.25, color: 'rgba(255,255,255,0.85)' },
    stepTextMuted: { flex: 1, fontSize: 13.5, lineHeight: 20.25, color: 'rgba(255,255,255,0.7)' },
    stepStrong: { color: colors.white, fontWeight: '700' },

    primary: { marginTop: 20, height: 52, borderRadius: 15, backgroundColor: colors.salad, alignItems: 'center', justifyContent: 'center' },
    primaryText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    secondary: {
        marginTop: 10, height: 52, borderRadius: 15, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
        alignItems: 'center', justifyContent: 'center',
    },
    secondaryText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
