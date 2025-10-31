import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { Colors } from '@/constants/theme';
import { LoadingProvider } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFirstLaunchNotificationPermission } from '@/hooks/use-notifications';
import { checkEndedChallenges } from '@/utils/challenge-utils';
import { cleanupOldSchedules, setupDailyReminder } from '@/utils/notification-scheduler';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import 'react-native-reanimated';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AppDataProvider } from '@/contexts/app-data-context';

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
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
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

        }
      };
      
      setupNotifications();
    }
  }, [permissionChecked]);

  return (
    <LoadingProvider>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AppDataProvider>
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
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="account-verify" options={{ headerShown: false }} />
          <Stack.Screen name="account-verify-email" options={{ headerShown: false }} />
          <Stack.Screen name="password-change" options={{ headerShown: false }} />
          <Stack.Screen name="password-set" options={{ headerShown: false }} />
          <Stack.Screen name="email-verify" options={{ headerShown: false }} />
          <Stack.Screen name="signup-intro" options={{ headerShown: false }} />
          <Stack.Screen name="signup-complete" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
          <StatusBar style="auto" />
          <GlobalProgressBar />
          </AppDataProvider>
        </ThemeProvider>
      </View>
      </SafeAreaProvider>
    </LoadingProvider>
  );
}
