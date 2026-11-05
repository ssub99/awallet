import { AnalyticsRouteListener } from '@/components/analytics-route-listener';
import { RecordInboxForegroundFlush } from '@/components/record-inbox-foreground-flush';
import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { RecordReceiveGuideCard } from '@/components/ui/record-receive-guide-card';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { AppStatusBarProvider } from '@/contexts/status-bar-context';
import { ToastProvider } from '@/contexts/toast-context';
import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

interface RootLayoutShellProps {
  backgroundColor: string;
  onLayoutRootView: () => void;
  showApp: boolean;
  /** 온보딩 단독 구간에서는 false — 캘린더/지출 로드가 Lottie와 경쟁하지 않게 */
  appDataEnabled: boolean;
  navigation: ReactNode;
}

export function RootLayoutShell({
  backgroundColor,
  onLayoutRootView,
  showApp,
  appDataEnabled,
  navigation,
}: RootLayoutShellProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <KeyboardProvider>
        <LoadingProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <View style={{ flex: 1, backgroundColor }} onLayout={onLayoutRootView}>
              <ThemeProvider value={DefaultTheme}>
                <AppStatusBarProvider>
                  <AppDataProvider enabled={showApp && appDataEnabled}>
                    <ToastProvider>
                      {showApp ? (
                        <>
                          <AnalyticsRouteListener />
                          {appDataEnabled ? <RecordInboxForegroundFlush /> : null}
                          {navigation}
                          {/* 인디케이터는 항상 마운트 — 홈 첫 로드 beginLoad 를 온보딩 전환 때 보여야 함 */}
                          <GlobalProgressBar />
                          {appDataEnabled ? <RecordReceiveGuideCard /> : null}
                        </>
                      ) : null}
                    </ToastProvider>
                  </AppDataProvider>
                </AppStatusBarProvider>
              </ThemeProvider>
            </View>
          </SafeAreaProvider>
        </LoadingProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
