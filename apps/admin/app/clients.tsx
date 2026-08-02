import React, { useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway } from '@heyhomie/api';
import { orderClientProfiles, segmentFor, segmentCounts, formatMoney, type Segment, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, EmptyState } from '@heyhomie/ui';

const locale: Locale = 'en';

const SEGMENT_META: Record<Segment, { label: string; color: string }> = {
    champion: { label: 'Champion', color: colors.success },
    loyal: { label: 'Loyal', color: colors.blue },
    new: { label: 'New', color: colors.salad },
    at_risk: { label: 'At risk', color: colors.warning },
    lost: { label: 'Lost', color: colors.danger },
};

export default function Clients() {
    const router = useRouter();
    // Live orders from the gateway → per-client rollup (see domain/orderAnalytics).
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot, orderGateway.ordersSnapshot);
    const profiles = orderClientProfiles(orders);
    const ref = new Date().toISOString();
    const counts = segmentCounts(profiles, ref);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Clients' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {profiles.length === 0 ? <EmptyState title="No clients yet" subtitle="Client profiles build up from real orders as they come in." /> : null}
                <View style={styles.chips}>
                    {(Object.keys(counts) as Segment[])
                        .filter(s => counts[s] > 0)
                        .map(s => (
                            <View key={s} style={[styles.chip, { backgroundColor: `${SEGMENT_META[s].color}1A` }]}>
                                <Txt style={[styles.chipText, { color: SEGMENT_META[s].color }]}>
                                    {SEGMENT_META[s].label} · {counts[s]}
                                </Txt>
                            </View>
                        ))}
                </View>

                {profiles.map(p => {
                    const seg = segmentFor(p, ref);
                    return (
                        <Pressable key={p.id} onPress={() => router.push(`/client/${p.id}`)}>
                            <Card style={styles.row}>
                                <View style={styles.avatar}>
                                    <Txt style={styles.avatarText}>{p.label.slice(0, 1).toUpperCase()}</Txt>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Txt style={styles.name}>{p.label}</Txt>
                                    <View style={styles.metaRow}>
                                        <Ionicons name="location-outline" size={11} color={colors.grey} />
                                        <Txt style={styles.meta}>
                                            {p.city ? `${p.city} · ` : ''}
                                            {p.orders} {p.orders === 1 ? 'order' : 'orders'}
                                            {p.paidOrders < p.orders ? ` · ${p.paidOrders} paid` : ''}
                                        </Txt>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Txt style={styles.ltv}>{formatMoney(p.totalSpent, 'PLN', locale)}</Txt>
                                    <View style={[styles.seg, { backgroundColor: `${SEGMENT_META[seg].color}1A` }]}>
                                        <Txt style={[styles.segText, { color: SEGMENT_META[seg].color }]}>{SEGMENT_META[seg].label}</Txt>
                                    </View>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.grey} style={{ marginLeft: spacing.sm }} />
                            </Card>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.md },
    chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    chipText: { fontSize: typography.sizes.caption, fontWeight: '600' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 13 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    ltv: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    seg: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
    segText: { fontSize: 10, fontWeight: '600' },
});
