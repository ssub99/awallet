import { useAppFonts } from '@/hooks/use-app-fonts';
import { useMetaFacebookAttSync } from '@/hooks/use-meta-facebook-att-sync';
import {
  syncInAppNotificationSettingsWithOsPermission,
  useFirstLaunchNotificationPermission,
} from '@/hooks/use-notifications';
import { colors, type ColorPalette } from '@/constants/theme';
import { initAmplitude, logEvent } from '@/utils/analytics';
import { getAppVersion, isAtLeastVersion } from '@/utils/app-version';
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
import { ensureNoticeInstallBaseline } from '@/utils/notice-read-state';
import { showStoreUpdateAlert } from '@/utils/show-store-update-alert';
import {
  consumeWidgetTrampolineSplashOnAndroid,
  dismissWidgetMainSplashOverlayOnAndroid,
  refreshWidgetWithCurrentMonth,
  resetMonthlyExpenseMaskInWidget,
} from '@/utils/widget-data-sync';
import { flushPendingRecordInboxFromNative } from '@/utils/record-inbox-native-queue';
import { syncSmsReceiveSettingsToNative } from '@/utils/record-inbox-receive-settings';
import {
  onFirstScreenSplashRelease,
  releaseFirstScreenSplash,
} from '@/utils/first-screen-splash';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';

/** 첫 화면이 release 못 할 때 스플래시 고착 방지 */
const FIRST_SCREEN_SPLASH_FALLBACK_MS = 5000;

interface StoreUpdateGateState {
  forceUpdate: boolean;
  message: string;
}

/** [WidgetLaunchExtras.SPLASH_DURATION_MS] / prepare() 기본 스플래시 대기 */
const ROOT_SPLASH_MIN_MS = 2000;

export function useRootLayoutBootstrap() {
  const { fontsLoaded, fontError } = useAppFonts();
  const colorScheme: 'light' = 'light';
  const [splashFinished, setSplashFinished] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [storeUpdateGate, setStoreUpdateGate] = useState<StoreUpdateGateState | null>(null);
  const storeAlertPresentedRef = useRef(false);
  const storeGateResumeFromBackgroundRef = useRef(false);
  const palette = colors[colorScheme] as ColorPalette;

  useLayoutEffect(() => {
    async function prepare() {
      try {
        // 엔트리(`utils/prevent-splash-autohide`)에서 이미 선제 호출. 여기서는 확인만.
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
            const currentVersion = getAppVersion();
            const minRequired = getEffectiveMinVersion(policy);
            if (!isAtLeastVersion(currentVersion, minRequired)) {
              setStoreUpdateGate({
                forceUpdate: policy.forceUpdate,
                message: policy.message,
              });
            }
          }
        }

        const skipMinSplash =
          Platform.OS === 'android' && (await consumeWidgetTrampolineSplashOnAndroid());
        const splashDelayMs = skipMinSplash ? 0 : ROOT_SPLASH_MIN_MS;
        if (splashDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, splashDelayMs));
        }

        await initAmplitude();
        await initializePaymentSubtypes();
        await ensureNoticeInstallBaseline();
        await logEvent('app_started', {
          timestamp: Date.now(),
          platform: Platform.OS,
          environment: __DEV__ ? 'development' : 'production',
          app_version: getAppVersion() ?? 'unknown',
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
      const currentVersion = getAppVersion();
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

  const showApp =
    appIsReady &&
    fontsReady &&
    splashFinished &&
    !(storeUpdateGate?.forceUpdate === true);

  const splashHiddenRef = useRef(false);

  const hideNativeSplash = useCallback(async () => {
    if (splashHiddenRef.current) {
      return;
    }
    splashHiddenRef.current = true;
    if (Platform.OS === 'android') {
      await dismissWidgetMainSplashOverlayOnAndroid();
    }
    await SplashScreen.hideAsync();
  }, []);

  // 첫 실화면(온보딩/홈)이 release 할 때까지 네이티브 스플래시 유지 — 중간 스피너 방지
  useEffect(() => {
    if (!showApp) {
      return undefined;
    }
    return onFirstScreenSplashRelease(() => {
      void hideNativeSplash();
    });
  }, [hideNativeSplash, showApp]);

  useEffect(() => {
    if (!showApp) {
      return undefined;
    }
    const timer = setTimeout(() => {
      releaseFirstScreenSplash();
    }, FIRST_SCREEN_SPLASH_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [showApp]);

  const onLayoutRootView = useCallback(() => {
    // no-op: 스플래시는 first-screen release 시에만 내림
  }, []);

  const { permissionChecked } = useFirstLaunchNotificationPermission();

  useMetaFacebookAttSync(Boolean(permissionChecked && appIsReady));

  useEffect(() => {
    if (permissionChecked) {
      const setupNotifications = async () => {
        try {
          await cleanupOldSchedules();
          // 첫 실행 권한 요청 이후·OTA 복구: OS 미허용이면 앱 안 스위치를 OFF로 맞춤
          await syncInAppNotificationSettingsWithOsPermission();

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

  /** iOS App Intent / Android SMS Receiver 대기 큐 → 기존 ingest */
  useEffect(() => {
    if (
      !appIsReady ||
      (Platform.OS !== 'ios' && Platform.OS !== 'android')
    ) {
      return undefined;
    }
    const syncAndFlush = async () => {
      await syncSmsReceiveSettingsToNative();
      await flushPendingRecordInboxFromNative();
    };
    void syncAndFlush();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void syncAndFlush();
      }
    });
    return () => sub.remove();
  }, [appIsReady]);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
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

  return { palette, onLayoutRootView, showApp };
}
