import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '@heyhomie/design';
import { Button } from '@heyhomie/ui';

/**
 * Welcome — the app's front door. Until now the client app dropped straight into the
 * consent gate, so login and sign-up existed but were never reachable from a cold start.
 *
 * The three promises mirror the booking flow and the web page: pay after the service,
 * free cancellation up to 24 h, vetted homies. "Browse first" is deliberate — the price
 * calculator works without an account, and forcing a signup before showing value is the
 * fastest way to lose a first-time visitor.
 */
const PROMISES: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
    { icon: 'card-outline', title: 'Pay after the cleaning', body: 'Nothing is charged when you book.' },
    { icon: 'calendar-outline', title: 'Free cancellation', body: 'Change or cancel up to 24 h before.' },
    { icon: 'shield-checkmark-outline', title: 'Vetted homies', body: 'Every visit is insured.' },
];

export default function Welcome() {
    const router = useRouter();

    return (
        <SafeAreaView style={styles.safe}>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.body}>
                <View style={styles.hero}>
                    <View style={styles.logo}>
                        <Txt style={styles.logoText}>hh</Txt>
                    </View>
                    <Txt style={styles.h1}>A clean home,{'\n'}without the chase</Txt>
                    <Txt style={styles.sub}>Book a vetted homie in about a minute. Kraków and around.</Txt>
                </View>

                <View style={styles.promises}>
                    {PROMISES.map(p => (
                        <View key={p.title} style={styles.promise}>
                            <View style={styles.promiseIcon}>
                                <Ionicons name={p.icon} size={17} color={colors.primary} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Txt style={styles.promiseTitle}>{p.title}</Txt>
                                <Txt style={styles.promiseBody}>{p.body}</Txt>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.actions}>
                    <Button
                        label="Create an account"
                        variant="teal"
                        onPress={() => router.push('/register')}
                        accessibilityLabel="Create a HeyHomie account"
                    />
                    <Pressable onPress={() => router.push('/login')} style={styles.secondary} accessibilityRole="button">
                        <Txt style={styles.secondaryText}>I already have an account</Txt>
                    </Pressable>
                    <Pressable onPress={() => router.replace('/')} style={styles.browse} accessibilityRole="button">
                        <Txt style={styles.browseText}>Browse prices first</Txt>
                    </Pressable>
                </View>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { flex: 1, padding: spacing.xl, justifyContent: 'space-between' },
    hero: { marginTop: spacing.xxl },
    logo: {
        width: 52, height: 52, borderRadius: 16, backgroundColor: colors.salad,
        alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
    },
    logoText: { fontSize: 22, fontWeight: '800', color: colors.primary },
    h1: { fontSize: 34, lineHeight: 39, fontWeight: '800', color: colors.primary, letterSpacing: -0.5 },
    sub: { color: colors.grey, fontSize: typography.sizes.body, lineHeight: 22, marginTop: spacing.md },
    promises: { gap: spacing.md },
    promise: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    promiseIcon: {
        width: 34, height: 34, borderRadius: 10, backgroundColor: colors.bgLight,
        alignItems: 'center', justifyContent: 'center',
    },
    promiseTitle: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.small },
    promiseBody: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 1 },
    actions: { gap: spacing.sm },
    secondary: { alignItems: 'center', paddingVertical: spacing.md },
    secondaryText: { color: colors.primary, fontWeight: '600', fontSize: typography.sizes.small },
    browse: { alignItems: 'center', paddingVertical: spacing.xs },
    browseText: { color: colors.grey, fontSize: typography.sizes.small },
});
