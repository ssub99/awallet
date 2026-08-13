import { atomicColors } from '@/constants/atomic-colors';
import { TransitionPresets } from '@react-navigation/stack';
import { Platform } from 'react-native';

export const NOTICE_IMAGE_VIEWER_ROUTE_NAME = 'settings-notice-image-viewer' as const;
export const ANDROID_NOTICE_VIEWER_TRANSITION_MS = 500;

/** Stack 등록 시점 options — 컴ponent 내 Stack.Screen은 push 애니메이션에 너무 늦게 적용됨 */
export const NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS = Platform.select({
  ios: {
    headerShown: false,
    gestureEnabled: false,
    animation: 'slide_from_bottom' as const,
    freezeOnBlur: false,
  },
  android: {
    headerShown: false,
    gestureEnabled: false,
    cardStyle: { backgroundColor: atomicColors.neutral[900] },
    ...TransitionPresets.ModalSlideFromBottomIOS,
  },
  default: {
    headerShown: false,
    gestureEnabled: false,
  },
})!;
