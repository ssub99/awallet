import { AnalyticsRouteListener } from '@/components/analytics-route-listener';
import { GlobalProgressBar } from '@/components/ui/global-progress-bar';
import { AppDataProvider } from '@/contexts/app-data-context';
import { LoadingProvider } from '@/contexts/loading-context';
import { ToastProvider } from '@/contexts/toast-context';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

interface RootLayoutShellProps {
  backgroundColor: string;
  onLayoutRootView: () => void;
  showApp: boolean;
  navigation: ReactNode;
}

export function RootLayoutShell({
  backgroundColor,
  onLayoutRootView,
  showApp,
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
                <AppDataProvider enabled={showApp}>
                  <ToastProvider>
                    {showApp ? (
                      <>
                        {Platform.OS === 'android' ? (
                          <ExpoStatusBar style="dark" translucent backgroundColor="transparent" />
                        ) : null}
                        <AnalyticsRouteListener />
                        {navigation}
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
