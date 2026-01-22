/**
 * Widget Data Sync Utility
 * 
 * React Native 앱에서 위젯으로 데이터를 공유하기 위한 유틸리티
 * App Group UserDefaults를 사용하여 데이터를 저장합니다.
 */

import { NativeModules, Platform } from 'react-native';

// iOS 네이티브 모듈 인터페이스
interface WidgetDataSyncModule {
  saveMonthlyExpenseData: (data: {
    expense: number;
    income: number;
    balance: number;
    monthStartDay: number;
  }) => Promise<void>;
}

// 네이티브 모듈 가져오기 (iOS만)
const { WidgetDataSync } = NativeModules;
const widgetDataSync = WidgetDataSync as WidgetDataSyncModule | undefined;

/**
 * 이번달 소비금액 데이터를 위젯에 저장
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
    // iOS가 아니면 무시
    return;
  }

  if (!widgetDataSync) {
    console.warn('[WidgetDataSync] Native module not available');
    return;
  }

  try {
    await widgetDataSync.saveMonthlyExpenseData({
      expense,
      income,
      balance,
      monthStartDay,
    });
  } catch (error) {
    console.error('[WidgetDataSync] Failed to save monthly expense data:', error);
  }
}
