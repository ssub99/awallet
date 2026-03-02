/**
 * 전체 초기화: 앱 데이터 및 설정을 최초 설치 상태로 되돌립니다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
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
];

/**
 * 소비 리포트(AI 피드백) 캐시 키 패턴
 *
 * - 월별 캐시: consumptionReport_${year}_${month}_${monthStartDay}
 *   (예: consumptionReport_2025_9_1)
 *
 * 전체 초기화 시에는 위 패턴에 해당하는 모든 키를 찾아 함께 삭제합니다.
 */
const CONSUMPTION_REPORT_PREFIX = 'consumptionReport_';

/**
 * 전체 초기화를 수행합니다.
 * 소비·입금·챌린지 데이터와 카테고리/알림/캐시 등 설정을 모두 제거합니다.
 */
export async function resetAppData(): Promise<void> {
  await clearAllExpenses();
  await clearAllIncomes();
  await clearAllChallenges();
  await AsyncStorage.multiRemove(KEYS_TO_REMOVE);

  // 소비 리포트 AI 캐시도 함께 제거 (키 패턴 스캔)
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const reportKeys = allKeys.filter((key) => key.startsWith(CONSUMPTION_REPORT_PREFIX));
    if (reportKeys.length > 0) {
      await AsyncStorage.multiRemove(reportKeys);
    }
  } catch {
    // 캐시 제거 실패는 전체 초기화 실패로 간주하지 않음
  }
}
