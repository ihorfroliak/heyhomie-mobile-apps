import React, { useMemo, useSyncExternalStore } from 'react';
import { ScrollView, View, Pressable, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { orderGateway } from '@heyhomie/api';
import { formatMoney, serviceName, cityName, type Locale } from '@heyhomie/domain';
import { colors, spacing } from '@heyhomie/design';
import { useLocale } from '@heyhomie/ui';

/**
 * Home — ported from the "HeyHomie Client · Booking Flow v1" design.
 *
 * Layout, spacing and type sizes follow the design exactly; COLOURS come from the
 * design tokens rather than the hexes baked into that file, because the file predates
 * the brand refresh (heyhomie-shared/BRAND.md). Keeping one source of truth for colour
 * matters more than matching an older mint.
 *
 * Data is real: the next visit, its price and its service come from `orderGateway`.
 * The contract `Order` carries no homie or street address, so this screen shows what an
 * order genuinely knows and says plainly when the homie isn't assigned yet — it does
 * not invent a name or a rating to fill the design's slot.
 */
const greeting = (d: Date): string => {
    const h = d.getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
};

/** Best-effort display name from what an order carries (no name field in the contract). */
const nameFrom = (email?: string): string => {
    const local = email?.split('@')[0]?.split('.')[0];
    return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
};

const initials = (name: string): string => name.slice(0, 2).toUpperCase();

const OTHER_SERVICES: { id: string; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'flower_delivery', label: 'Flowers', icon: 'flower-outline' },
    { id: 'upholstery_cleaning', label: 'Carpets', icon: 'grid-outline' },
    { id: 'window_cleaning', label: 'Windows', icon: 'browsers-outline' },
];

export default function Home() {
    const locale = useLocale() as Locale;
    const router = useRouter();
    const orders = useSyncExternalStore(orderGateway.subscribe, orderGateway.ordersSnapshot, orderGateway.ordersSnapshot);

    const { next, last, who } = useMemo(() => {
        const nowIso = new Date().toISOString();
        const sorted = [...orders].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
        const upcoming = sorted.find(o => o.updatedAt >= nowIso && o.status === 'confirmed');
        const past = [...sorted].reverse().find(o => o.updatedAt < nowIso);
        return { next: upcoming, last: past, who: nameFrom((upcoming ?? past)?.contact?.email) };
    }, [orders]);

    const daysAway = next ? Math.max(0, Math.round((new Date(next.updatedAt).getTime() - Date.now()) / 86400000)) : 0;
    const when = next ? new Date(next.updatedAt) : null;

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <ScrollView contentContainerStyle={styles.body}>
                {/* ── header ── */}
                <View style={styles.header}>
                    <View>
                        <Txt style={styles.greeting}>{greeting(new Date())}</Txt>
                        <Txt style={styles.hello}>Hi, {who}</Txt>
                    </View>
                    <Pressable
                        style={styles.avatar}
                        onPress={() => router.push('/profile')}
                        accessibilityRole="button"
                        accessibilityLabel="Open your profile"
                    >
                        <Txt style={styles.avatarText}>{initials(who)}</Txt>
                    </Pressable>
                </View>

                {/* ── next visit (dark card) ── */}
                {next ? (
                    <Pressable
                        style={styles.trackCard}
                        onPress={() => router.push('/pending')}
                        accessibilityRole="button"
                        accessibilityLabel="Track your next cleaning"
                    >
                        <View style={styles.trackTop}>
                            <View style={styles.statusRow}>
                                <View style={styles.statusDot} />
                                <Txt style={styles.statusText}>Booked</Txt>
                            </View>
                            <Txt style={styles.trackAway}>
                                {daysAway === 0 ? 'today' : daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`}
                            </Txt>
                        </View>
                        <Txt style={styles.trackTitle}>{serviceName(next.serviceId ?? 'standard_cleaning', locale)}</Txt>
                        <Txt style={styles.trackMeta}>
                            {when?.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                            {' · '}
                            {when?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                            {next.cityId ? ` · ${cityName(next.cityId, locale)}` : ''}
                        </Txt>
                        <View style={styles.trackFooter}>
                            <View style={styles.homieAvatar}>
                                <Ionicons name="person-outline" size={13} color={colors.white} />
                            </View>
                            {/* The contract has no homie yet — say so instead of inventing one. */}
                            <Txt style={styles.homieName}>Homie assigned before the visit</Txt>
                            {next.payment?.amount != null ? (
                                <Txt style={styles.trackPrice}>{formatMoney(next.payment.amount, next.payment.currency ?? 'PLN', locale)}</Txt>
                            ) : null}
                        </View>
                    </Pressable>
                ) : null}

                {/* ── primary CTA ── */}
                <Pressable
                    style={styles.bookCard}
                    onPress={() => router.push('/book')}
                    accessibilityRole="button"
                    accessibilityLabel="Book a cleaning"
                >
                    <View style={{ flex: 1 }}>
                        <Txt style={styles.bookTitle}>Book a cleaning</Txt>
                        <Txt style={styles.bookSub}>From 189 zł · takes about a minute</Txt>
                    </View>
                    <View style={styles.bookArrow}>
                        <Ionicons name="arrow-forward" size={19} color={colors.salad} />
                    </View>
                </Pressable>

                {/* ── rebook the last one ── */}
                {last ? (
                    <Pressable
                        style={styles.rebook}
                        onPress={() => router.push('/book')}
                        accessibilityRole="button"
                        accessibilityLabel="Book the same cleaning again"
                    >
                        <View style={styles.rebookIcon}>
                            <Ionicons name="refresh" size={15} color={colors.blue} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Txt style={styles.rebookTitle}>Book the same again</Txt>
                            <Txt style={styles.rebookMeta}>
                                {serviceName(last.serviceId ?? 'standard_cleaning', locale)}
                                {last.cityId ? ` · ${cityName(last.cityId, locale)}` : ''}
                                {last.payment?.amount != null ? ` · ${formatMoney(last.payment.amount, 'PLN', locale)}` : ''}
                            </Txt>
                        </View>
                        <Ionicons name="chevron-forward" size={15} color={colors.grey} />
                    </Pressable>
                ) : null}

                {/* ── other services ── */}
                <Txt style={styles.sectionLabel}>Other services in Kraków</Txt>
                <View style={styles.grid}>
                    {OTHER_SERVICES.map(s => (
                        <Pressable
                            key={s.id}
                            style={styles.tile}
                            onPress={() => router.push('/book')}
                            accessibilityRole="button"
                            accessibilityLabel={s.label}
                        >
                            <View style={styles.tileIcon}>
                                <Ionicons name={s.icon} size={16} color={colors.blue} />
                            </View>
                            <Txt style={styles.tileLabel}>{s.label}</Txt>
                        </Pressable>
                    ))}
                </View>

                {/* ── support ── */}
                <Pressable style={styles.support} accessibilityRole="button" accessibilityLabel="Contact support">
                    <View style={styles.supportIcon}>
                        <Ionicons name="call-outline" size={14} color={colors.primary} />
                    </View>
                    <Txt style={styles.supportText}>
                        Need a hand? We answer <Txt style={styles.supportStrong}>7 days a week</Txt>
                    </Txt>
                    <Ionicons name="chevron-forward" size={15} color={colors.blue} />
                </Pressable>
            </ScrollView>
        </SafeAreaView>
    );
}

/* Numbers below mirror the design file 1:1; colours resolve through the tokens. */
const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    greeting: { fontSize: 13, color: colors.grey },
    hello: { fontSize: 26, fontWeight: '700', color: colors.primary, letterSpacing: -0.26, marginTop: 2 },
    avatar: {
        width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bgLight,
        borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { fontWeight: '700', fontSize: 14, color: colors.blue },

    trackCard: { marginTop: 22, borderRadius: 18, backgroundColor: colors.primary, padding: 20 },
    trackTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.salad },
    statusText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.69, textTransform: 'uppercase', color: colors.salad },
    trackAway: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
    trackTitle: { fontWeight: '700', fontSize: 19, color: colors.white, marginTop: 12 },
    trackMeta: { fontSize: 13, color: 'rgba(255,255,255,0.62)', marginTop: 4 },
    trackFooter: {
        flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 15, paddingTop: 15,
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)',
    },
    homieAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
    homieName: { flex: 1, fontSize: 12.5, color: 'rgba(255,255,255,0.72)' },
    trackPrice: { fontSize: 13, fontWeight: '700', color: colors.salad },

    bookCard: {
        marginTop: 14, borderRadius: 18, backgroundColor: colors.salad, padding: 20,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    bookTitle: { fontWeight: '700', fontSize: 19, color: colors.primary },
    bookSub: { fontSize: 13, color: 'rgba(20,19,56,0.6)', marginTop: 3 },
    bookArrow: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

    rebook: {
        marginTop: 10, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border,
        paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 13,
    },
    rebookIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center' },
    rebookTitle: { fontSize: 14.5, fontWeight: '700', color: colors.primary },
    rebookMeta: { fontSize: 12.5, color: colors.grey, marginTop: 2 },

    sectionLabel: {
        fontWeight: '700', fontSize: 12, letterSpacing: 0.84, textTransform: 'uppercase',
        color: colors.grey, marginTop: 26, marginBottom: 11,
    },
    grid: { flexDirection: 'row', gap: 9 },
    tile: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
    tileIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: colors.bgLight, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
    tileLabel: { fontSize: 12, fontWeight: '700', color: colors.primary, lineHeight: 15 },

    support: {
        marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bgLight, borderRadius: 14,
    },
    supportIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
    supportText: { flex: 1, fontSize: 12.5, lineHeight: 17.5, color: colors.grey },
    supportStrong: { color: colors.primary, fontWeight: '700' },
});
