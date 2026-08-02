import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway, demoAvailableMissions, demoAnalyticsMissions } from '@heyhomie/api';
import { dashboardSummary, formatDuration, formatMoney, orderKpis } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

type IconName = keyof typeof Ionicons.glyphMap;

const MANAGE_LINKS: { href: string; label: string; icon: IconName }[] = [
    { href: '/order-edit/new', label: 'New order (manual)', icon: 'add-circle-outline' },
    { href: '/coverage', label: 'Cities & services', icon: 'map-outline' },
    { href: '/analytics', label: 'Analytics & charts', icon: 'bar-chart-outline' },
    { href: '/pipeline', label: 'Pipeline (funnel · leads)', icon: 'funnel-outline' },
    { href: '/clients', label: 'Clients (CRM)', icon: 'people-outline' },
    { href: '/marketing', label: 'Marketing & ads', icon: 'megaphone-outline' },
    { href: '/finance', label: 'Finance & margins', icon: 'wallet-outline' },
    { href: '/invoices', label: 'Invoices (Stripe · Fakturownia)', icon: 'document-text-outline' },
    { href: '/contracts', label: 'Contracts & HR', icon: 'briefcase-outline' },
    { href: '/pay', label: 'Worker pay', icon: 'cash-outline' },
    { href: '/verification', label: 'Verification queue', icon: 'shield-checkmark-outline' },
    { href: '/quality', label: 'Quality reports', icon: 'ribbon-outline' },
    { href: '/inventory', label: 'Inventory (supplies)', icon: 'cube-outline' },
    { href: '/tickets', label: 'Support tickets', icon: 'chatbubbles-outline' },
];

export default function Dashboard() {
    const router = useRouter();
    const [showMore, setShowMore] = useState(false);
    // LIVE orders from the gateway (Local offline / HTTP when wired) → real KPIs.
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const k = orderKpis(orders);
    const confirmed = k.confirmed;
    // Secondary "additional metrics" stay on demo aggregates (no backend domain yet).
    const extra = dashboardSummary([...demoAnalyticsMissions, ...demoAvailableMissions], { capacityMinutes: 3 * 30 * 60 }).secondary;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.hero}>
                <Txt style={styles.heroSub}>Good to see you</Txt>
                <Txt style={styles.heroTitle}>Dashboard</Txt>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi icon="briefcase-outline" label="Orders" value={String(k.total)} />
                    <Kpi icon="pulse-outline" label="Confirmed" value={String(confirmed)} accent={colors.blue} />
                    <Kpi icon="checkmark-done-outline" label="Paid" value={String(k.paid)} accent={colors.success} />
                    <Kpi icon="close-circle-outline" label="Canceled" value={String(k.canceled)} />
                </View>

                {/* Money — real amounts off the same live orders. */}
                <Txt style={styles.section}>Money</Txt>
                <View style={styles.grid}>
                    <Kpi icon="wallet-outline" label="Collected" value={formatMoney(k.revenue, k.currency, 'en')} accent={colors.success} />
                    <Kpi icon="hourglass-outline" label="Outstanding" value={formatMoney(k.outstanding, k.currency, 'en')} accent={colors.warning} />
                    <Kpi icon="trending-up-outline" label="Avg order" value={formatMoney(k.avgOrder, k.currency, 'en')} />
                    <Kpi icon="remove-circle-outline" label="Cancel rate" value={`${k.cancelRate}%`} accent={k.cancelRate > 20 ? colors.danger : undefined} />
                </View>

                <Txt style={styles.section}>Needs attention</Txt>
                {confirmed > 0 ? (
                    <Pressable onPress={() => router.push('/missions')}>
                        <Card style={styles.alert}>
                            <View style={styles.alertRow}>
                                <Ionicons name="alert-circle" size={20} color={colors.danger} />
                                <View style={{ flex: 1 }}>
                                    <Txt style={styles.alertTitle}>{confirmed} order{confirmed > 1 ? 's' : ''} to fulfil</Txt>
                                    <Txt style={styles.alertSub}>Confirmed — complete once the job is done</Txt>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                            </View>
                        </Card>
                    </Pressable>
                ) : (
                    <View style={styles.okRow}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                        <Txt style={styles.ok}>No open orders.</Txt>
                    </View>
                )}

                <Txt style={styles.section}>Manage</Txt>
                {MANAGE_LINKS.map(l => (
                    <Pressable key={l.href} onPress={() => router.push(l.href)}>
                        <Card style={styles.link}>
                            <View style={styles.linkLeft}>
                                <Ionicons name={l.icon} size={17} color={colors.blue} />
                                <Txt style={styles.linkText}>{l.label}</Txt>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.grey} />
                        </Card>
                    </Pressable>
                ))}

                <Pressable style={styles.moreToggle} onPress={() => setShowMore(v => !v)}>
                    <Txt style={styles.moreText}>Additional metrics</Txt>
                    <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grey} />
                </Pressable>
                {showMore ? (
                    <View style={styles.miniGrid}>
                        <Mini label="Cancellation rate" value={`${Math.round(extra.cancellationRate * 100)}%`} />
                        <Mini label="Repeat clients" value={`${Math.round(extra.repeatRate * 100)}%`} />
                        <Mini label="Utilization" value={`${Math.round(extra.utilization * 100)}%`} />
                        <Mini label="Avg time to assign" value={formatDuration(extra.avgAssignmentMinutes)} />
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kpi = ({ icon, label, value, accent }: { icon: IconName; label: string; value: string; accent?: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Ionicons name={icon} size={16} color={accent ?? colors.grey} />
        <Txt style={styles.kLabel}>{label}</Txt>
        <Txt style={[styles.kValue, accent ? { color: accent } : null]}>{value}</Txt>
    </Card>
);

const Mini = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.mini}>
        <Txt style={styles.miniValue}>{value}</Txt>
        <Txt style={styles.miniLabel}>{label}</Txt>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    hero: { backgroundColor: colors.primary, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
    heroSub: { color: '#9C9BB0', fontSize: typography.sizes.caption },
    heroTitle: { color: colors.white, fontSize: typography.sizes.h2, fontWeight: '700', marginTop: 4 },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: -spacing.xl },
    kpi: { width: '47%' },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    alert: { borderWidth: 1, borderColor: colors.danger },
    alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    alertTitle: { fontWeight: '700', color: colors.primary },
    alertSub: { color: colors.danger, fontSize: typography.sizes.small, marginTop: 2 },
    okRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ok: { color: colors.success, fontSize: typography.sizes.small },
    link: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
    linkLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    linkText: { color: colors.primary, fontWeight: '500', fontSize: typography.sizes.small, flexShrink: 1 },
    moreToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    moreText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    mini: { width: '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: spacing.md },
    miniValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    miniLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
});
