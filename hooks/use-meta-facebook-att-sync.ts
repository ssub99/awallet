import Constants from 'expo-constants';
import * as TrackingTransparency from 'expo-tracking-transparency';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

/**
 * Meta 설치 캠페인: iOS ATT 후 Facebook SDK 초기화 및 AdvertiserTrackingEnabled 반영.
 * Expo Go에서는 스킵. 알림 권한 처리 이후 `enabled`로 켜 시스템 팝업이 겹치지 않게 함.
 */
export function useMetaFacebookAttSync(enabled: boolean) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || ranRef.current) {
      return undefined;
    }
    if (Platform.OS === 'web') {
      return undefined;
    }
    // Expo Go: FB SDK 네이티브 모듈 없음. `expoClient`는 더 이상 존재하지 않음(SDK 50+).
    if (Constants.appOwnership === 'expo') {
      return undefined;
    }

    let cancelled = false;
    ranRef.current = true;

    void (async () => {
      try {
        const { Settings } = await import('react-native-fbsdk-next');

        if (Platform.OS === 'ios') {
          let { status } = await TrackingTransparency.getTrackingPermissionsAsync();
          if (cancelled) return;
          if (status === 'undetermined') {
            await new Promise<void>((resolve) => {
              setTimeout(resolve, 600);
            });
            if (cancelled) return;
            ({ status } = await TrackingTransparency.requestTrackingPermissionsAsync());
          }
          if (cancelled) return;
          Settings.initializeSDK();
          await Settings.setAdvertiserTrackingEnabled(status === 'granted');
        } else {
          if (cancelled) return;
          Settings.initializeSDK();
        }
      } catch {
        // 네이티브 미포함 빌드 등
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}
