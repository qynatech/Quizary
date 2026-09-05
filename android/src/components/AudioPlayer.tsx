import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Inline audio — mirip web <audio controls> Image 1 (0:00 / 0:09)
// pakai expo-audio (SDK 57) supaya putar di dalam app, bukan Linking ke browser
let useAudioPlayer: any = null;
let useAudioPlayerStatus: any = null;
try {
  const EA: any = require('expo-audio');
  useAudioPlayer = EA.useAudioPlayer;
  useAudioPlayerStatus = EA.useAudioPlayerStatus;
} catch {}

interface Props {
  uri: string;
  themeColor?: string;
  compact?: boolean;
}

export function AudioPlayer({ uri, themeColor = '#0EA5E9', compact }: Props) {
  if (!useAudioPlayer || !useAudioPlayerStatus) {
    return (
      <View style={[styles.container, compact && styles.compact, { backgroundColor: '#FFF', borderColor: '#E2E8F0' }]}>
        <Text style={{ color: '#64748B', fontSize: 12 }}>Audio tidak didukung — update app</Text>
      </View>
    );
  }

  const player = useAudioPlayer(uri);
  const status: any = useAudioPlayerStatus(player);
  const isPlaying = !!status?.playing;
  const currentTime = status?.currentTime ?? 0;
  const duration = status?.duration ?? 0;
  const isLoaded = status?.isLoaded ?? false;

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const sec = Math.floor(s);
    const m = Math.floor(sec / 60);
    const secR = sec % 60;
    return `${m}:${String(secR).padStart(2, '0')}`;
  };
  const progress = duration ? Math.min(1, currentTime / duration) : 0;

  const toggle = () => {
    if (!player) return;
    if (isPlaying) player.pause();
    else player.play();
  };

  return (
    <View style={[styles.container, compact && styles.compact, { backgroundColor: '#FFF', borderColor: '#E2E8F0' }]}>
      <TouchableOpacity onPress={toggle} style={[styles.playBtn, { backgroundColor: '#FFF' }]} activeOpacity={0.85}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#0F172A" style={!isPlaying ? { marginLeft: 2 } : undefined} />
      </TouchableOpacity>

      <Text style={styles.time}>{fmt(currentTime)} / {fmt(duration || 0)}</Text>

      <View style={styles.trackWrap}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          <View style={[styles.thumb, { left: `${progress * 100}%` }]} />
        </View>
      </View>

      <TouchableOpacity onPress={() => { if (player) player.seekTo(0); }} style={styles.volBtn}>
        <Ionicons name="volume-high-outline" size={18} color="#0F172A" />
      </TouchableOpacity>

      <Ionicons name="ellipsis-vertical" size={16} color="#64748B" />
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#FFF',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  compact: { marginVertical: 6, paddingVertical: 8 },
  playBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  time: { fontSize: 12, color: '#0F172A', fontVariant: ['tabular-nums'] as any, minWidth: 72 },
  trackWrap: { flex: 1, paddingHorizontal: 4 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', overflow: 'visible', position: 'relative' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: '#0F172A' },
  thumb: { position: 'absolute', top: -5, width: 14, height: 14, borderRadius: 7, backgroundColor: '#0F172A', marginLeft: -7 },
  volBtn: { padding: 4 },
});
