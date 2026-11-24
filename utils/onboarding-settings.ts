import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_KEY = 'onboardingCompleted';

/**
 * true면 앱 킬·리로드마다 온보딩 재노출(검증용).
 * false면 3단계 「시작하기」로 `markOnboardingCompleted` 된 뒤부터 미노출(최초 1회).
 */
export const ONBOARDING_SHOW_EVERY_LAUNCH = false;

/**
 * 이전 버전을 써서 쌓인 사용 데이터 키. 이 중 하나라도 있으면 신규 설치가 아니다.
 * 앱 초기화(utils/reset-app-data)가 함께 지우는 키만 쓴다 — 초기화 뒤에는 다시 신규처럼 온보딩이 뜨도록
 * (지워지지 않는 device_id 등은 신호로 쓰지 않는다).
 */
const EXISTING_USER_STORAGE_KEYS = [
  'calendarData',
  'expenseData',
  'incomeData',
  'challengeData',
  'categories_expense',
  'categories_income',
  'categories_migration_done',
  'userCategories_expense',
  'userCategories_income',
  'monthStartDay',
] as const;

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

/**
 * 온보딩 도입 전부터 앱을 쓰던 기기는 온보딩 완료로 처리한다 (온보딩은 신규 설치만 대상).
 * 이전에는 실험 플래그가 기존 사용자의 온보딩 노출을 막았는데, 플래그를 걷어내면서 이 가드가 필요해졌다.
 *
 * 반드시 앱 시작 직후, 이번 실행이 저장소에 아무것도 쓰기 전에 호출한다 (공지 기준 시각·기기 ID 등이 생긴 뒤에는
 * 신규 설치와 구분되지 않을 수 있다). 이미 완료 기록이 있으면 아무것도 하지 않는다.
 */
export async function markExistingUserOnboardingCompleted(): Promise<void> {
  if (ONBOARDING_SHOW_EVERY_LAUNCH) {
    return;
  }
  if ((await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === '1') {
    return;
  }
  const entries = await AsyncStorage.multiGet([...EXISTING_USER_STORAGE_KEYS]);
  if (entries.some(([, value]) => value != null)) {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  dismissedThisLaunch = true;
  await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
}
