import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY,
  APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY,
} from '@/constants/app-store';

/**
 * 소비·입금 생성 시마다 증가. 삭제해도 감소하지 않음.
 * 복원/전체 초기화 후에는 0부터 다시 쌓음(배열 길이로 시드하지 않음).
 */
export async function registerReviewPromptLifetimeCreations(delta: number): Promise<void> {
  if (delta <= 0) {
    return;
  }
  const raw = await AsyncStorage.getItem(APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY);
  const current = raw === null ? 0 : parseInt(raw, 10) || 0;
  await AsyncStorage.setItem(APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY, String(current + delta));
}

export async function getReviewPromptLifetimeRecordCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY);
  if (raw === null) {
    return 0;
  }
  return parseInt(raw, 10) || 0;
}

/**
 * 백업 복원 직후: 복원된 건수는 리뷰 조건에 넣지 않고, 이후 새로 생성한 건만 누적.
 * 인앱 리뷰 1회 플래그도 지워 복원 이후 다시 10건 생성 시 유도 가능하게 함.
 */
export async function resetAppStoreReviewProgressAfterRestore(): Promise<void> {
  await AsyncStorage.multiRemove([
    APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY,
    APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY,
  ]);
}
