import React, { useState } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { demoSupplies } from '@heyhomie/api';
import { inventoryValue, lowStockItems, reorderList, isLowStock, adjustStock, restock, replaceItem, formatMoney, type SupplyItem, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const locale: Locale = 'en';
const money = (n: number) => formatMoney(n, 'PLN', locale);

export default function Inventory() {
    // Local mock state — swap to API mutations (updateSupply) when the backend is wired.
    const [items, setItems] = useState<SupplyItem[]>(demoSupplies);
    const low = lowStockItems(items);
    const reorders = reorderList(items);
    const reorderCost = reorders.reduce((s, r) => s + r.cost, 0);

    const change = (item: SupplyItem, delta: number) => setItems(prev => replaceItem(prev, adjustStock(item, delta)));
    const doRestock = (item: SupplyItem) => setItems(prev => replaceItem(prev, restock(item)));
    const restockAll = () => setItems(prev => prev.map(i => (isLowStock(i) ? restock(i) : i)));

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Inventory' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.grid}>
                    <Kpi icon="cash-outline" label="Stock value" value={money(inventoryValue(items))} />
                    <Kpi icon="alert-circle-outline" label="Low stock" value={String(low.length)} color={low.length > 0 ? colors.danger : colors.primary} />
                </View>

                {reorders.length > 0 ? (
                    <>
                        <View style={styles.reorderHead}>
                            <View style={styles.sectionRow}>
                                <Ionicons name="repeat-outline" size={14} color={colors.grey} />
                                <Txt style={styles.sectionText}>Reorder suggestions · {money(reorderCost)}</Txt>
                            </View>
                            <Pressable style={styles.restockAll} onPress={restockAll}>
                                <Ionicons name="refresh-outline" size={12} color={colors.white} />
                                <Txt style={styles.restockAllText}>Restock all</Txt>
                            </Pressable>
                        </View>
                        <Card style={{ marginBottom: spacing.md }}>
                            {reorders.map(r => (
                                <View key={r.id} style={styles.rrow}>
                                    <Txt style={styles.name}>{r.name}</Txt>
                                    <Txt style={styles.qty}>+{r.suggestQty} · {money(r.cost)}</Txt>
                                </View>
                            ))}
                        </Card>
                    </>
                ) : null}

                <View style={styles.sectionRow}>
                    <Ionicons name="cube-outline" size={14} color={colors.grey} />
                    <Txt style={styles.sectionText}>All supplies</Txt>
                </View>
                {items.map(i => (
                    <Card key={i.id} style={styles.card}>
                        <View style={styles.row}>
                            <Txt style={styles.name}>{i.name}</Txt>
                            {isLowStock(i) ? <Txt style={styles.lowBadge}>Low</Txt> : null}
                        </View>
                        <Txt style={styles.meta}>
                            reorder at {i.reorderLevel} · {money(i.unitCost)}/{i.unit}
                        </Txt>
                        <View style={styles.controls}>
                            <View style={styles.stepper}>
                                <Pressable style={styles.stepBtn} onPress={() => change(i, -1)}>
                                    <Ionicons name="remove" size={16} color={colors.primary} />
                                </Pressable>
                                <Txt style={styles.stockValue}>{i.stock} {i.unit}</Txt>
                                <Pressable style={styles.stepBtn} onPress={() => change(i, 1)}>
                                    <Ionicons name="add" size={16} color={colors.primary} />
                                </Pressable>
                            </View>
                            {isLowStock(i) ? (
                                <Pressable style={styles.restockBtn} onPress={() => doRestock(i)}>
                                    <Txt style={styles.restockText}>Restock</Txt>
                                </Pressable>
                            ) : null}
                        </View>
                    </Card>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const Kpi = ({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string }) => (
    <Card variant="fill" style={styles.kpi}>
        <Ionicons name={icon} size={15} color={color ?? colors.grey} />
        <Txt style={styles.kLabel}>{label}</Txt>
        <Txt style={[styles.kValue, color ? { color } : null]}>{value}</Txt>
    </Card>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    grid: { flexDirection: 'row', gap: spacing.md },
    kpi: { flex: 1 },
    kLabel: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 6 },
    kValue: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginTop: 2 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xl, marginBottom: spacing.sm },
    sectionText: { fontSize: typography.sizes.small, color: colors.grey },
    reorderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    restockAll: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, marginBottom: spacing.sm },
    restockAllText: { color: colors.white, fontWeight: '600', fontSize: typography.sizes.caption },
    card: { marginBottom: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    rrow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    qty: { color: colors.primary, fontWeight: '700', fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 4 },
    lowBadge: { fontSize: 10, fontWeight: '700', color: colors.danger, backgroundColor: `${colors.danger}1A`, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    stepText: { fontSize: 20, color: colors.primary, fontWeight: '600', lineHeight: 22 },
    stockValue: { minWidth: 64, textAlign: 'center', fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    restockBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
    restockText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.caption },
});
