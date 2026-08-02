import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatMoney, type Locale } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button, useLocale } from '@heyhomie/ui';

const queue = [
    { id: 'h1', name: 'Olena K.', iban: '•• 3421', amount: 1340 },
    { id: 'h2', name: 'Marta W.', iban: '•• 7788', amount: 980 },
    { id: 'h3', name: 'Yulia D.', iban: '•• 1102', amount: 760 },
];

export default function Payouts() {
    const locale = useLocale();
    const total = queue.reduce((s, q) => s + q.amount, 0);
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Txt style={styles.h1}>Payouts</Txt>
                <Card variant="fill" style={{ marginBottom: spacing.lg }}>
                    <Txt style={styles.kLabel}>Pending this run</Txt>
                    <Txt style={styles.kValue}>{formatMoney(total, 'PLN', locale)}</Txt>
                    <Txt style={styles.note}>{queue.length} homies · paid on the 1st & 15th</Txt>
                </Card>
                {queue.map(q => (
                    <View key={q.id} style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Txt style={styles.name}>{q.name}</Txt>
                            <Txt style={styles.meta}>IBAN {q.iban}</Txt>
                        </View>
                        <Txt style={styles.amount}>{formatMoney(q.amount, 'PLN', locale)}</Txt>
                        <Button label="Process" variant="ghost" style={styles.btn} onPress={() => {}} />
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    kLabel: { color: colors.grey, fontSize: typography.sizes.small },
    kValue: { fontSize: typography.sizes.h1, fontWeight: '700', color: colors.primary },
    note: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption },
    amount: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    btn: { height: 36, paddingHorizontal: 14 },
});
