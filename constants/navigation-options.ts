import {
  CardStyleInterpolators,
  type StackNavigationOptions,
} from 'expo-router/js-stack';

import { themeColors } from '@/constants/theme-colors';

/**
 * Android 루트 JS Stack 전역.
 * Push/pop 카드 슬라이드 + 가로 스와이프 pop (Expo 58 이전과 동일).
 *
 * `cardOverlayEnabled`는 JS Stack이 Android에서 기본 true라 #000 딤이 깔림 → iOS와 같이 끔.
 * status bar: JS Stack Screen은 `statusBarStyle`을 네이티브로 안 넘김 → RNS 기본값 패치
 * (`"dark"`, patches/react-native-screens)로 맞춤.
 */
export const ANDROID_JS_STACK_SCREEN_OPTIONS: StackNavigationOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: themeColors.light.background },
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  cardOverlayEnabled: false,
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
};
