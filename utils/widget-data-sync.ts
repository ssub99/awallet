/**
 * Widget Data Sync Utility
 *
 * React Native 앱에서 iOS 위젯으로 "이번달 소비" 요약 데이터를 공유하기 위한 유틸리티입니다.
 * App Group UserDefaults를 사용하여 데이터를 저장합니다.
 */

import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getCustomMonthInfo, isDateInCustomMonth } from '@/utils/custom-month';
import { getAllExpenses, type ExpenseRecord } from '@/utils/expenses';
import { getAllIncomes, type IncomeRecord } from '@/utils/incomes';
import { NativeModules, Platform } from 'react-native';

// iOS 네이티브 모듈 인터페이스
interface WidgetDataSyncModule {
  saveMonthlyExpenseData: (data: {
    expense: number;
    income: number;
    balance: number;
    monthStartDay: number;
  }) => Promise<void>;
  clearMonthlyExpenseRevealState: () => Promise<void>;
}

// 네이티브 모듈 가져오기 (iOS만)
const { WidgetDataSync } = NativeModules;
const widgetDataSync = WidgetDataSync as WidgetDataSyncModule | undefined;

/** YYYY.MM.DD → Date (로컬) */
function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('.').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * 현재 커스텀 월 기준으로 지출/수입 합계를 계산한 뒤 위젯에 저장합니다.
 * 소비·수입 기록 저장 직후 호출하면 위젯이 즉시 반영됩니다.
 */
export async function refreshWidgetWithCurrentMonth(): Promise<void> {
  if (Platform.OS !== 'ios') {
    return;
  }

  try {
    // 저장 직후 호출 시 AsyncStorage 쓰기가 완료되도록 한 틱 양보
    await Promise.resolve();
    const monthStartDay = await loadMonthStartDay();
    const now = new Date();
    const { year: currentYear, month: currentMonth } = getCustomMonthInfo(now, monthStartDay);

    const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);

    let totalExpense = 0;
    let totalIncome = 0;

    for (const expense of expenses as ExpenseRecord[]) {
      if (expense.isDeleted || expense.isRefunded) continue;
      const date = parseDateString(expense.date);
      if (isDateInCustomMonth(date, currentYear, currentMonth, monthStartDay)) {
        totalExpense += expense.amount ?? 0;
      }
    }

    for (const income of incomes as IncomeRecord[]) {
      if (income.isDeleted) continue;
      const date = parseDateString(income.date);
      if (isDateInCustomMonth(date, currentYear, currentMonth, monthStartDay)) {
        totalIncome += income.amount ?? 0;
      }
    }

    const balance = totalIncome - totalExpense;
    await saveMonthlyExpenseToWidget(
      Number(totalExpense),
      Number(totalIncome),
      Number(balance),
      Number(monthStartDay)
    );
  } catch (error) {
    console.warn('[WidgetDataSync] refreshWidgetWithCurrentMonth failed:', error);
  }
}

/**
 * 이번달 소비/수입/잔액 요약 데이터를 위젯에 저장합니다.
 *
 * 위젯에서는 이 중 "이번달 소비(expense)"만 표시해도 되고,
 * 추후 필요하면 수입/잔액까지 확장해서 사용할 수 있습니다.
 *
 * @param expense 이번달 소비금액
 * @param income 이번달 수입금액
 * @param balance 잔액 (수입 - 소비)
 * @param monthStartDay 월 시작일 (1-31)
 */
export async function saveMonthlyExpenseToWidget(
  expense: number,
  income: number,
  balance: number,
  monthStartDay: number
): Promise<void> {
  if (Platform.OS !== 'ios') {
    // iOS가 아니면 아무 작업도 하지 않음
    return;
  }

  if (!widgetDataSync) {
    // 네이티브 모듈이 연결되지 않은 경우 (예: 개발 중 위젯 타겟 미설정)
    console.warn('[WidgetDataSync] Native module not available');
    return;
  }

  if (typeof widgetDataSync.saveMonthlyExpenseData !== 'function') {
    // 메서드가 브릿지에 노출되지 않은 경우 (예: ObjC export 누락)
    console.warn('[WidgetDataSync] saveMonthlyExpenseData is not available');
    return;
  }

  try {
    await widgetDataSync.saveMonthlyExpenseData({
      expense: Number(expense),
      income: Number(income),
      balance: Number(balance),
      monthStartDay: Number(monthStartDay),
    });
  } catch (error) {
    console.error('[WidgetDataSync] Failed to save monthly expense data:', error);
    throw error;
  }
}

/**
 * 잠금화면 위젯 금액 공개 상태를 초기화(재마스킹)합니다.
 * 앱 진입 직후 호출해 위젯에 금액이 계속 노출되지 않도록 합니다.
 */
export async function resetMonthlyExpenseMaskInWidget(): Promise<void> {
  if (Platform.OS !== 'ios') return;

  if (!widgetDataSync || typeof widgetDataSync.clearMonthlyExpenseRevealState !== 'function') {
    return;
  }

  try {
    await widgetDataSync.clearMonthlyExpenseRevealState();
  } catch (error) {
    console.warn('[WidgetDataSync] Failed to reset monthly expense reveal state:', error);
  }
}

