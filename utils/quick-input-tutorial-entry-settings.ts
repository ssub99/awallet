/**
 * 간편입력 메인 · 체험하기 진입로 펼침 여부.
 * 미저장(최초) → 펼침. 사용자가 접기/펼치면 값을 유지한다.
 *
 * 간편 기록 생성 체험 — 고정 문장·가상 기록 카드 (API 파싱 없음).
 */

import type { QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';
import type { QuickInputPendingRecord } from '@/utils/quick-input-pending-record';
import { getDayOfWeekLabel } from '@/utils/expense-calculations';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY =
  '@awallet/quickInputTutorialEntryExpanded';

/** 최초(키 없음) 기본값 — 펼침 */
export const QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT = true;

/** 간편 기록 생성 체험 — 입력 고정 문장 (Figma tutorialCreate*) */
export const TUTORIAL_CREATE_SAMPLE_MESSAGE = '오늘 빵 2만원 어치 사먹었어.';

/** Figma tutorialCreateRecordAddHint 확인 카드 가상 값 */
export const TUTORIAL_CREATE_CARD_AMOUNT = 20_000;
export const TUTORIAL_CREATE_CARD_CATEGORY = '식비';
export const TUTORIAL_CREATE_CARD_CATEGORY_EMOJI = '🍚';
export const TUTORIAL_CREATE_CARD_PAYMENT_TYPE = '신한카드';
/** Figma / 수신 체험 신한카드 칩과 동일 */
export const TUTORIAL_CREATE_CARD_PAYMENT_COLOR = '#2170FF';

function formatTutorialCreateCardDate(executedAt: Date): string {
  const year = executedAt.getFullYear();
  const month = executedAt.getMonth() + 1;
  const day = executedAt.getDate();
  const dayLabel = getDayOfWeekLabel(year, month, day);
  return `${year}년 ${month}월 ${day}일(${dayLabel})`;
}

function formatTutorialCreatePendingDate(executedAt: Date): string {
  const year = executedAt.getFullYear();
  const month = String(executedAt.getMonth() + 1).padStart(2, '0');
  const day = String(executedAt.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

/** 생성 체험 전송 시 확인 카드 — 문장/API와 무관한 고정 가상 데이터 */
export function createTutorialCreateConfirmCard(
  executedAt: Date = new Date(),
): QuickInputConfirmCardData {
  return {
    recordType: 'expense',
    category: TUTORIAL_CREATE_CARD_CATEGORY,
    categoryEmoji: TUTORIAL_CREATE_CARD_CATEGORY_EMOJI,
    date: formatTutorialCreateCardDate(executedAt),
    amount: `${TUTORIAL_CREATE_CARD_AMOUNT.toLocaleString('ko-KR')}원`,
    paymentType: TUTORIAL_CREATE_CARD_PAYMENT_TYPE,
    paymentTypeColor: TUTORIAL_CREATE_CARD_PAYMENT_COLOR,
    repeatOption1: '안함',
  };
}

/** 생성 체험 확인 카드에 대응하는 pending (추가 시 persist용) */
export function createTutorialCreatePendingRecord(
  executedAt: Date = new Date(),
): QuickInputPendingRecord {
  return {
    recordType: 'expense',
    category: TUTORIAL_CREATE_CARD_CATEGORY,
    date: formatTutorialCreatePendingDate(executedAt),
    amount: TUTORIAL_CREATE_CARD_AMOUNT,
    paymentMethod: 'credit',
    paymentSubtypeLabel: TUTORIAL_CREATE_CARD_PAYMENT_TYPE,
    paymentSubtypeColor: TUTORIAL_CREATE_CARD_PAYMENT_COLOR,
  };
}

export async function loadQuickInputTutorialEntryExpanded(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY);
  if (raw === null) return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_DEFAULT;
  }
}

export async function saveQuickInputTutorialEntryExpanded(
  expanded: boolean,
): Promise<void> {
  await AsyncStorage.setItem(
    QUICK_INPUT_TUTORIAL_ENTRY_EXPANDED_KEY,
    JSON.stringify(expanded),
  );
}
