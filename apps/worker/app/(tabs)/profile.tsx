import React from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card } from '@heyhomie/ui';

const services = ['Cleaning', 'Windows', 'Upholstery'];
const langs = ['Polski', 'Українська', 'English'];
const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function Profile() {
    const router = useRouter();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <Txt style={styles.h1}>Profile</Txt>
                <Card variant="fill" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                    <View style={styles.avatar}>
                        <Txt style={styles.avatarText}>OL</Txt>
                    </View>
                    <Txt style={styles.name}>Olena Kovalenko</Txt>
                    <View style={styles.verifiedRow}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Txt style={styles.verified}>Verified homie</Txt>
                    </View>
                </Card>
                <View style={styles.statsRow}>
                    <Stat value="4.9" label="rating" />
                    <Stat value="128" label="missions" />
                    <Stat value="2024" label="since" />
                </View>
                <Txt style={styles.section}>Services</Txt>
                <Tags items={services} />
                <Txt style={styles.section}>Languages</Txt>
                <Tags items={langs} />

                <Pressable
                    style={styles.logout}
                    onPress={async () => {
                        // Full sign-out: revoke server-side + wipe tokens, then gate to login.
                        if (API_URL) { await auth.logout(); }
                        router.replace('/login');
                    }}
                >
                    <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                    <Txt style={styles.logoutText}>Log out</Txt>
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

const Stat = ({ value, label }: { value: string; label: string }) => (
    <View style={styles.stat}>
        <Txt style={styles.statValue}>{value}</Txt>
        <Txt style={styles.statLabel}>{label}</Txt>
    </View>
);

const Tags = ({ items }: { items: string[] }) => (
    <View style={styles.tags}>
        {items.map(t => (
            <Txt key={t} style={styles.tag}>
                {t}
            </Txt>
        ))}
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary, marginBottom: spacing.lg },
    avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 20 },
    name: { fontSize: typography.sizes.h3, fontWeight: '700', color: colors.primary, marginTop: spacing.sm },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    verified: { color: colors.success, fontWeight: '600', fontSize: typography.sizes.small },
    statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    stat: { flex: 1, alignItems: 'center', backgroundColor: colors.bgLight, borderRadius: 12, paddingVertical: spacing.md },
    statValue: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.h3 },
    statLabel: { color: colors.grey, fontSize: typography.sizes.caption },
    section: { fontSize: typography.sizes.small, color: colors.grey, marginTop: spacing.lg, marginBottom: spacing.sm },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    tag: { backgroundColor: colors.bgLight, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, fontSize: typography.sizes.small, color: colors.primary },
    logout: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xl, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border },
    logoutText: { fontSize: typography.sizes.body, color: colors.danger, fontWeight: '600' },
});
