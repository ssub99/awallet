import 'react-native-gesture-handler';

import { RootAppNavigation } from '@/components/root-app-navigation';
import { RootLayoutShell } from '@/components/root-layout-shell';
import { rootLayoutUnstableSettings } from '@/constants/root-layout-unstable-settings';
import { useRootLayoutBootstrap } from '@/hooks/use-root-layout-bootstrap';
import { configureForegroundNotificationHandler } from '@/utils/expo-notifications-client';
import { useCallback, useEffect, useState } from 'react';
import 'react-native-reanimated';

configureForegroundNotificationHandler();

export const unstable_settings = rootLayoutUnstableSettings;

export default function RootLayout() {
  const { palette, onLayoutRootView, showApp, initialNeedsOnboarding } = useRootLayoutBootstrap();
  const [appDataEnabled, setAppDataEnabled] = useState(false);

  useEffect(() => {
    if (!showApp) return;
    if (!initialNeedsOnboarding) {
      setAppDataEnabled(true);
    }
  }, [initialNeedsOnboarding, showApp]);

  const handleMainAppActive = useCallback(() => {
    setAppDataEnabled(true);
  }, []);

  return (
    <RootLayoutShell
      backgroundColor={palette.background}
      onLayoutRootView={onLayoutRootView}
      showApp={showApp}
      appDataEnabled={appDataEnabled}
      navigation={
        showApp ? (
          <RootAppNavigation
            initialNeedsOnboarding={initialNeedsOnboarding}
            onMainAppActive={handleMainAppActive}
          />
        ) : null
      }
    />
  );
}
