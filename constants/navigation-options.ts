import { themeColors } from '@/constants/theme-colors';

/**
 * Android Expo Go — JS Stack 전역.
 * Push/pop 시 카드 슬라이드 전환 (iOS와 유사).
 */
export const ANDROID_JS_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  cardStyle: { backgroundColor: themeColors.light.background },
};
