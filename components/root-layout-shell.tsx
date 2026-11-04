import { AnalyticsRouteListener } from '@/components/analytics-route-listener';
import { OnboardingLaunchGate } from '@/components/onboarding/onboarding-launch-gate';
import { RecordInboxForegroundFlush } from '@/components/record-inbox-foreground-flush';
import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { RecordReceiveGuideCard } from '@/components/ui/record-receive-guide-card';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { AppStatusBarProvider } from '@/contexts/status-bar-context';
import { ToastProvider } from '@/contexts/toast-context';
import { DefaultTheme, ThemeProvider } from "expo-router/react-navigation";
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

interface RootLayoutShellProps {
  backgroundColor: string;
  onLayoutRootView: () => void;
  showApp: boolean;
  needsOnboarding: boolean | null;
  /** 온보딩 게이트 종료 시 스플래시 해제 */
  onOnboardingGateSettled: () => void;
  navigation: ReactNode;
}

export function RootLayoutShell({
  backgroundColor,
  onLayoutRootView,
  showApp,
  needsOnboarding,
  onOnboardingGateSettled,
  navigation,
}: RootLayoutShellProps) {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <KeyboardProvider>
        <LoadingProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <View
              style={{ flex: 1, backgroundColor }}
              onLayout={onLayoutRootView}
            >
              <ThemeProvider value={DefaultTheme}>
                <AppStatusBarProvider>
                  <AppDataProvider enabled={showApp}>
                    <ToastProvider>
                      {showApp ? (
                        <>
                          <AnalyticsRouteListener />
                          <RecordInboxForegroundFlush />
                          {navigation}
                          <GlobalProgressBar />
                          <RecordReceiveGuideCard />
                          {/* navigation 위에 덮어 홈 선노출 차단 — zIndex로 Stack보다 위 */}
                          <OnboardingLaunchGate
                            needsOnboarding={needsOnboarding}
                            onSettled={onOnboardingGateSettled}
                          />
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
