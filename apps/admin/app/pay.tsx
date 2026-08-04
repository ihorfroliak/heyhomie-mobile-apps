import React, { useState, useSyncExternalStore } from 'react';
import { ScrollView, View, TextInput, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoAnalyticsMissions, demoTips, homies, payoutGateway } from '@heyhomie/api';
import {
    missionPayout,
    monthlyPayout,
    tipsForOrder,
    totalTips,
    payoutWithTips,
    formatMoney,
    payoutTotals,
    workerPayoutSummaries,
    PAYOUT_RATES,
    type WorkerType,
    type Mission,
    type Locale,
} from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const locale: Locale = 'en';
const YEAR = 2025;
const MONTH = 5;
const done = demoAnalyticsMissions.filter(m => m.status === 'done');

/** homieId -> engagement type, from the roster (contract data when live). */
const TYPE_BY_HOMIE: Record<string, WorkerType> = Object.fromEntries(homies.map(h => [h.id, h.workerType]));
const typeFor = (m: Mission): WorkerType => (m.homie ? (TYPE_BY_HOMIE[m.homie.id] ?? 'employee') : 'employee');

const num = (s: string): number | undefined => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
};

const STATUS_COLOR: Record<string, string> = {
    pending: colors.warning,
    approved: colors.blue,
    paid: colors.success,
    canceled: colors.grey,
};

export default function Pay() {
    // LIVE ledger — the real record of what is owed and what has been settled.
    const ledger = useSyncExternalStore(payoutGateway.subscribe, payoutGateway.snapshot, payoutGateway.snapshot);
    const ledgerTotals = payoutTotals(ledger);
    const byWorker = workerPayoutSummaries(ledger);
    const [busy, setBusy] = useState(false);
    const [saveNote, setSaveNote] = useState<string | null>(null);

    const act = (fn: () => Promise<unknown>) => () => {
        setBusy(true);
        void fn()
            .catch((e: unknown) => setSaveNote((e as Error).message ?? 'action failed'))
            .finally(() => setBusy(false));
    };

    const [overridesText, setOverridesText] = useState<Record<string, string>>({});
    const [bonusText, setBonusText] = useState('');
    // Payout % per engagement type — admin-editable, seeded from PAYOUT_RATES.
    const [ratesText, setRatesText] = useState<Record<WorkerType, string>>({
        employee: String(PAYOUT_RATES.employee * 100),
        b2b: String(PAYOUT_RATES.b2b * 100),
    });
    const rateOf = (t: WorkerType): number => {
        const pct = num(ratesText[t]);
        return pct != null && pct >= 0 && pct <= 100 ? pct / 100 : PAYOUT_RATES[t];
    };
    const shareFor = (m: Mission) => rateOf(typeFor(m));

    const overrides: Record<string, number> = {};
    for (const [id, t] of Object.entries(overridesText)) {
        const v = num(t);
        if (v != null) overrides[id] = v;
    }

    const result = monthlyPayout({ missions: done, year: YEAR, month: MONTH, overrides, bonus: num(bonusText) ?? 0, shareFor });
    const monthTips = done.flatMap(m => tipsForOrder(demoTips, m.id));
    const tipsTotal = totalTips(monthTips);

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Worker pay' }} />
            <ScrollView contentContainerStyle={styles.body}>
                {/* ── LIVE ledger: what we actually owe, and settling it ── */}
                <View style={styles.sectionRow}>
                    <Ionicons name="wallet-outline" size={14} color={colors.grey} />
                    <Txt style={styles.sectionText}>Payout ledger · live</Txt>
                </View>
                <Card variant="fill">
                    <Line label={`Owed (${ledgerTotals.count} entries)`} value={formatMoney(ledgerTotals.owed, 'PLN', locale)} strong />
                    <Line label="…awaiting approval" value={formatMoney(ledgerTotals.pending, 'PLN', locale)} />
                    <Line label="…approved, not transferred" value={formatMoney(ledgerTotals.approved, 'PLN', locale)} />
                    <Line label="Already paid" value={formatMoney(ledgerTotals.paid, 'PLN', locale)} />
                </Card>

                {byWorker.map(w => (
                    <Card key={w.workerId} style={styles.ledgerCard}>
                        <View style={styles.ledgerHead}>
                            <Txt style={styles.title}>
                                {w.workerId} · {w.workerType === 'b2b' ? 'B2B' : 'UZ'}
                            </Txt>
                            <Txt style={styles.owed}>{formatMoney(w.totals.owed, 'PLN', locale)} owed</Txt>
                        </View>
                        <Txt style={styles.meta}>
                            {w.jobs} {w.jobs === 1 ? 'job' : 'jobs'} · {formatMoney(w.totals.paid, 'PLN', locale)} paid
                        </Txt>
                        {ledger
                            .filter(p => p.workerId === w.workerId && p.status !== 'canceled')
                            .map(p => (
                                <View key={p.id} style={styles.entryRow}>
                                    <View style={{ flex: 1 }}>
                                        <Txt style={styles.entryMain}>
                                            {formatMoney(p.amount, 'PLN', locale)} · {p.kind}
                                            {p.orderId ? ` · ${p.orderId.slice(0, 10)}` : ''}
                                        </Txt>
                                        <Txt style={[styles.entryStatus, { color: STATUS_COLOR[p.status] }]}>{p.status}</Txt>
                                    </View>
                                    {p.status === 'pending' ? (
                                        <Pressable disabled={busy} onPress={act(() => payoutGateway.approve(p.id))} style={styles.action}>
                                            <Txt style={styles.actionText}>Approve</Txt>
                                        </Pressable>
                                    ) : null}
                                    {p.status === 'approved' ? (
                                        <Pressable disabled={busy} onPress={act(() => payoutGateway.pay(p.id))} style={[styles.action, styles.actionPay]}>
                                            <Txt style={styles.actionText}>Mark paid</Txt>
                                        </Pressable>
                                    ) : null}
                                </View>
                            ))}
                    </Card>
                ))}

                {ledger.length === 0 ? <Txt style={styles.sub}>No payouts recorded yet — use “Record to ledger” below once you have settled the month.</Txt> : null}
                {saveNote ? <Txt style={styles.saveNote}>{saveNote}</Txt> : null}

                <View style={styles.sectionRow}>
                    <Ionicons name="calculator-outline" size={14} color={colors.grey} />
                    <Txt style={styles.sectionText}>Monthly calculator · sample missions</Txt>
                </View>
                <Txt style={styles.sub}>Adjust the final pay per mission. Leave blank to use the rate for the homie's engagement type.</Txt>

                <View style={styles.sectionRow}>
                    <Ionicons name="options-outline" size={14} color={colors.grey} />
                    <Txt style={styles.sectionText}>Payout rates by engagement type</Txt>
                </View>
                <Card style={{ marginBottom: spacing.md }}>
                    {(['employee', 'b2b'] as WorkerType[]).map(t => (
                        <View key={t} style={styles.rateRow}>
                            <Txt style={styles.rateLabel}>{t === 'employee' ? 'Employee (umowa zlecenia)' : 'B2B (subcontractor)'}</Txt>
                            <View style={styles.rateCtrl}>
                                <TextInput
                                    style={styles.rateInput}
                                    keyboardType="number-pad"
                                    value={ratesText[t]}
                                    onChangeText={v => setRatesText(prev => ({ ...prev, [t]: v }))}
                                />
                                <Txt style={styles.ratePct}>%</Txt>
                            </View>
                        </View>
                    ))}
                </Card>

                {done.map(m => {
                    const t = typeFor(m);
                    const def = missionPayout(m, { share: rateOf(t) });
                    const tip = totalTips(tipsForOrder(demoTips, m.id));
                    const initials = m.homie?.firstName ? m.homie.firstName.slice(0, 2).toUpperCase() : '?';
                    return (
                        <Card key={m.id} style={styles.row}>
                            <View style={styles.avatar}>
                                <Txt style={styles.avatarText}>{initials}</Txt>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Txt style={styles.title}>
                                    {m.homie?.firstName} · {m.scheduledAt.slice(0, 10)}
                                </Txt>
                                <Txt style={styles.meta}>
                                    {m.plan} · {t === 'b2b' ? 'B2B' : 'UZ'} {Math.round(rateOf(t) * 100)}% · price {formatMoney(m.price, 'PLN', locale)} · default {formatMoney(def, 'PLN', locale)}
                                </Txt>
                                {tip > 0 ? (
                                    <View style={styles.tipRow}>
                                        <Ionicons name="heart" size={11} color={colors.success} />
                                        <Txt style={styles.tipText}>tip {formatMoney(tip, 'PLN', locale)}</Txt>
                                    </View>
                                ) : null}
                            </View>
                            <TextInput
                                style={styles.input}
                                keyboardType="number-pad"
                                placeholder={String(def)}
                                placeholderTextColor={colors.grey}
                                value={overridesText[m.id] ?? ''}
                                onChangeText={t => setOverridesText(prev => ({ ...prev, [m.id]: t }))}
                            />
                        </Card>
                    );
                })}

                <View style={styles.sectionRow}>
                    <Ionicons name="add-circle-outline" size={14} color={colors.grey} />
                    <Txt style={styles.sectionText}>Monthly bonus / adjustment</Txt>
                </View>
                <TextInput
                    style={[styles.input, { width: '100%' }]}
                    keyboardType="numbers-and-punctuation"
                    placeholder="0"
                    placeholderTextColor={colors.grey}
                    value={bonusText}
                    onChangeText={setBonusText}
                />

                <Card variant="fill" style={{ marginTop: spacing.lg }}>
                    <Line label={`Missions (${result.count})`} value={formatMoney(result.gross, 'PLN', locale)} />
                    <Line label="Bonus" value={formatMoney(result.bonus, 'PLN', locale)} />
                    <Line label="Tips (100% to worker)" value={formatMoney(tipsTotal, 'PLN', locale)} />
                    <View style={styles.divider} />
                    <Line label="Total incl. tips" value={formatMoney(payoutWithTips(result.total, monthTips), 'PLN', locale)} strong />
                </Card>

                {/* Writes the computed pay into the LIVE ledger (was a dead button before
                    the payout backend existed). Each mission becomes one `job` entry; the
                    monthly bonus becomes a separate entry. Already-recorded missions are
                    skipped by the service's one-payout-per-order guard. */}
                <Button
                    label={busy ? 'Recording…' : 'Record to ledger'}
                    variant="teal"
                    style={{ marginTop: spacing.lg }}
                    onPress={act(async () => {
                        let added = 0;
                        let skipped = 0;
                        for (const m of done) {
                            if (!m.homie) continue;
                            const t = typeFor(m);
                            try {
                                await payoutGateway.createForJob({
                                    workerId: m.homie.firstName,
                                    workerType: t,
                                    orderId: m.id,
                                    orderAmount: m.price,
                                    override: overrides[m.id],
                                });
                                added++;
                            } catch {
                                skipped++; // already recorded for this order
                            }
                        }
                        const bonus = num(bonusText) ?? 0;
                        if (bonus !== 0 && done[0]?.homie) {
                            await payoutGateway.createAdjustment({
                                workerId: done[0].homie.firstName,
                                workerType: typeFor(done[0]),
                                kind: bonus > 0 ? 'bonus' : 'adjustment',
                                amount: bonus,
                                note: 'monthly bonus',
                            });
                            added++;
                        }
                        setSaveNote(`Recorded ${added}${skipped ? ` · ${skipped} already in the ledger` : ''}`);
                    })}
                />
            </ScrollView>
        </SafeAreaView>
    );
}

const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
    <View style={styles.line}>
        <Txt style={[styles.lineLabel, strong && styles.strong]}>{label}</Txt>
        <Txt style={[styles.lineValue, strong && styles.strong]}>{value}</Txt>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    sub: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.md },
    ledgerCard: { marginTop: spacing.sm },
    ledgerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    owed: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    entryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    entryMain: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    entryStatus: { fontSize: typography.sizes.caption, marginTop: 1, textTransform: 'capitalize' },
    action: { backgroundColor: colors.bgLight, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    actionPay: { backgroundColor: colors.salad },
    actionText: { color: colors.primary, fontSize: typography.sizes.caption, fontWeight: '700' },
    saveNote: { color: colors.success, fontSize: typography.sizes.caption, marginTop: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontSize: 11, fontWeight: '700' },
    title: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    tipRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    tipText: { color: colors.success, fontSize: typography.sizes.caption, fontWeight: '600' },
    input: { width: 80, height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, color: colors.primary, textAlign: 'right' },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.lg, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    rateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
    rateLabel: { color: colors.primary, fontSize: typography.sizes.small, flex: 1 },
    rateCtrl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rateInput: { width: 56, height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: 8, textAlign: 'right', paddingHorizontal: 8, color: colors.primary, fontWeight: '700' },
    ratePct: { color: colors.grey, fontSize: typography.sizes.small },
    line: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
    lineLabel: { color: colors.grey, fontSize: typography.sizes.small },
    lineValue: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '500' },
    strong: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.body },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
});
