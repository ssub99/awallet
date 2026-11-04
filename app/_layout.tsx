import 'react-native-gesture-handler';

import { RootLayoutShell } from '@/components/root-layout-shell';
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
import 'react-native-reanimated';

configureForegroundNotificationHandler();

export const unstable_settings = rootLayoutUnstableSettings;

export default function RootLayout() {
  const { palette, onLayoutRootView, showApp, needsOnboarding, markRouteGateReady } =
    useRootLayoutBootstrap();

  const stackRouteNames =
    needsOnboarding === true
      ? ([
          'onboarding',
          ...ROOT_STACK_ROUTE_NAMES.filter((name) => name !== 'onboarding'),
        ] as unknown as typeof ROOT_STACK_ROUTE_NAMES)
      : ROOT_STACK_ROUTE_NAMES;

  return (
    <RootLayoutShell
      backgroundColor={palette.background}
      onLayoutRootView={onLayoutRootView}
      showApp={showApp}
      needsOnboarding={needsOnboarding}
      onOnboardingGateSettled={markRouteGateReady}
      navigation={
        showApp ? (
          <Stack
            initialRouteName={needsOnboarding === true ? 'onboarding' : '(tabs)'}
            screenOptions={ROOT_STACK_SCREEN_OPTIONS}
          >
            {stackRouteNames.map((name) => (
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
