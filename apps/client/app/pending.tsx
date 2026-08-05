import React, { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway } from '@heyhomie/api';
import { formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, EmptyState } from '@heyhomie/ui';

/**
 * Pending — what happens after "You're booked", for the order that is currently live.
 *
 * The four steps are the real order lifecycle, not decoration: an order is confirmed,
 * a homie is assigned, the visit happens, and payment is taken the morning AFTER the
 * visit (never at booking). The step a customer is on is derived from the order's own
 * status + payment status, so this screen can't drift from what the backend thinks.
 */
const locale: Locale = 'en';

type StepState = 'done' | 'active' | 'todo';

interface Step {
    key: string;
    title: string;
    body: string;
    icon: keyof typeof Ionicons.glyphMap;
    state: StepState;
}

/** Map the contract order onto the four customer-visible steps. */
function stepsFor(status: string, paidStatus?: string): Step[] {
    const done = status === 'completed' || status === 'paid';
    const paid = status === 'paid' || paidStatus === 'paid';
    const s = (cond: boolean, active: boolean): StepState => (cond ? 'done' : active ? 'active' : 'todo');
    return [
        { key: 'confirmed', title: 'Order confirmed', body: 'We have your booking.', icon: 'checkmark-circle-outline', state: s(true, false) },
        { key: 'homie', title: 'Homie assigned', body: 'We match you with a vetted homie before the visit.', icon: 'person-outline', state: s(done, !done) },
        { key: 'visit', title: 'Cleaning', body: 'Your homie arrives and works through the checklist.', icon: 'sparkles-outline', state: s(done, false) },
        { key: 'payment', title: 'Payment', body: 'Charged the morning after the visit — never before.', icon: 'card-outline', state: s(paid, done && !paid) },
    ];
}

const STATE_COLOR: Record<StepState, string> = {
    done: colors.success,
    active: colors.blue,
    todo: colors.border,
};

export default function Pending() {
    const router = useRouter();
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot, orderGateway.ordersSnapshot);

    // The live order = the most recent one that isn't finished or called off.
    const order = useMemo(() => {
        const live = orders.filter(o => o.status === 'confirmed' || o.status === 'completed');
        return live.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    }, [orders]);

    if (!order) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Stack.Screen options={{ headerShown: true, title: 'Your cleaning' }} />
                <View style={styles.emptyWrap}>
                    <EmptyState title="Nothing booked right now" subtitle="When you book a cleaning, you can follow it here from confirmation to payment." />
                    <Button label="Book a cleaning" variant="teal" onPress={() => router.push('/book')} style={{ marginTop: spacing.lg }} />
                </View>
            </SafeAreaView>
        );
    }

    const steps = stepsFor(order.status, order.payment?.status);
    const when = new Date(order.updatedAt);
    const amount = order.payment?.amount;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Your cleaning' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Card style={styles.headline}>
                    <Txt style={styles.headlineLabel}>
                        {order.status === 'completed' ? 'Cleaning done' : 'Booked'}
                    </Txt>
                    <Txt style={styles.headlineWhen}>
                        {when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </Txt>
                    {amount != null ? <Txt style={styles.headlineTotal}>{formatMoney(amount, order.payment?.currency ?? 'PLN', locale)}</Txt> : null}
                </Card>

                <Txt style={styles.section}>What happens next</Txt>
                <Card>
                    {steps.map((st, i) => (
                        <View key={st.key} style={styles.step}>
                            <View style={styles.rail}>
                                <View style={[styles.dot, { backgroundColor: STATE_COLOR[st.state] }]}>
                                    {st.state === 'done' ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                                </View>
                                {i < steps.length - 1 ? <View style={styles.line} /> : null}
                            </View>
                            <View style={styles.stepBody}>
                                <Txt style={[styles.stepTitle, st.state === 'todo' && styles.stepTitleMuted]}>{st.title}</Txt>
                                <Txt style={styles.stepText}>{st.body}</Txt>
                            </View>
                        </View>
                    ))}
                </Card>

                <Txt style={styles.section}>Need a change?</Txt>
                <Card>
                    <Pressable style={styles.action} onPress={() => router.push('/book')} accessibilityRole="button">
                        <Ionicons name="calendar-outline" size={17} color={colors.primary} />
                        <Txt style={styles.actionText}>Move this visit</Txt>
                        <Ionicons name="chevron-forward" size={15} color={colors.grey} style={{ marginLeft: 'auto' }} />
                    </Pressable>
                    <Txt style={styles.note}>Free until 24 h before the visit.</Txt>
                </Card>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.xl },
    headline: { alignItems: 'flex-start' },
    headlineLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    headlineWhen: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: 2 },
    headlineTotal: { fontSize: typography.sizes.h2, fontWeight: '800', color: colors.primary, marginTop: spacing.sm },
    section: { color: colors.grey, fontSize: typography.sizes.small, marginTop: spacing.xl, marginBottom: spacing.sm },
    step: { flexDirection: 'row', gap: spacing.md },
    rail: { alignItems: 'center', width: 22 },
    dot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    line: { width: 2, flex: 1, minHeight: 22, backgroundColor: colors.border, marginVertical: 2 },
    stepBody: { flex: 1, paddingBottom: spacing.lg },
    stepTitle: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    stepTitleMuted: { color: colors.grey },
    stepText: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2, lineHeight: 16 },
    action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
    actionText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.sm },
});
