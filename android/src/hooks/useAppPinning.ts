import { useCallback, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';

/**
 * Hook for Android App Pinning (Screen Pinning / Lock Task).
 * - Uses native module AppPinning (Kotlin) when available (Dev Client / APK)
 * - Gracefully degrades on Expo Go / Web / iOS -> no-op with isExpoGo=true
 *
 * Screen pinning (startLockTask without Device Owner) shows system dialog
 * "Pin this app?" and blocks Home/Recent until user long-presses Back+Recent.
 * Unpin still triggers server lock (existing flow) so it is safe.
 */
type AppPinningNative = {
  startPinning: () => Promise<boolean>;
  stopPinning: () => Promise<boolean>;
  isPinned: () => Promise<boolean>;
};

function getNative(): AppPinningNative | null {
  if (Platform.OS !== 'android') return null;
  const m = (NativeModules as any).AppPinning as AppPinningNative | undefined;
  return m ?? null;
}

function isExpoGo(): boolean {
  const ownership = (Constants as any).appOwnership;
  if (ownership === 'expo') return true;
  // Expo Go detection should NOT depend on native missing.
  // Dev Client with broken native should report canPin=false, not isExpoGo=true.
  return false;
}

export function useAppPinning() {
  const [isPinning, setIsPinning] = useState(false);
  const native = getNative();
  const expoGo = isExpoGo();
  const nativeMissing = Platform.OS === 'android' && !native;
  const canPin = Platform.OS === 'android' && !!native && !expoGo;

  const pin = useCallback(async (): Promise<boolean> => {
    if (!canPin || !native) return false;
    if (isPinning) return true;
    try {
      setIsPinning(true);
      await native.startPinning();
      return true;
    } catch (e) {
      console.warn('[AppPinning] startPinning failed:', e);
      setIsPinning(false);
      return false;
    }
  }, [canPin, native, isPinning]);

  const unpin = useCallback(async (): Promise<boolean> => {
    if (!native) return true;
    try {
      await native.stopPinning();
      setIsPinning(false);
      return true;
    } catch (e) {
      // Not in lock task is not an error
      console.warn('[AppPinning] stopPinning failed (may not be pinned):', e);
      setIsPinning(false);
      return false;
    }
  }, [native]);

  const checkPinned = useCallback(async (): Promise<boolean> => {
    if (!native) return false;
    try {
      const v = await native.isPinned();
      setIsPinning(!!v);
      return !!v;
    } catch {
      return false;
    }
  }, [native]);

  return { pin, unpin, checkPinned, canPin, isExpoGo: expoGo, nativeMissing, isPinning };
}
