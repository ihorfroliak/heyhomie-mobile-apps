import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Txt } from './Text';
import { colors, spacing, typography } from '@heyhomie/design';

interface Props {
    title: string;
    subtitle?: string;
}

/** Friendly placeholder for empty lists / no-data screens. */
export function EmptyState({ title, subtitle }: Props) {
    return (
        <View style={styles.wrap}>
            <Txt style={styles.title}>{title}</Txt>
            {subtitle ? <Txt style={styles.subtitle}>{subtitle}</Txt> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: spacing.xxl },
    title: { fontSize: typography.sizes.body, fontWeight: '500', color: colors.primary, textAlign: 'center' },
    subtitle: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.sm, textAlign: 'center' },
});
