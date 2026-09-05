import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { getThemeGradientColors } from './QuizBackground';

interface Props {
  visible: boolean;
  countdown: number; // 5..0
  themeColor?: string;
  onReenter: () => void;
  isPinned?: boolean;
  isExpoGo?: boolean;
}

export function RestrictedWarningOverlay({ visible, countdown, themeColor, onReenter, isPinned, isExpoGo }: Props) {
  if (!visible) return null;
  const gradient = getThemeGradientColors(themeColor || '#6C5CE7');

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <LinearGradient colors={gradient} style={StyleSheet.absoluteFill} />
      <View style={styles.center}>
        {/* Locked icon badge */}
        <View style={styles.iconCircle}>
          <Ionicons name="lock-closed-outline" size={36} color="#FFF" />
        </View>

        <Text style={styles.title}>Exam locked</Text>

        {/* Countdown card - glass */}
        <View style={styles.countdownCard}>
          <Text style={styles.countdownLabel}>KEMBALI DALAM</Text>
          <Text style={styles.countdownNumber}>{countdown}</Text>
          <Text style={styles.countdownHint}>detik atau ujian akan dikunci</Text>
        </View>

        <Text style={styles.warningText}>
          {isPinned
            ? 'App dipin — tekan Recent (kotak) lama + Back untuk keluar akan langsung terkunci. Segera kembali!'
            : isExpoGo
              ? 'Mode Expo Go: pin tidak aktif. Anda keluar dari app — kembali sebelum 5 detik atau akan terkunci.'
              : 'Peringatan: Anda keluar dari app. Segera kembali sebelum hitungan habis!'}
        </Text>

        <TouchableOpacity style={styles.cta} onPress={onReenter} activeOpacity={0.9}>
          <Ionicons name="lock-closed-outline" size={18} color={themeColor || '#0EA5E9'} />
          <Text style={[styles.ctaText, { color: themeColor || '#0EA5E9' }]}>Lock again &amp; continue</Text>
        </TouchableOpacity>

        <Text style={styles.footnote}>
          Jika hitungan mencapai 0, ujian dikunci &amp; menunggu pengawas.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 16 },
  countdownCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  countdownNumber: { color: '#FFF', fontSize: 56, fontWeight: '900', lineHeight: 56 },
  countdownHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  warningText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 18,
    maxWidth: 320,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  ctaText: { fontSize: 15, fontWeight: '800' },
  footnote: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    maxWidth: 300,
    lineHeight: 16,
  },
});
