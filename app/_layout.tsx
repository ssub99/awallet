import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { Colors } from '@/constants/theme';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { ToastProvider } from '@/contexts/toast-context';
import Constants from 'expo-constants';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
// useColorScheme import 제거 - OS 강제 다크 모드 영향 방지를 위해 항상 'light' 사용
import { useFirstLaunchNotificationPermission } from '@/hooks/use-notifications';
import { enableDebugMode, logEvent, setAnalyticsCollectionEnabled } from '@/utils/analytics';
import { checkActiveChallengesNotifications, checkEndedChallenges } from '@/utils/challenge-utils';
import { cleanupOldSchedules, setupDailyReminder } from '@/utils/notification-scheduler';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
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

export default function RootLayout() {
  // OS 강제 다크 모드 영향 방지를 위해 항상 'light'로 고정
  const colorScheme: 'light' = 'light';
  const [splashFinished, setSplashFinished] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
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
        const isExpoGo = Constants.executionEnvironment === 'expoClient';
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
        
        // 2초 대기
        await new Promise(resolve => setTimeout(resolve, 2000));
        
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

  // Setup notifications after permission is checked
  useEffect(() => {
    if (permissionChecked) {

      // ✅ 기존 알림 정리 후 새로 설정
      const setupNotifications = async () => {
        try {
          // ✅ 오래된 스케줄 마킹 정리
          await cleanupOldSchedules();
          
          // Setup daily reminder (8 PM every day)
          await setupDailyReminder();
          
          // Check active challenges for missing notifications (보완)
          await checkActiveChallengesNotifications();
          
          // Check ended challenges (for success notifications)
          await checkEndedChallenges();

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
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        refreshWidgetWithCurrentMonth().catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  // Initialize Firebase Analytics
  useEffect(() => {
    const initAnalytics = async () => {
      try {
        console.log('📊 [Analytics] Firebase Analytics 초기화 시작...');
        
        // Analytics 수집 활성화
        await setAnalyticsCollectionEnabled(true);
        console.log('📊 [Analytics] Analytics 수집 활성화 완료');
        
        // 개발 환경에서 DebugView 활성화 및 테스트 이벤트 전송
        if (__DEV__) {
          console.log('📊 [Analytics] 개발 모드: DebugView 활성화 시도...');
          await enableDebugMode();
        }
        
        // 앱 시작 이벤트 전송
        await logEvent('app_started', {
          timestamp: Date.now(),
          platform: 'ios',
          environment: __DEV__ ? 'development' : 'production',
        });
        console.log('📊 [Analytics] app_started 이벤트 전송 완료');
        
        console.log('✅ Firebase Analytics 초기화 완료');
      } catch (error) {
        console.error('❌ Firebase Analytics 초기화 실패:', error);
      }
    };
    
    // 약간의 지연 후 초기화 (Firebase가 완전히 준비될 때까지)
    const timer = setTimeout(() => {
      initAnalytics();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <LoadingProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutRootView}>
          <ThemeProvider value={DefaultTheme}>
            <AppDataProvider enabled={appIsReady && splashFinished}>
              <ToastProvider>
                {appIsReady ? (
                  <>
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
