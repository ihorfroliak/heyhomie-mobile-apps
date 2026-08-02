/**
 * Txt — the brand text primitive. Maps `fontWeight` to the matching Manrope face so
 * text renders in the real weight (not a synthetic bold), on native and web alike.
 *
 * Use this instead of RN `Text` in shared components and screens. The faces are loaded
 * once per app via `useFonts(...)` in each `_layout`; until they resolve, RN falls back
 * to the system font (no crash). Background: React 19 ignores `Text.defaultProps` and a
 * `Text.render` patch breaks react-native-web — a wrapper is the working approach.
 */
import React from 'react';
import { Text, StyleSheet, type TextProps, type TextStyle } from 'react-native';

/** fontWeight → the google-fonts family name (@expo-google-fonts/manrope). */
const FACE: Record<string, string> = {
    '300': 'Manrope_300Light',
    '400': 'Manrope_400Regular',
    normal: 'Manrope_400Regular',
    '500': 'Manrope_500Medium',
    '600': 'Manrope_600SemiBold',
    '700': 'Manrope_700Bold',
    bold: 'Manrope_700Bold',
    '800': 'Manrope_800ExtraBold',
};

export function Txt({ style, ...rest }: TextProps): React.ReactElement {
    const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
    const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
    const fontFamily = FACE[weight] ?? 'Manrope_400Regular';
    // Drop fontWeight — the family already encodes the weight, so we avoid a synthetic
    // bold stacked on top of a bold face.
    const { fontWeight: _drop, ...rely } = flat;
    return <Text {...rest} style={[{ fontFamily }, rely]} />;
}
