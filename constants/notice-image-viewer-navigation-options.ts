import { atomicColors } from '@/constants/atomic-colors';
import { CardStyleInterpolators } from '@react-navigation/stack';
import { Platform } from 'react-native';

export const NOTICE_IMAGE_VIEWER_ROUTE_NAME = 'settings-notice-image-viewer' as const;

/** Stack 등록 시점 options — 컴ponent 내 Stack.Screen은 push 애니메이션에 너무 늦게 적용됨 */
export const NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS = Platform.select({
  ios: {
    headerShown: false,
    gestureEnabled: true,
    animation: 'slide_from_bottom' as const,
    freezeOnBlur: false,
  },
  android: {
    headerShown: false,
    gestureEnabled: true,
    statusBarStyle: 'light' as const,
    statusBarBackgroundColor: atomicColors.neutral[900],
    cardStyle: { backgroundColor: atomicColors.neutral[900] },
    cardStyleInterpolator: CardStyleInterpolators.forVerticalIOS,
    gestureDirection: 'vertical' as const,
  },
  default: {
    headerShown: false,
    gestureEnabled: true,
  },
})!;
