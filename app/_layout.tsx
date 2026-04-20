import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { Colors } from '@/constants/theme';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { ToastProvider } from '@/contexts/toast-context';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
// useColorScheme import 제거 - OS 강제 다크 모드 영향 방지를 위해 항상 'light' 사용
import { useMetaFacebookAttSync } from '@/hooks/use-meta-facebook-att-sync';
import { useFirstLaunchNotificationPermission } from '@/hooks/use-notifications';
import { AnalyticsRouteListener } from '@/components/analytics-route-listener';
import { initAmplitude, logEvent } from '@/utils/analytics';
import { checkActiveChallengesNotifications, checkEndedChallenges } from '@/utils/challenge-utils';
import {
  cancelDailyReminder,
  cleanupOldSchedules,
  getChallengeNotificationsEnabled,
  getGeneralNotificationsEnabled,
  setupDailyReminder,
} from '@/utils/notification-scheduler';
import {
  fetchAppVersionPolicy,
  getEffectiveMinVersion,
} from '@/utils/fetch-app-version-policy';
import { isAtLeastVersion } from '@/utils/app-version';
import { showStoreUpdateAlert } from '@/utils/show-store-update-alert';
import { refreshWidgetWithCurrentMonth, resetMonthlyExpenseMaskInWidget } from '@/utils/widget-data-sync';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

// Configure how notifications should be handled when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export const unstable_settings = {
  anchor: '(tabs)',
};

interface StoreUpdateGateState {
  forceUpdate: boolean;
  message: string;
}

export default function RootLayout() {
  // OS 강제 다크 모드 영향 방지를 위해 항상 'light'로 고정
  const colorScheme: 'light' = 'light';
  const [splashFinished, setSplashFinished] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const [storeUpdateGate, setStoreUpdateGate] = useState<StoreUpdateGateState | null>(null);
  const storeAlertPresentedRef = useRef(false);
  const storeGateResumeFromBackgroundRef = useRef(false);
  const colors = Colors[colorScheme] as typeof Colors.light;
  
  // 스플래시 자동 숨김 방지 (컴포넌트 최상단에서 즉시 호출)
  // Promise를 반환하지만 await하지 않아도 됨 (백그라운드에서 실행)
  SplashScreen.preventAutoHideAsync().catch(() => {
    // 에러가 발생해도 계속 진행
  });
  
  // Expo 스플래시 2초 유지 및 데이터 로딩 시작
  // useLayoutEffect를 사용하여 DOM 변경 전에 실행 (더 빠름)
  useLayoutEffect(() => {
    async function prepare() {
      try {
        // 스플래시 자동 숨김 방지 (이미 위에서 호출했지만 안전을 위해 다시 호출)
        await SplashScreen.preventAutoHideAsync();
        
        // OTA 업데이트 체크 및 적용 (Expo Go만 제외, 스토어/스탠드얼론은 체크)
        const isExpoGo = Constants.appOwnership === 'expo';
        if (!isExpoGo && Updates.isEnabled) {
          try {
            const update = await Updates.checkForUpdateAsync();
            if (update.isAvailable) {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
              return;
            }
          } catch (error) {
            // 업데이트 체크 실패해도 앱은 정상 실행
          }
        }

        // 스토어 최소 버전 정책 (Vercel 정적 JSON). 개발/Expo Go에서는 생략.
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

        // 2초 대기
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Amplitude 가이드 4번: init(API 키) + Session Replay 플러그인 → `utils/analytics`의 `initAmplitude`
        await initAmplitude();
        await logEvent('app_started', {
          timestamp: Date.now(),
          platform: Platform.OS,
          environment: __DEV__ ? 'development' : 'production',
          app_version: Constants.expoConfig?.version ?? 'unknown',
        });

        // 데이터 로딩 시작
        setSplashFinished(true);
        
        // 앱 준비 완료
        setAppIsReady(true);
      } catch (e) {
        console.warn('스플래시 처리 중 오류:', e);
        setSplashFinished(true);
        setAppIsReady(true);
      }
    }
    
    prepare();
  }, []);

  // 최초: 스플래시 이후 시스템 Alert로 업데이트 유도
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

  // 백그라운드에서 포그라운드로 복귀 시 정책 재확인 — 충족 시 해제, 미충족이면 Alert 재표시(시작 직후 중복 방지)
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

  // appIsReady가 true가 되면 스플래시 숨기기
  useEffect(() => {
    if (appIsReady) {
      SplashScreen.hideAsync().catch(() => {
        // 에러가 발생해도 계속 진행
      });
    }
  }, [appIsReady]);
  
  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // 레이아웃이 완료된 후 스플래시 숨기기 (이중 안전장치)
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);
  
  // Request notification permission on first app launch
  const { permissionChecked } = useFirstLaunchNotificationPermission();

  useMetaFacebookAttSync(Boolean(permissionChecked && appIsReady));

  // Setup notifications after permission is checked
  useEffect(() => {
    if (permissionChecked) {

      // ✅ 기존 알림 정리 후 새로 설정
      const setupNotifications = async () => {
        try {
          // ✅ 오래된 스케줄 마킹 정리
          await cleanupOldSchedules();

          const [generalEnabled, challengeEnabled] = await Promise.all([
            getGeneralNotificationsEnabled(),
            getChallengeNotificationsEnabled(),
          ]);

          // Setup daily reminder (8 PM every day)
          if (generalEnabled) {
            await setupDailyReminder();
          } else {
            // OFF 상태에서는 앱 시작 시 잔여 일반 알림을 강제 정리
            await cancelDailyReminder();
          }

          // Check challenge notification schedules only when challenge notifications are ON
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

  // iOS: 앱이 백그라운드로 갈 때 위젯 동기화. reloadTimelines는 포그라운드에서만 반영되므로,
  // 사용자가 홈/잠금화면으로 나가는 순간 한 번 더 쓰기+reload 요청하면 위젯이 갱신될 가능성이 높아짐.
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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <LoadingProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutRootView}>
          <ThemeProvider value={DefaultTheme}>
            <AppDataProvider
              enabled={appIsReady && splashFinished && !(storeUpdateGate?.forceUpdate === true)}
            >
              <ToastProvider>
                {appIsReady && !(storeUpdateGate?.forceUpdate === true) ? (
                  <>
                    <AnalyticsRouteListener />
                    <Stack>
                      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="(dev-tabs)" options={{ headerShown: false }} />
                      <Stack.Screen name="expense-category" options={{ headerShown: false }} />
                      <Stack.Screen name="expense-record" options={{ headerShown: false }} />
                      <Stack.Screen name="expense-edit" options={{ headerShown: false }} />
                      <Stack.Screen name="income-record" options={{ headerShown: false }} />
                      <Stack.Screen name="income-edit" options={{ headerShown: false }} />
                      <Stack.Screen name="challenge-create" options={{ headerShown: false }} />
                      <Stack.Screen name="challenge-edit" options={{ headerShown: false }} />
                      <Stack.Screen name="challenge-detail" options={{ headerShown: false }} />
                      <Stack.Screen name="monthly-expense-timeline" options={{ headerShown: false }} />
                      <Stack.Screen name="month-start-day" options={{ headerShown: false }} />
                      <Stack.Screen name="category-setting" options={{ headerShown: false }} />
                      <Stack.Screen name="category-create" options={{ headerShown: false }} />
                      <Stack.Screen name="category-edit" options={{ headerShown: false }} />
                      <Stack.Screen name="expense-category-detail" options={{ headerShown: false }} />
                      <Stack.Screen name="notification-setting" options={{ headerShown: false }} />
                      <Stack.Screen name="data-backup" options={{ headerShown: false }} />
                      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
                    </Stack>
                    <StatusBar style="dark" />
                    <GlobalProgressBar />
                  </>
                ) : null}
              </ToastProvider>
            </AppDataProvider>
          </ThemeProvider>
        </View>
        </SafeAreaProvider>
        </LoadingProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
