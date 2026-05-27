import { useAppFonts } from '@/hooks/use-app-fonts';
import { useMetaFacebookAttSync } from '@/hooks/use-meta-facebook-att-sync';
import { useFirstLaunchNotificationPermission } from '@/hooks/use-notifications';
import { colors, type ColorPalette } from '@/constants/theme';
import { initAmplitude, logEvent } from '@/utils/analytics';
import { isAtLeastVersion } from '@/utils/app-version';
import {
  checkActiveChallengesNotifications,
  checkEndedChallenges,
  emitEndedChallengeResultAnalytics,
} from '@/utils/challenge-utils';
import {
  fetchAppVersionPolicy,
  getEffectiveMinVersion,
} from '@/utils/fetch-app-version-policy';
import {
  cancelDailyReminder,
  cleanupOldSchedules,
  getChallengeNotificationsEnabled,
  getGeneralNotificationsEnabled,
  setupDailyReminder,
} from '@/utils/notification-scheduler';
import { initializePaymentSubtypes } from '@/utils/payment-types';
import { showStoreUpdateAlert } from '@/utils/show-store-update-alert';
import { refreshWidgetWithCurrentMonth, resetMonthlyExpenseMaskInWidget } from '@/utils/widget-data-sync';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

interface StoreUpdateGateState {
  forceUpdate: boolean;
  message: string;
}

export function useRootLayoutBootstrap() {
  const { fontsLoaded, fontError } = useAppFonts();
  const colorScheme: 'light' = 'light';
  const [splashFinished, setSplashFinished] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [storeUpdateGate, setStoreUpdateGate] = useState<StoreUpdateGateState | null>(null);
  const storeAlertPresentedRef = useRef(false);
  const storeGateResumeFromBackgroundRef = useRef(false);
  const palette = colors[colorScheme] as ColorPalette;

  SplashScreen.preventAutoHideAsync().catch(() => {});

  useLayoutEffect(() => {
    async function prepare() {
      try {
        await SplashScreen.preventAutoHideAsync();

        const isExpoGo = Constants.appOwnership === 'expo';
        if (!isExpoGo && Updates.isEnabled) {
          try {
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
              return;
            }
          } catch {
            // ignore
          }
        }

        if (!__DEV__ && !isExpoGo) {
          const policy = await fetchAppVersionPolicy();
          if (policy != null) {
            const currentVersion = Constants.expoConfig?.version;
            const minRequired = getEffectiveMinVersion(policy);
            if (!isAtLeastVersion(currentVersion, minRequired)) {
              setStoreUpdateGate({
                forceUpdate: policy.forceUpdate,
                message: policy.message,
              });
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        await initAmplitude();
        await initializePaymentSubtypes();
        await logEvent('app_started', {
          timestamp: Date.now(),
          platform: Platform.OS,
          environment: __DEV__ ? 'development' : 'production',
          app_version: Constants.expoConfig?.version ?? 'unknown',
        });

        setSplashFinished(true);
        setAppIsReady(true);
      } catch (e) {
        console.warn('스플래시 처리 중 오류:', e);
        setSplashFinished(true);
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (!appIsReady || storeUpdateGate == null) {
      storeAlertPresentedRef.current = false;
      return;
    }
    if (storeAlertPresentedRef.current) return;
    storeAlertPresentedRef.current = true;
    showStoreUpdateAlert(storeUpdateGate.forceUpdate, storeUpdateGate.message, () => {
      setStoreUpdateGate(null);
    });
  }, [appIsReady, storeUpdateGate]);

  useEffect(() => {
    if (storeUpdateGate == null) return undefined;
    const sub = AppState.addEventListener('change', async (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        storeGateResumeFromBackgroundRef.current = true;
        return;
      }
      if (next !== 'active') return;
      if (__DEV__) return;
      if (Constants.appOwnership === 'expo') return;

      const resumedFromBackground = storeGateResumeFromBackgroundRef.current;
      storeGateResumeFromBackgroundRef.current = false;

      const policy = await fetchAppVersionPolicy();
      if (policy == null) return;
      const currentVersion = Constants.expoConfig?.version;
      const minRequired = getEffectiveMinVersion(policy);
      if (isAtLeastVersion(currentVersion, minRequired)) {
        setStoreUpdateGate(null);
        return;
      }
      if (resumedFromBackground) {
        showStoreUpdateAlert(storeUpdateGate.forceUpdate, storeUpdateGate.message, () => {
          setStoreUpdateGate(null);
        });
      }
    });
    return () => sub.remove();
  }, [storeUpdateGate]);

  const fontsReady = fontsLoaded || fontError != null;

  useEffect(() => {
    if (appIsReady && fontsReady) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [appIsReady, fontsReady]);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady && fontsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady, fontsReady]);

  const { permissionChecked } = useFirstLaunchNotificationPermission();

  useMetaFacebookAttSync(Boolean(permissionChecked && appIsReady));

  useEffect(() => {
    if (permissionChecked) {
      const setupNotifications = async () => {
        try {
          await cleanupOldSchedules();

          const [generalEnabled, challengeEnabled] = await Promise.all([
            getGeneralNotificationsEnabled(),
            getChallengeNotificationsEnabled(),
          ]);

          if (generalEnabled) {
            await setupDailyReminder();
          } else {
            await cancelDailyReminder();
          }

          if (challengeEnabled) {
            await checkActiveChallengesNotifications();
            await checkEndedChallenges();
          }
        } catch (error) {
          console.error('알림 설정 중 오류:', error);
        }
      };

      setupNotifications();
    }
  }, [permissionChecked]);

  useEffect(() => {
    if (!appIsReady) {
      return undefined;
    }

    const runEmit = () => {
      emitEndedChallengeResultAnalytics().catch((err) => {
        console.warn('[RootLayout] emitEndedChallengeResultAnalytics:', err);
      });
    };

    runEmit();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        runEmit();
      }
    });
    return () => sub.remove();
  }, [appIsReady]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    resetMonthlyExpenseMaskInWidget().catch(() => {});
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        resetMonthlyExpenseMaskInWidget().catch(() => {});
      }
      if (next === 'background' || next === 'inactive') {
        refreshWidgetWithCurrentMonth().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  const showApp =
    appIsReady &&
    fontsReady &&
    splashFinished &&
    !(storeUpdateGate?.forceUpdate === true);

  return { palette, onLayoutRootView, showApp };
}
