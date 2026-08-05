import React from 'react';
import { Pressable, StyleSheet, ActivityIndicator, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { Txt } from './Text';
import { colors, radii, spacing } from '@heyhomie/design';

type Variant = 'primary' | 'teal' | 'ghost';

/** Accessibility props are part of the public API — an icon-only or busy button must be
 *  describable to a screen reader, and types are what make that impossible to forget. */
interface Props extends Pick<PressableProps, 'accessibilityLabel' | 'accessibilityHint' | 'testID'> {
    label: string;
    onPress?: () => void;
    variant?: Variant;
    loading?: boolean;
    disabled?: boolean;
    /** Accepts an array/conditional style, the normal RN pattern — not just one object. */
    style?: StyleProp<ViewStyle>;
}

/** Brand button. `teal` is the main CTA, `ghost` is the outlined secondary. */
export function Button({ label, onPress, variant = 'primary', loading, disabled, style, accessibilityLabel, accessibilityHint, testID }: Props) {
    const isGhost = variant === 'ghost';
    const bg = variant === 'teal' ? colors.salad : variant === 'primary' ? colors.primary : colors.white;
    const fg = variant === 'primary' ? colors.white : colors.primary;
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={accessibilityHint}
            testID={testID}
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
