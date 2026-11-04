import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

/**
 * 검증용: 앱 킬·Metro 리로드마다 온보딩 표시.
 * 출시 전 false로 두면 `onboardingCompleted` 기준 최초 1회만 노출.
 */
export const ONBOARDING_SHOW_EVERY_LAUNCH = true;

/** JS 컨텍스트가 살아 있는 동안(같은 세션) 온보딩을 다시 안 띄움. 리로드 시 리셋. */
let dismissedThisLaunch = false;

export async function shouldShowOnboarding(): Promise<boolean> {
  if (dismissedThisLaunch) {
    return false;
  }
  if (ONBOARDING_SHOW_EVERY_LAUNCH) {
    return true;
  }
  const completed = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
  return completed !== '1';
}

export async function markOnboardingCompleted(): Promise<void> {
  dismissedThisLaunch = true;
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
}
