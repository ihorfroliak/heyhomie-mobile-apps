import React, { useSyncExternalStore } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway, type OrderStatus } from '@heyhomie/api';
import { serviceName } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, useLocale } from '@heyhomie/ui';

const STATUS_LABEL: Record<OrderStatus, string> = {
    confirmed: 'To do',
    completed: 'Completed, awaiting payment',
    paid: 'Paid',
    canceled: 'Canceled',
};

const DetailRow = ({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) => (
    <View style={styles.detailRow}>
        <View style={styles.detailLeft}>
            <Ionicons name={icon} size={15} color={colors.grey} />
            <Txt style={styles.detailLabel}>{label}</Txt>
        </View>
        <Txt style={styles.detailValue} numberOfLines={1}>{value}</Txt>
    </View>
);

export default function WorkerJobDetail() {
    const locale = useLocale();
    const { id } = useLocalSearchParams<{ id: string }>();
    // Live from the gateway so a Complete (and the later Paid) reflects instantly.
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const order = orders.find(o => o.id === id) ?? orderGateway.getOrder(id ?? '');

    if (!order) {
        return (
            <SafeAreaView style={styles.safe} edges={['top']}>
                <Stack.Screen options={{ headerShown: true, title: 'Job' }} />
                <View style={styles.missing}>
                    <Ionicons name="alert-circle-outline" size={26} color={colors.grey} />
                    <Txt style={styles.missingText}>This job is no longer available.</Txt>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Job' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.row}>
                    <Txt style={styles.title}>{order.serviceId ? serviceName(order.serviceId, locale) : 'Cleaning job'}</Txt>
                    <Txt style={styles.status}>{STATUS_LABEL[order.status]}</Txt>
                </View>

                <Card variant="fill" style={{ marginTop: spacing.md }}>
                    <DetailRow icon="location-outline" label="City" value={order.cityId ?? 'On the job sheet'} />
                    {order.contact?.phone ? <DetailRow icon="call-outline" label="Contact" value={order.contact.phone} /> : null}
                    <DetailRow icon="pricetag-outline" label="Reference" value={order.id} />
                </Card>

                <View style={styles.note}>
                    <Ionicons name="eye-off-outline" size={13} color={colors.grey} />
                    <Txt style={styles.noteText}>You see what a job needs — never client prices or payouts.</Txt>
                </View>

                <View style={styles.action}>
                    {order.status === 'confirmed' ? (
                        <Button label="Mark job complete" variant="teal" onPress={() => { void orderGateway.completeOrder(order.id, new Date().toISOString()); }} />
                    ) : order.status === 'completed' ? (
                        <View style={styles.infoRow}>
                            <Ionicons name="time-outline" size={18} color={colors.warning} />
                            <Txt style={styles.infoText}>Completed. Waiting for the client payment to settle.</Txt>
                        </View>
                    ) : order.status === 'paid' ? (
                        <View style={styles.infoRow}>
                            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                            <Txt style={[styles.infoText, { color: colors.success }]}>Paid. This job is fully settled.</Txt>
                        </View>
                    ) : (
                        <View style={styles.infoRow}>
                            <Ionicons name="close-circle-outline" size={18} color={colors.grey} />
                            <Txt style={styles.infoText}>This job was canceled.</Txt>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, flex: 1, marginRight: spacing.sm },
    status: { fontSize: typography.sizes.small, fontWeight: '600', color: colors.grey },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
    detailLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
    detailLabel: { color: colors.grey, fontSize: typography.sizes.small },
    detailValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: spacing.md },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: spacing.lg, justifyContent: 'center' },
    noteText: { color: colors.grey, fontSize: 11, textAlign: 'center' },
    action: { marginTop: spacing.xl },
    infoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    infoText: { color: colors.grey, fontSize: typography.sizes.small, textAlign: 'center' },
    missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    missingText: { color: colors.grey, fontSize: typography.sizes.small },
});
