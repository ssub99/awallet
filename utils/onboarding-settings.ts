import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

/**
 * true면 앱 킬·리로드마다 온보딩 재노출(검증용).
 * false면 3단계 「시작하기」로 `markOnboardingCompleted` 된 뒤부터 미노출(최초 1회).
 */
export const ONBOARDING_SHOW_EVERY_LAUNCH = false;

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
