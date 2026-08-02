import React from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { homies } from '@heyhomie/api';
import { colors, spacing, typography } from '@heyhomie/design';

const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function Homies() {
    const router = useRouter();
    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                <View style={styles.headRow}>
                    <Txt style={styles.h1}>Homies</Txt>
                    {API_URL ? (
                        <View style={styles.headActions}>
                            <Pressable style={styles.headBtn} onPress={() => router.push('/members')}>
                                <Ionicons name="people-outline" size={15} color={colors.primary} />
                                <Txt style={styles.inviteText}>Members</Txt>
                            </Pressable>
                            <Pressable style={styles.headBtn} onPress={() => router.push('/invitations')}>
                                <Ionicons name="mail-outline" size={15} color={colors.primary} />
                                <Txt style={styles.inviteText}>Invites</Txt>
                            </Pressable>
                            <Pressable style={styles.invite} onPress={() => router.push('/invite')}>
                                <Ionicons name="person-add-outline" size={15} color={colors.primary} />
                                <Txt style={styles.inviteText}>Invite</Txt>
                            </Pressable>
                        </View>
                    ) : null}
                </View>
                {homies.map(h => (
                    <View key={h.id} style={styles.row}>
                        <View style={styles.avatar}>
                            <Txt style={styles.avatarText}>{h.firstName.slice(0, 1)}{h.lastInitial ?? ''}</Txt>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Txt style={styles.name}>
                                {h.firstName} {h.lastInitial ? `${h.lastInitial}.` : ''}
                            </Txt>
                            <Txt style={styles.meta}>
                                {h.city} · {h.services.join(', ')} · {h.workerType === 'b2b' ? 'B2B (contractor)' : 'Employee'}
                            </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <View style={styles.verifiedRow}>
                                <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                                <Txt style={styles.verified}>Verified</Txt>
                            </View>
                            <View style={styles.ratingRow}>
                                <Ionicons name="star" size={11} color={colors.warning} />
                                <Txt style={styles.rating}>{h.rating?.toFixed(1)}</Txt>
                            </View>
                        </View>
                    </View>
                ))}
                <View style={styles.row}>
                    <View style={[styles.avatar, { backgroundColor: colors.warning }]}>
                        <Txt style={styles.avatarText}>SP</Txt>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.name}>Sofia P.</Txt>
                        <Txt style={styles.meta}>krakow · new</Txt>
                    </View>
                    <Txt style={[styles.verified, { color: colors.warning }]}>Pending</Txt>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    h1: { fontSize: typography.sizes.h2, fontWeight: '700', color: colors.primary },
    headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    headBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
    invite: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.salad, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    inviteText: { color: colors.primary, fontSize: typography.sizes.small, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: colors.white, fontWeight: '700', fontSize: 12 },
    name: { fontWeight: '600', color: colors.primary, fontSize: typography.sizes.small },
    meta: { color: colors.grey, fontSize: typography.sizes.caption, marginTop: 2 },
    verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    verified: { color: colors.success, fontSize: typography.sizes.caption, fontWeight: '600' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    rating: { color: colors.grey, fontSize: typography.sizes.caption },
});
