import 'react-native-gesture-handler';

import { AndroidJsStack } from '@/components/navigation/android-js-stack';
import { RootLayoutShell } from '@/components/root-layout-shell';
import { ANDROID_JS_STACK_SCREEN_OPTIONS } from '@/constants/navigation-options';
import {
  NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS,
  NOTICE_IMAGE_VIEWER_ROUTE_NAME,
} from '@/constants/notice-image-viewer-navigation-options';
import { ROOT_STACK_SCREEN_OPTIONS } from '@/constants/sub-stack-screen-options';
import { rootLayoutUnstableSettings } from '@/constants/root-layout-unstable-settings';
import {
    ROOT_STACK_MODAL_ROUTE_NAME,
    ROOT_STACK_ROUTE_NAMES,
} from '@/constants/root-stack-routes';
import { useRootLayoutBootstrap } from '@/hooks/use-root-layout-bootstrap';
import { configureForegroundNotificationHandler } from '@/utils/expo-notifications-client';
import { Stack } from 'expo-router';
import { Platform } from 'react-native';
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
        showApp && Platform.OS === 'android' ? (
          <AndroidJsStack screenOptions={ANDROID_JS_STACK_SCREEN_OPTIONS}>
            {ROOT_STACK_ROUTE_NAMES.map((name) => (
              <AndroidJsStack.Screen
                key={name}
                name={name}
                options={
                  name === NOTICE_IMAGE_VIEWER_ROUTE_NAME
                    ? NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS
                    : undefined
                }
              />
            ))}
            <AndroidJsStack.Screen
              name={ROOT_STACK_MODAL_ROUTE_NAME}
              options={{ presentation: 'modal', title: 'Modal' }}
            />
          </AndroidJsStack>
        ) : showApp ? (
          <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
            {ROOT_STACK_ROUTE_NAMES.map((name) => (
              <Stack.Screen
                key={name}
                name={name}
                options={
                  name === NOTICE_IMAGE_VIEWER_ROUTE_NAME
                    ? NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS
                    : undefined
                }
              />
            ))}
            <Stack.Screen
              name={ROOT_STACK_MODAL_ROUTE_NAME}
              options={{ presentation: 'modal', title: 'Modal' }}
            />
          </Stack>
        ) : null
      }
    />
  );
}
