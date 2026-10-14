import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, LogBox, Text, TextInput } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { ThemeProvider as AppThemeProvider, useAppTheme } from '../context/ThemeContext';
import { getMe, getToken, getStoredUser, removeToken } from '../services/api_service';
import { AlertProvider } from '../context/AlertContext';

import { processPendingSubmissions } from '../services/offline_sync_service';

// Set global default font family to Poppins
if ((Text as any).defaultProps) {
  (Text as any).defaultProps.style = { fontFamily: 'Poppins_400Regular', ...((Text as any).defaultProps.style || {}) };
} else {
  (Text as any).defaultProps = { style: { fontFamily: 'Poppins_400Regular' } };
}

if ((TextInput as any).defaultProps) {
  (TextInput as any).defaultProps.style = { fontFamily: 'Poppins_400Regular', ...((TextInput as any).defaultProps.style || {}) };
} else {
  (TextInput as any).defaultProps = { style: { fontFamily: 'Poppins_400Regular' } };
}

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  'DateTimePicker: `onChange` is deprecated',
  'DateTimePicker: `onChange` is deprecated. Use `onValueChange`',
  'SafeAreaView has been deprecated',
  '"shadow*" style props are deprecated',
  'props.pointerEvents is deprecated',
  'Animated: `useNativeDriver` is not supported',
  'TouchableWithoutFeedback is deprecated',
]);

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { colors, isDark } = useAppTheme();
  const [checkingSession, setCheckingSession] = useState(true);
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      try {
        const token = await getToken();
        if (token) {
          try {
            const user = await getMe();
            // Jika user belum verifikasi OTP, arahkan ke verify_otp tapi jangan hapus token
            if (user && user.email_verified_at === null) {
              if (mounted) router.replace({ pathname: '/verify_otp', params: { email: user.email } } as any);
            } else if (user) {
              // User valid dan terverifikasi -> auto remember me ke home jika masih di index
              // Jangan paksa redirect jika sudah di tabs, biar deep link tetap jalan
            }
          } catch (e: any) {
            const msg = String(e?.message || '');
            const isNetwork = msg.includes('Gagal terhubung') || msg.includes('Network');
            const is401 = msg.includes('401') || msg.toLowerCase().includes('unauthorized') || msg.includes('Invalid token');
            // Network error: keep token for offline, allow auto login via stored user
            if (isNetwork) {
              const stored = await getStoredUser();
              if (stored) {
                // Biarkan tetap login meski offline
              } else {
                // Tidak ada stored user tapi ada token, anggap masih valid offline
              }
            } else if (is401 || msg.includes('Token') || msg.toLowerCase().includes('sesi')) {
              await removeToken();
            } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
              // /me 404 jarang, jangan hapus token dulu
            } else {
              // Untuk error lain, jangan hapus token otomatis; biarkan user tetap terlogin
              // Hanya hapus jika benar-benar 401
              const looksLikeAuth = msg.toLowerCase().includes('auth') || msg.includes('401');
              if (looksLikeAuth) await removeToken();
            }
          }
        }
      } catch (e) {
        // Jangan hapus token di sini, sudah ditangani di dalam
        console.log('[CHECK AUTH] outer error', e);
      } finally {
        if (mounted) {
          setCheckingSession(false);
          await SplashScreen.hideAsync();
        }
      }
    }
    checkAuth();

    // Background auto-sync worker for offline submissions — cepat biar status langsung kekirim tanpa nunggu refresh manual
    processPendingSubmissions().catch(() => {});
    const interval = setInterval(() => {
      processPendingSubmissions().catch(() => {});
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (checkingSession || !fontsLoaded) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {/* Daftarkan rute secara eksplisit di sini */}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="register" />
        <Stack.Screen name="verify_otp" />
        <Stack.Screen name="forgot_password" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="quiz" />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AlertProvider>
        <RootStack />
      </AlertProvider>
    </AppThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});