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
 * 전체 초기화를 수행합니다.
 * 소비·입금·챌린지 데이터와 카테고리/알림/캐시 등 설정을 모두 제거합니다.
 */
export async function resetAppData(): Promise<void> {
  await clearAllExpenses();
  await clearAllIncomes();
  await clearAllChallenges();
  await AsyncStorage.multiRemove(KEYS_TO_REMOVE);
}
