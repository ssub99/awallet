/**
 * 간편입력 단순 패턴 규칙 파싱 — Gemini 호출 생략 (토큰 절감).
 * 슬롯 추출(어순 무관)로 코어(기록타입·카테고리·금액)가 확정되면 사용.
 * 날짜·메모·시리즈는 선택(생략 가능).
 */

import {
  canBuildRecordFromSlots,
  extractAmountSlot,
  extractParseExpenseSlots,
  type ParseExpensePaymentSubtypeOption,
  type ParseExpenseSlots,
} from './parse-expense-slots';

export type SimplePaymentSubtypeOption = ParseExpensePaymentSubtypeOption;

export interface SimpleParseRecord {
  recordType?: 'expense' | 'income';
  category: string;
  date: string;
  amount: number;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
  memo?: string;
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: 'weekend' | 'friday' | 'monday';
}

export interface SimpleParseResult {
  records: SimpleParseRecord[];
  suggestedCategory: null;
  reply: null;
}

function slotsToRecord(slots: ParseExpenseSlots): SimpleParseRecord | null {
  if (!canBuildRecordFromSlots(slots) || slots.category == null || slots.amount == null || slots.date == null) {
    return null;
  }

  const record: SimpleParseRecord = {
    recordType: slots.recordType,
    category: slots.category,
    date: slots.date,
    amount: slots.amount,
  };

  if (slots.recordType === 'income') {
    if (slots.memo) record.memo = slots.memo;
    return record;
  }

  record.paymentMethod = slots.paymentMethod ?? 'credit';
  if (slots.paymentSubtypeLabel) {
    record.paymentSubtypeLabel = slots.paymentSubtypeLabel;
  }
  if (slots.memo) record.memo = slots.memo;
  if (slots.isRecurring) {
    record.isRecurring = true;
    record.recurringType = slots.recurringType ?? '매월';
    record.totalMonths = slots.totalMonths ?? 12;
    record.weekendOption = slots.weekendOption ?? 'weekend';
  }
  if (slots.isInstallment) {
    record.isInstallment = true;
    record.totalMonths = slots.totalMonths ?? 3;
    record.weekendOption = slots.weekendOption ?? 'weekend';
  }

  return record;
}

/** Gemini 없이 처리 가능한 후보인지 (사전 게이트). */
export function isSimpleExpenseCandidate(message: string, historyLength: number): boolean {
  const msg = message.trim();
  if (msg.length === 0 || historyLength > 0) return false;
  // 카테고리 없이도 금액·거절 사유만 빠르게 봄 (today placeholder)
  const slots = extractParseExpenseSlots(msg, '2000.01.01', []);
  if (
    slots.rejectReason === 'empty' ||
    slots.rejectReason === 'chat' ||
    slots.rejectReason === 'holiday' ||
    slots.rejectReason === 'no_amount' ||
    slots.rejectReason === 'multi_amount' ||
    slots.rejectReason === 'memo_needs_ai'
  ) {
    return false;
  }
  // 금액은 있어야 함 (후보 게이트)
  return extractAmountSlot(msg) != null;
}

/**
 * 슬롯 추출 기반 단순 파싱. 불가하면 null → 호출측에서 Gemini 사용.
 */
export function tryParseSimpleExpense(
  message: string,
  categories: string[],
  today: string,
  paymentSubtypeOptions: SimplePaymentSubtypeOption[] = [],
): SimpleParseResult | null {
  const msg = message.trim();
  if (msg.length === 0) return null;

  const slots = extractParseExpenseSlots(msg, today, categories, paymentSubtypeOptions);
  const record = slotsToRecord(slots);
  if (record == null) return null;

  return {
    records: [record],
    suggestedCategory: null,
    reply: null,
  };
}

export { extractParseExpenseSlots, canBuildRecordFromSlots } from './parse-expense-slots';
