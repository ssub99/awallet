import * as SplashScreen from 'expo-splash-screen';
import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { Colors } from '@/constants/theme';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirstLaunchNotificationPermission } from '@/hooks/use-notifications';
import { checkEndedChallenges } from '@/utils/challenge-utils';
import { cleanupOldSchedules, setupDailyReminder } from '@/utils/notification-scheduler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { View } from 'react-native';
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
  const colorScheme = useColorScheme();
  const [splashFinished, setSplashFinished] = useState(false);
  const [appIsReady, setAppIsReady] = useState(false);
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
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
          
          // Check ended challenges (for success notifications)
          await checkEndedChallenges();

        } catch (error) {
          console.error('알림 설정 중 오류:', error);
        }
      };
      
      setupNotifications();
    }
  }, [permissionChecked]);

  return (
    <LoadingProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutRootView}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {appIsReady ? (
            <AppDataProvider enabled={splashFinished}>
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
                <Stack.Screen name="monthly-expense-timeline" options={{ headerShown: false }} />
                <Stack.Screen name="month-start-day" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
              <GlobalProgressBar />
            </AppDataProvider>
          ) : null}
        </ThemeProvider>
      </View>
      </SafeAreaProvider>
    </LoadingProvider>
  );
}
