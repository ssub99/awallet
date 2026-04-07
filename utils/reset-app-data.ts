/**
 * 전체 초기화: 앱 데이터 및 설정을 최초 설치 상태로 되돌립니다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY,
  APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY,
} from '@/constants/app-store';
import { clearAllChallenges } from '@/utils/challenges';
import { clearAllExpenses } from '@/utils/expenses';
import { clearAllIncomes } from '@/utils/incomes';
import {
  GENERAL_NOTIFICATIONS_ENABLED_KEY,
  CHALLENGE_NOTIFICATIONS_ENABLED_KEY,
} from '@/utils/notification-scheduler';

/** 전체 초기화 시 제거할 AsyncStorage 키 (데이터·설정·캐시) */
const KEYS_TO_REMOVE = [
  'expenseData',
  'incomeData',
  'challengeData',
  'categories_expense',
  'categories_income',
  'categories_migration_done',
  'userCategories_expense',
  'userCategories_income',
  'categoryOrder_expense',
  'categoryOrder_income',
  GENERAL_NOTIFICATIONS_ENABLED_KEY,
  CHALLENGE_NOTIFICATIONS_ENABLED_KEY,
  'calendarData',
  'selectedCategory',
  'weekStartsSunday',
  'monthStartDay',
  APP_STORE_WRITE_REVIEW_PROMPT_SHOWN_KEY,
  APP_STORE_REVIEW_LIFETIME_RECORD_COUNT_KEY,
];

/**
 * 소비 리포트(AI 피드백) 캐시 키 패턴
 *
 * - 레거시 월별 캐시: consumptionReport_${year}_${month}_${monthStartDay}
 * - 컨텍스트 해시 캐시: consumptionReportCtx_${hash}
 *
 * 전체 초기화 시에는 위 패턴에 해당하는 모든 키를 찾아 삭제하고,
 * 챌린지 탭이 읽는 `consumptionReportResetAt`을 갱신해 리포트 UI를 비우도록 합니다.
 * (`consumptionReportResetHandledAt`는 저장소에서 제거 — app/(tabs)/challenge.tsx 와 동일 키)
 */
const CONSUMPTION_REPORT_PREFIXES = ['consumptionReport_', 'consumptionReportCtx_'] as const;
const CONSUMPTION_REPORT_RESET_AT_KEY = 'consumptionReportResetAt';
const CONSUMPTION_REPORT_RESET_HANDLED_AT_KEY = 'consumptionReportResetHandledAt';

/**
 * 전체 초기화를 수행합니다.
 * 소비·입금·챌린지 데이터와 카테고리/알림/캐시 등 설정을 모두 제거합니다.
 */
export async function resetAppData(): Promise<void> {
  await clearAllExpenses();
  await clearAllIncomes();
  await clearAllChallenges();
  await AsyncStorage.multiRemove(KEYS_TO_REMOVE);

  // 소비 리포트 AI 캐시 제거 + 리포트 UI 리셋 신호(백업 복원 시 utils/backup.ts 와 동일 계약)
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const reportKeys = allKeys.filter((key) =>
      CONSUMPTION_REPORT_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    const toRemove = [...reportKeys, CONSUMPTION_REPORT_RESET_HANDLED_AT_KEY];
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
    await AsyncStorage.setItem(CONSUMPTION_REPORT_RESET_AT_KEY, String(Date.now()));
  } catch {
    // 캐시 제거 실패는 전체 초기화 실패로 간주하지 않음
  }
}
