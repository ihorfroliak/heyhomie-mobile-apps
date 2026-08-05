import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LocaleProvider } from '@heyhomie/ui';
import { orderGateway, configureAuth, auth, seedDemoStore } from '@heyhomie/api';
import { kv, secureStore } from '../lib/store';
import {
    useFonts,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Montserrat_500Medium } from '@expo-google-fonts/montserrat';

// Backend selection (Build 22): present → real server via httpOrderGateway; absent → offline Local adapter.
const API_URL = process.env.EXPO_PUBLIC_ORDERS_API_URL;

export default function RootLayout() {
    const router = useRouter();
    // Load the Manrope faces once; the <Txt> primitive maps fontWeight → the face.
    useFonts({ Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold, Montserrat_500Medium });
    // Startup: configure auth + refresh a live session before the gateway connects;
    // gate to /login when there is no valid session. Offline build: no-op + Local adapter.
    useEffect(() => {
        let mounted = true;
        void (async () => {
            if (API_URL) {
                configureAuth({ baseUrl: API_URL, store: secureStore });
                const authed = await auth.bootstrap();
                await orderGateway.init(kv);
                if (mounted && !authed) router.replace('/login');
            } else {
                // Offline demo: no backend, so populate a realistic book of business the
                // first time only (never overwrites data you already have).
                await seedDemoStore(kv);
                await orderGateway.init(kv);
            }
        })();
        return () => { mounted = false; };
    }, []);

    return (
        <SafeAreaProvider>
            <LocaleProvider initial="en">
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }} />
            </LocaleProvider>
        </SafeAreaProvider>
    );
}
