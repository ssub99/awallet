import 'react-native-gesture-handler';

import { AndroidJsStack } from '@/components/navigation/android-js-stack';
import { RootLayoutShell } from '@/components/root-layout-shell';
import { ANDROID_JS_STACK_SCREEN_OPTIONS } from '@/constants/navigation-options';
import { rootLayoutUnstableSettings } from '@/constants/root-layout-unstable-settings';
import {
  ROOT_STACK_MODAL_ROUTE_NAME,
  ROOT_STACK_ROUTE_NAMES,
} from '@/constants/root-stack-routes';
import { useRootLayoutBootstrap } from '@/hooks/use-root-layout-bootstrap';
import { configureForegroundNotificationHandler } from '@/utils/expo-notifications-client';
import 'react-native-reanimated';

configureForegroundNotificationHandler();

export const unstable_settings = rootLayoutUnstableSettings;

export default function RootLayout() {
  const { palette, onLayoutRootView, showApp } = useRootLayoutBootstrap();

  return (
    <RootLayoutShell
      backgroundColor={palette.background}
      onLayoutRootView={onLayoutRootView}
      showApp={showApp}
      navigation={
        showApp ? (
          <AndroidJsStack screenOptions={ANDROID_JS_STACK_SCREEN_OPTIONS}>
            {ROOT_STACK_ROUTE_NAMES.map((name) => (
              <AndroidJsStack.Screen key={name} name={name} />
            ))}
            <AndroidJsStack.Screen
              name={ROOT_STACK_MODAL_ROUTE_NAME}
              options={{ presentation: 'modal', title: 'Modal' }}
            />
          </AndroidJsStack>
        ) : null
      }
    />
  );
}
