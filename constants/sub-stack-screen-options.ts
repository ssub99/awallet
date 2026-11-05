import Constants from 'expo-constants';

const canUseIosNativeStatusBarOptions = Constants.appOwnership !== 'expo';

/** iOS UIViewControllerBasedStatusBarAppearance=true — RN StatusBar 대신 Native Stack options 사용 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  ...(canUseIosNativeStatusBarOptions ? { statusBarStyle: 'dark' as const } : null),
} as const;

/**
 * 온보딩 → 홈 크로스페이드.
 * `animationTypeForReplace` 는 **들어오는 화면** 옵션이다 (기본값 `pop` → 온보딩만 fade-out 되고 홈이 덜컥 보임).
 * `push` + `fade` 로 홈이 온보딩 위로 동시에 fade-in.
 * 하위 기록 화면 push/pop 은 각 화면 animation 을 따름.
 */
export const TABS_STACK_SCREEN_OPTIONS = {
  animation: 'fade' as const,
  animationTypeForReplace: 'push' as const,
  animationDuration: 320,
} as const;

/** 온보딩 자체는 별도 stack fade 없음 — replace 연출은 `(tabs)` 옵션이 담당 */
export const ONBOARDING_STACK_SCREEN_OPTIONS = {
  animation: 'none' as const,
} as const;
