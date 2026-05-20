import {
  CardStyleInterpolators,
  type StackNavigationOptions,
} from '@react-navigation/stack';

import { ThemeColors } from '@/constants/theme-colors';

/**
 * Android Expo Go — JS Stack 전역.
 * Push/pop 시 카드 슬라이드 전환 (iOS와 유사).
 */
export const ANDROID_JS_STACK_SCREEN_OPTIONS: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: ThemeColors.light.background },
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
};
