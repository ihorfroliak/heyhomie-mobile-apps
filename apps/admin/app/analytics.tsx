import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions, demoCohortMissions, orderGateway } from '@heyhomie/api';
import {
    dashboardSummary,
    withinLastDays,
    cohortRetention,
    formatMoney,
    formatDuration,
    orderKpis,
    ordersByMonth,
    ordersWithinLastDays,
    orderClientProfiles,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Segmented } from '@heyhomie/ui';
import { BarChart, Donut } from '../components/Charts';

const locale: Locale = 'en';
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function Analytics() {
    const [showMore, setShowMore] = useState(false);
    const [period, setPeriod] = useState<'7' | '30' | 'all'>('all');

    // REAL orders through the gateway, filtered by the same period selector.
    const allOrders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot);
    const now = new Date().toISOString();
    const orders = period === 'all' ? allOrders : ordersWithinLastDays(allOrders, Number(period), now);
    const live = orderKpis(orders);
    const liveTrend = ordersByMonth(orders).map(m => ({ key: m.month.slice(5), value: m.revenue }));
    const liveClients = orderClientProfiles(orders);
    const repeatClients = liveClients.filter(c => c.orders > 1).length;

    // The mission analytics below need durations, assignment times and cohorts, which the
    // contract Order does not carry — so they stay on the sample missions.
    const missions = period === 'all' ? demoAnalyticsMissions : withinLastDays(demoAnalyticsMissions, Number(period));
    // Illustrative capacity, scaled to the selected window.
    const capacityDays = period === 'all' ? 30 : Number(period);
    const s = dashboardSummary(missions, { capacityMinutes: 3 * capacityDays * 60 });
    const cohorts = cohortRetention(demoCohortMissions, 3);

    const retColor = (v: number) => {
        if (v >= 0.75) return colors.success;
        if (v >= 0.4) return colors.warning;
        if (v > 0) return colors.danger;
        return colors.border;
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Analytics' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={{ marginBottom: spacing.md }}>
                    <Segmented
                        value={period}
                        onChange={k => setPeriod(k as '7' | '30' | 'all')}
                        options={[
                            { key: '7', label: '7 days' },
                            { key: '30', label: '30 days' },
                            { key: 'all', label: 'All' },
                        ]}
                    />
                </View>

                {/* PRIMARY — real numbers off the live orders, for the chosen period. */}
                <View style={styles.grid}>
                    <Hero label="Collected" value={formatMoney(live.revenue, live.currency, locale)} />
                    <Hero label="Orders" value={String(live.total)} />
                    <Hero label="Paid" value={String(live.paid)} />
                    <Hero label="Avg order" value={formatMoney(live.avgOrder, live.currency, locale)} />
                </View>
                <Txt style={styles.liveNote}>
                    {formatMoney(live.outstanding, live.currency, locale)} outstanding · {live.cancelRate}% canceled · {liveClients.length} clients
                    {repeatClients > 0 ? ` (${repeatClients} returning)` : ''}
                </Txt>

                {liveTrend.length > 0 ? (
                    <>
                        <Txt style={styles.section}>Collected by month · live</Txt>
                        <Card>
                            <BarChart data={liveTrend} width={300} height={130} color={colors.success} />
                        </Card>
                    </>
                ) : null}

                <Txt style={styles.section}>Mission analytics · sample data</Txt>
                <View style={styles.grid}>
                    <Hero label="Revenue" value={formatMoney(s.primary.revenue, 'PLN', locale)} />
                    <Hero label="Completed" value={String(s.primary.completed)} />
                    <Hero label="Completion" value={pct(s.primary.completionRate)} />
                    <Hero label="Avg value" value={formatMoney(s.primary.avgMissionValue, 'PLN', locale)} />
                </View>

                {/* Charts */}
                <Txt style={styles.section}>Revenue by day</Txt>
                <Card>
                    <BarChart data={s.charts.revenueByDay} width={300} height={150} color={colors.blue} formatKey={d => d.slice(8)} />
                </Card>

                <Txt style={styles.section}>Revenue by weekday</Txt>
                <Card>
                    <BarChart data={s.charts.revenueByWeekday} width={300} height={130} color={colors.blue} />
                </Card>

                <View style={styles.twoCol}>
                    <View style={styles.half}>
                        <Txt style={styles.section}>Completion</Txt>
                        <Card style={{ alignItems: 'center' }}>
                            <View style={styles.donutWrap}>
                                <Donut value={s.primary.completionRate} />
                                <View style={styles.donutCenter}>
                                    <Txt style={styles.donutValue}>{pct(s.primary.completionRate)}</Txt>
                                </View>
                            </View>
                        </Card>
                    </View>
                    <View style={styles.half}>
                        <Txt style={styles.section}>By plan</Txt>
                        <Card>
                            <BarChart data={s.charts.countByPlan} width={130} height={110} color={colors.salad} />
                        </Card>
                    </View>
                </View>

                <Txt style={styles.section}>Avg rating by city</Txt>
                <Card>
                    {s.charts.avgRatingByCity.map(c => (
                        <View key={c.key} style={styles.ratingRow}>
                            <Txt style={styles.ratingCity}>{c.key}</Txt>
                            <View style={styles.ratingTrack}>
                                <View style={[styles.ratingFill, { width: `${(c.value / 5) * 100}%` }]} />
                            </View>
                            <View style={styles.ratingValRow}>
                                <Txt style={styles.ratingVal}>{c.value.toFixed(1)}</Txt>
                                <Ionicons name="star" size={11} color={colors.warning} />
                            </View>
                        </View>
                    ))}
                </Card>

                <Txt style={styles.section}>Top homies</Txt>
                {s.charts.leaderboard.map((w, i) => (
                    <View key={w.homieId} style={styles.lbRow}>
                        <Txt style={styles.rank}>{i + 1}.</Txt>
                        <Txt style={styles.name}>{w.firstName}</Txt>
                        <Txt style={styles.meta}>{w.missions} missions</Txt>
                        <Txt style={styles.payout}>{formatMoney(w.payout, 'PLN', locale)}</Txt>
                    </View>
                ))}

                {/* Cohort retention — first-order month vs repeat activity */}
                <Txt style={styles.section}>Retention by cohort</Txt>
                <Card>
                    <View style={styles.cohortHead}>
                        <Txt style={[styles.cohortMonth, styles.cohortHeadText]}>Cohort</Txt>
                        <Txt style={[styles.cohortSize, styles.cohortHeadText]}>Size</Txt>
                        {['M0', 'M1', 'M2', 'M3'].map(h => (
                            <Txt key={h} style={[styles.cohortCell, styles.cohortHeadText]}>{h}</Txt>
                        ))}
                    </View>
                    {cohorts.map(c => (
                        <View key={c.month} style={styles.cohortRow}>
                            <Txt style={styles.cohortMonth}>{c.month}</Txt>
                            <Txt style={styles.cohortSize}>{c.size}</Txt>
                            {c.retention.map((v, k) => (
                                <View key={k} style={[styles.cohortChip, { backgroundColor: `${retColor(v)}22` }]}>
                                    <Txt style={[styles.cohortChipText, { color: retColor(v) }]}>{pct(v)}</Txt>
                                </View>
                            ))}
                        </View>
                    ))}
                    <Txt style={styles.cohortNote}>M0 = first-order month · each cell = share ordering again that month later.</Txt>
                </Card>

                {/* SECONDARY — collapsed by default so it doesn't crowd the view */}
                <Pressable style={styles.moreToggle} onPress={() => setShowMore(v => !v)}>
                    <Txt style={styles.moreText}>Additional metrics</Txt>
                    <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={16} color={colors.grey} />
                </Pressable>
                {showMore ? (
                    <View style={styles.moreGrid}>
                        <Mini label="Cancellation rate" value={pct(s.secondary.cancellationRate)} />
                        <Mini label="Repeat clients" value={pct(s.secondary.repeatRate)} />
                        <Mini label="Utilization" value={pct(s.secondary.utilization)} />
                        <Mini label="Avg time to assign" value={formatDuration(s.secondary.avgAssignmentMinutes)} />
                        <Mini label="Live now" value={String(s.secondary.live)} />
                        <Mini label="Searching" value={String(s.secondary.searching)} />
                    </View>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Hero = ({ label, value }: { label: string; value: string }) => (
    <Card variant="fill" style={styles.hero}>
        <Txt style={styles.heroLabel}>{label}</Txt>
        <Txt style={styles.heroValue}>{value}</Txt>
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
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    hero: { width: '47%' },
    heroLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    heroValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 4 },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.xl, marginBottom: spacing.sm },
    liveNote: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: spacing.sm },
    twoCol: { flexDirection: 'row', gap: spacing.md },
    half: { flex: 1 },
    donutWrap: { width: 110, height: 110, alignItems: 'center', justifyContent: 'center' },
    donutCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    donutValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
    ratingCity: { width: 64, color: colors.primary, fontSize: typography.sizes.small },
    ratingTrack: { flex: 1, height: 8, borderRadius: 6, backgroundColor: colors.bgLight, overflow: 'hidden' },
    ratingFill: { height: '100%', backgroundColor: colors.warning },
    ratingValRow: { width: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
    ratingVal: { color: colors.grey, fontSize: typography.sizes.caption },
    lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rank: { color: colors.grey, width: 22, fontSize: typography.sizes.small },
    name: { flex: 1, color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginRight: spacing.md },
    payout: { color: colors.success, fontWeight: '700', fontSize: typography.sizes.small },
    moreToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
    moreText: { color: colors.grey, fontSize: typography.sizes.small, fontWeight: '500' },
    cohortHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
    cohortHeadText: { color: colors.grey, fontSize: typography.sizes.caption, fontWeight: '600' },
    cohortRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    cohortMonth: { width: 62, color: colors.primary, fontSize: typography.sizes.caption },
    cohortSize: { width: 40, color: colors.grey, fontSize: typography.sizes.caption, textAlign: 'center' },
    cohortCell: { flex: 1, textAlign: 'center' },
    cohortChip: { flex: 1, marginHorizontal: 2, borderRadius: 6, paddingVertical: 4, alignItems: 'center' },
    cohortChipText: { fontSize: typography.sizes.caption, fontWeight: '700' },
    cohortNote: { color: colors.grey, fontSize: 10, marginTop: spacing.sm },
    moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    mini: { width: '47%', backgroundColor: colors.bgLight, borderRadius: 10, padding: spacing.md },
    miniValue: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary },
    miniLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
});
