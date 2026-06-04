/**
 * Widget Data Sync Utility
 *
 * React Native 앱에서 iOS/Android 홈(또는 iOS 잠금) 위젯으로 "이번달 소비" 요약 데이터를 공유합니다.
 * - iOS: App Group UserDefaults
 * - Android: SharedPreferences (flavor별 applicationId로 분리)
 */

import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getCustomMonthInfo, isDateInCustomMonth } from '@/utils/custom-month';
import { getAllExpenses, type ExpenseRecord } from '@/utils/expenses';
import { getAllIncomes, type IncomeRecord } from '@/utils/incomes';
import { NativeModules, Platform } from 'react-native';

interface WidgetDataSyncModule {
  saveMonthlyExpenseData: (data: {
    expense: number;
    income: number;
    balance: number;
    monthStartDay: number;
  }) => Promise<void>;
  clearMonthlyExpenseRevealState: () => Promise<void>;
  /** 위젯 trampoline 2초 스플래시 직후 — JS prepare() 추가 대기 스킵 (1회 소비) */
  consumeWidgetTrampolineSplash?: () => Promise<boolean>;
  /** Main 위 네이티브 스플래시 오버레이 제거 (홈 표시 직전) */
  dismissWidgetMainSplashOverlay?: () => Promise<void>;
}

const { WidgetDataSync } = NativeModules;
const widgetDataSync = WidgetDataSync as WidgetDataSyncModule | undefined;

const isNativeWidgetPlatform = Platform.OS === 'ios' || Platform.OS === 'android';

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
  if (!isNativeWidgetPlatform) {
    return;
  }

  try {
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
 */
export async function saveMonthlyExpenseToWidget(
  expense: number,
  income: number,
  balance: number,
  monthStartDay: number
): Promise<void> {
  if (!isNativeWidgetPlatform) {
    return;
  }

  if (!widgetDataSync) {
    console.warn('[WidgetDataSync] Native module not available');
    return;
  }

  if (typeof widgetDataSync.saveMonthlyExpenseData !== 'function') {
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
 * 위젯 금액 공개 상태를 초기화(재마스킹)합니다.
 * 앱 진입 직후 호출해 위젯에 금액이 계속 노출되지 않도록 합니다.
 */
export async function dismissWidgetMainSplashOverlayOnAndroid(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (
    !widgetDataSync ||
    typeof widgetDataSync.dismissWidgetMainSplashOverlay !== 'function'
  ) {
    return;
  }
  try {
    await widgetDataSync.dismissWidgetMainSplashOverlay();
  } catch {
    // ignore
  }
}

export async function consumeWidgetTrampolineSplashOnAndroid(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (
    !widgetDataSync ||
    typeof widgetDataSync.consumeWidgetTrampolineSplash !== 'function'
  ) {
    return false;
  }
  try {
    return Boolean(await widgetDataSync.consumeWidgetTrampolineSplash());
  } catch {
    return false;
  }
}

export async function resetMonthlyExpenseMaskInWidget(): Promise<void> {
  if (!isNativeWidgetPlatform) return;

  if (!widgetDataSync || typeof widgetDataSync.clearMonthlyExpenseRevealState !== 'function') {
    return;
  }

  try {
    await widgetDataSync.clearMonthlyExpenseRevealState();
  } catch (error) {
    console.warn('[WidgetDataSync] Failed to reset monthly expense reveal state:', error);
  }
}
