/**
 * Widget Data Sync Utility
 *
 * React Native 앱에서 iOS 위젯으로 "이번달 소비" 요약 데이터를 공유하기 위한 유틸리티입니다.
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
      expense,
      income,
      balance,
      monthStartDay,
    });
  } catch (error) {
    console.error('[WidgetDataSync] Failed to save monthly expense data:', error);
  }
}

