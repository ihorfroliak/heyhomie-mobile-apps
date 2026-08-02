import React from 'react';
import { Pressable, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Txt } from './Text';
import { colors, radii, spacing } from '@heyhomie/design';

type Variant = 'primary' | 'teal' | 'ghost';

interface Props {
    label: string;
    onPress?: () => void;
    variant?: Variant;
    loading?: boolean;
    disabled?: boolean;
    style?: ViewStyle;
}

/** Brand button. `teal` is the main CTA, `ghost` is the outlined secondary. */
export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
    const isGhost = variant === 'ghost';
    const bg = variant === 'teal' ? colors.salad : variant === 'primary' ? colors.primary : colors.white;
    const fg = variant === 'primary' ? colors.white : colors.primary;
    return (
        <Pressable
            accessibilityRole="button"
            onPress={disabled || loading ? undefined : onPress}
            style={({ pressed }) => [
                styles.btn,
                { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
                isGhost && styles.ghost,
                style,
            ]}
        >
            {loading ? <ActivityIndicator color={fg} /> : <Txt style={[styles.label, { color: fg }]}>{label}</Txt>}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    btn: { height: 48, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
    ghost: { borderWidth: 1.5, borderColor: colors.salad },
    label: { fontSize: 15, fontWeight: '600' },
});
