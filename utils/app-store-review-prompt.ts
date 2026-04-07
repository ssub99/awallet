import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';
import { getAllExpenses } from '@/utils/expenses';
import { getAllIncomes } from '@/utils/incomes';

/**
 * 한 기기(AsyncStorage) 기준으로 인앱 스토어 리뷰 요청을 1회 시도한 뒤 재시도하지 않음.
 * (iOS StoreKit / Android Play In-App Review — 실제 표시 여부는 OS 정책에 따름)
 */
export const APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY = 'appStoreWriteReviewPromptShown';

const RECORD_THRESHOLD = 10;

async function getActiveRecordTotal(): Promise<number> {
  const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);
  const expenseCount = expenses.filter((r) => !r.isDeleted).length;
  const incomeCount = incomes.filter((r) => !r.isDeleted).length;
  return expenseCount + incomeCount;
}

/**
 * 소비·입금 합산 활성 기록이 RECORD_THRESHOLD 이상이면,
 * 아직 시도한 적 없을 때 네이티브 인앱 리뷰 요청을 호출합니다.
 */
export async function maybePromptWriteReviewIfEligible(): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return;
  }

  try {
    const already = await AsyncStorage.getItem(APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY);
    if (already === 'true') {
      return;
    }

    const total = await getActiveRecordTotal();
    if (total < RECORD_THRESHOLD) {
      return;
    }

    const canRequest = await StoreReview.hasAction();
    if (!canRequest) {
      return;
    }

    await StoreReview.requestReview();
    await AsyncStorage.setItem(APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY, 'true');
  } catch {
    // 리뷰 API 실패는 기록 저장 UX에 영향 주지 않음
  }
}
