import React, { useState } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Txt } from '@heyhomie/ui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { makeDataRequest, type DataRequestType } from '@heyhomie/domain';
import { colors, spacing, typography } from '@heyhomie/design';
import { Card, Button } from '@heyhomie/ui';

const USER_ID = 'c1'; // demo

export default function PrivacyData() {
    const [message, setMessage] = useState<string | null>(null);
    const [confirmErase, setConfirmErase] = useState(false);

    const submit = (type: DataRequestType) => {
        const req = makeDataRequest(type, USER_ID);
        // When live: POST this to the backend (GDPR/RODO request log).
        if (type === 'export') setMessage("We received your request. We'll email a copy of your data within 30 days.");
        if (type === 'erasure') setMessage('Your account is scheduled for deletion. You will receive a confirmation.');
        void req;
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>
            <Stack.Screen options={{ headerShown: true, title: 'Privacy & data' }} />
            <ScrollView contentContainerStyle={styles.body}>
                <Txt style={styles.intro}>Under the GDPR / RODO you can access, export or delete your personal data at any time.</Txt>

                <Card style={styles.card}>
                    <Txt style={styles.title}>Export my data</Txt>
                    <Txt style={styles.meta}>Get a copy of your account, orders and missions.</Txt>
                    <Button label="Request data export" variant="ghost" style={{ marginTop: spacing.md }} onPress={() => submit('export')} />
                </Card>

                <Card style={styles.card}>
                    <Txt style={[styles.title, { color: colors.danger }]}>Delete my account</Txt>
                    <Txt style={styles.meta}>Permanently erase your account and personal data (right to erasure). This cannot be undone.</Txt>
                    {!confirmErase ? (
                        <Button label="Delete account" variant="ghost" style={[styles.danger, { marginTop: spacing.md }]} onPress={() => setConfirmErase(true)} />
                    ) : (
                        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                            <Txt style={styles.confirm}>Are you sure? This is permanent.</Txt>
                            <Button label="Yes, delete my account" variant="ghost" style={styles.danger} onPress={() => submit('erasure')} />
                            <Button label="Cancel" variant="ghost" onPress={() => setConfirmErase(false)} />
                        </View>
                    )}
                </Card>

                {message ? (
                    <Card variant="fill" style={{ marginTop: spacing.md }}>
                        <Txt style={styles.ok}>{message}</Txt>
                    </Card>
                ) : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.white },
    body: { padding: spacing.lg },
    intro: { color: colors.grey, fontSize: typography.sizes.small, marginBottom: spacing.lg },
    card: { marginBottom: spacing.md },
    title: { fontWeight: '700', color: colors.primary, fontSize: typography.sizes.body },
    meta: { color: colors.grey, fontSize: typography.sizes.small, marginTop: 4 },
    danger: { borderColor: colors.danger },
    confirm: { color: colors.danger, fontSize: typography.sizes.small },
    ok: { color: colors.success, fontSize: typography.sizes.small },
});
