import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../context/ThemeContext';
// Safe dynamic loading for native modules (prevents crashes if APK was built without them)
let NativeBattery: any = null;
try {
  NativeBattery = require('expo-battery');
} catch {
  NativeBattery = null;
}

let NativeNetInfo: any = null;
try {
  const netModule = require('@react-native-community/netinfo');
  NativeNetInfo = netModule?.default || netModule;
} catch {
  NativeNetInfo = null;
}

interface DeviceInfoBarProps {
  themeColor?: string;
  containerStyle?: StyleProp<ViewStyle>;
  darkBackground?: boolean;
  compact?: boolean;
  showSeconds?: boolean;
}

export function DeviceInfoBar({
  themeColor,
  containerStyle,
  darkBackground = true,
  compact = false,
  showSeconds = true,
}: DeviceInfoBarProps) {
  const { isDark } = useAppTheme();
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [connectionType, setConnectionType] = useState<string>('unknown');
  const [netDetails, setNetDetails] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    let batteryLevelSub: any = null;
    let batteryStateSub: any = null;
    let unsubscribeNet: (() => void) | null = null;

    // 1. Initial Battery Check & Listener
    if (NativeBattery && typeof NativeBattery.getBatteryLevelAsync === 'function') {
      (async () => {
        try {
          const level = await NativeBattery.getBatteryLevelAsync();
          if (isMounted && typeof level === 'number' && level >= 0) {
            setBatteryLevel(Math.round(level * 100));
          }
          const state = await NativeBattery.getBatteryStateAsync();
          if (isMounted) {
            setIsCharging(
              state === NativeBattery.BatteryState?.CHARGING ||
              state === NativeBattery.BatteryState?.FULL
            );
          }
        } catch {}
      })();

      try {
        batteryLevelSub = NativeBattery.addBatteryLevelListener?.(({ batteryLevel }: any) => {
          if (isMounted && typeof batteryLevel === 'number' && batteryLevel >= 0) {
            setBatteryLevel(Math.round(batteryLevel * 100));
          }
        });
      } catch {}

      try {
        batteryStateSub = NativeBattery.addBatteryStateListener?.(({ batteryState }: any) => {
          if (isMounted) {
            setIsCharging(
              batteryState === NativeBattery.BatteryState?.CHARGING ||
              batteryState === NativeBattery.BatteryState?.FULL
            );
          }
        });
      } catch {}
    } else {
      // Fallback jika belum di-compile ke APK
      if (isMounted) setBatteryLevel(100);
    }

    // 2. NetInfo Listener
    if (NativeNetInfo && typeof NativeNetInfo.addEventListener === 'function') {
      try {
        unsubscribeNet = NativeNetInfo.addEventListener((state: any) => {
          if (isMounted) {
            setIsConnected(state.isConnected);
            setConnectionType(state.type || 'unknown');
            setNetDetails(state.details);
          }
        });
      } catch {}
    }

    // 3. Real-Time Clock Timer
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: showSeconds ? '2-digit' : undefined,
        hour12: false,
      });
      if (isMounted) setCurrentTime(timeStr);
    };

    updateTime();
    const clockInterval = setInterval(updateTime, 1000);

    return () => {
      isMounted = false;
      try { batteryLevelSub?.remove?.(); } catch {}
      try { batteryStateSub?.remove?.(); } catch {}
      try { unsubscribeNet?.(); } catch {}
      clearInterval(clockInterval);
    };
  }, [showSeconds]);

  // Battery icon & color determination
  const getBatteryIcon = () => {
    if (isCharging) return 'battery-charging-outline';
    if (batteryLevel === null) return 'battery-half-outline';
    if (batteryLevel >= 85) return 'battery-full-outline';
    if (batteryLevel >= 40) return 'battery-half-outline';
    return 'battery-dead-outline';
  };

  const getBatteryColor = () => {
    if (isCharging) return '#10B981';
    if (batteryLevel !== null && batteryLevel <= 20) return '#EF4444';
    if (batteryLevel !== null && batteryLevel <= 40) return '#F59E0B';
    return darkBackground || isDark ? '#94A3B8' : '#64748B';
  };

  // Connection icon & text
  const getNetworkIcon = (): keyof typeof Ionicons.glyphMap => {
    if (isConnected === false) return 'cloud-offline-outline';
    const typeUpper = (connectionType || '').toUpperCase();
    if (typeUpper === 'CELLULAR') return 'cellular-outline';
    if (typeUpper === 'WIFI') return 'wifi-outline';
    return isConnected ? 'wifi-outline' : 'alert-circle-outline';
  };

  const getNetworkLabel = () => {
    if (isConnected === false) return 'Offline';
    const typeUpper = (connectionType || '').toUpperCase();
    if (typeUpper === 'WIFI') return 'WiFi';
    if (typeUpper === 'CELLULAR') {
      const gen = netDetails?.cellularGeneration ? String(netDetails.cellularGeneration).toUpperCase() : '';
      return gen ? `Seluler ${gen}` : 'Seluler';
    }
    if (typeUpper === 'ETHERNET') return 'LAN';
    return isConnected ? 'Online' : 'Offline';
  };

  const isBgDark = darkBackground || isDark;
  const textColor = isBgDark ? '#CBD5E1' : '#475569';
  const textMuted = isBgDark ? '#94A3B8' : '#64748B';

  return (
    <View
      style={[
        styles.container,
        isBgDark ? styles.containerDark : styles.containerLight,
        compact && styles.containerCompact,
        containerStyle,
      ]}
    >
      {/* 1. Real-Time Clock */}
      <View style={styles.infoItem}>
        <Ionicons name="time-outline" size={13} color={themeColor || (isBgDark ? '#93C5FD' : '#2563EB')} />
        <Text style={[styles.infoText, { color: textColor }]}>
          {currentTime || '--:--:--'}
        </Text>
      </View>

      <View style={[styles.divider, isBgDark ? styles.dividerDark : styles.dividerLight]} />

      {/* 2. Network & Internet Status */}
      <View style={styles.infoItem}>
        <Ionicons
          name={getNetworkIcon()}
          size={13}
          color={isConnected ? '#10B981' : '#EF4444'}
        />
        <Text style={[styles.infoText, { color: isConnected ? textColor : '#EF4444' }]}>
          {getNetworkLabel()}
        </Text>
      </View>

      <View style={[styles.divider, isBgDark ? styles.dividerDark : styles.dividerLight]} />

      {/* 3. Battery Status & Percentage */}
      <View style={styles.infoItem}>
        <Ionicons name={getBatteryIcon()} size={14} color={getBatteryColor()} />
        <Text style={[styles.infoText, { color: getBatteryColor() }]}>
          {batteryLevel !== null ? `${batteryLevel}%` : '...'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  containerDark: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  containerLight: {
    backgroundColor: 'rgba(241, 245, 249, 0.95)',
    borderColor: 'rgba(203, 213, 225, 0.8)',
  },
  containerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  infoText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontVariant: ['tabular-nums'] as any,
  },
  divider: {
    width: 1,
    height: 12,
  },
  dividerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  dividerLight: {
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
  },
});
