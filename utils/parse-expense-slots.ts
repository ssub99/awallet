/**
 * 간편입력 슬롯 추출 — 어순 무관.
 * 문장 1회에서 필드별 추출기를 돌릴 뿐, N! 순열을 시도하지 않음.
 *
 * 최소 코어: recordType · category · amount
 * 선택: date · memo · series(반복/할부·주말옵션)
 */

import { resolveExpenseRecurringTypeFromMessage } from './expense-calculations';
import {
  extractMemoFromMessage,
  extractMemoRawSpan,
  hasMemoIntent,
  shouldRefineMemoWithAi,
} from './parse-expense-memo';
import { resolveRelativeWeekdayDateFromMessage } from './parse-expense-relative-date';
import {
  hasIncomeHintInMessage,
  hasInstallmentHintInMessage,
  hasRecurringHintInMessage,
  type ParseExpenseReviewWeekendOption,
} from './parse-expense-reviews';
import { collectKoreanWonAmountsFromMessage } from './parse-korean-won-amount';

export type ParseExpenseSlotRecordType = 'expense' | 'income';

export type ParseExpenseSlotRejectReason =
  | 'empty'
  | 'chat'
  | 'holiday'
  | 'no_amount'
  | 'multi_amount'
  | 'no_category'
  | 'unresolved_date'
  | 'memo_needs_ai';

export interface ParseExpensePaymentSubtypeOption {
  type: 'credit' | 'debit';
  label: string;
}

export interface ParseExpenseSlots {
  recordType: ParseExpenseSlotRecordType;
  category: string | null;
  amount: number | null;
  /** 확정 절대일. unresolved면 null */
  date: string | null;
  /** 문장에 날짜 표현이 없었음 → 호출측에서 today 사용 가능 */
  dateOmitted: boolean;
  memo: string | null;
  /** 자연어 메모 등 규칙만으로 부족 → Gemini 경로 */
  memoNeedsAi: boolean;
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: ParseExpenseReviewWeekendOption;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
  rejectReason?: ParseExpenseSlotRejectReason;
}

const HOLIDAY_HINT_RE =
  /설날|추석|크리스마스|공휴일|연휴|어린이날|현충일|광복절|개천절|한글날/;
const NON_EXPENSE_REPLY_RE = /^(안녕|고마워|뭐해|도움|설명|알려)/;

const AMOUNT_WON_RE = /(\d[\d,]*)\s*원/g;
const AMOUNT_UNIT_RE = /(\d[\d,]*)\s*(만원|천원|백원)/g;
const HANGUL_MANCHEON_RE = /(\d+)\s*만\s*(?:(\d+)\s*천)?\s*원/g;

const WEEKDAY_OR_RELATIVE_HINT_RE =
  /저번주|지난주|전주|이번주|금주|다음주|차주|월요일|화요일|수요일|목요일|금요일|토요일|일요일|월욜|화욜|수욜|목욜|금욜|토욜|일욜/;

function parseTodayParts(today: string): { y: number; m: number; d: number } | null {
  const m = today.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function formatDate(y: number, m: number, d: number): string {
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

function shiftToday(today: string, deltaDays: number): string {
  const parts = parseTodayParts(today);
  if (!parts) return today;
  const date = new Date(parts.y, parts.m - 1, parts.d);
  date.setDate(date.getDate() + deltaDays);
  return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function collectAmountsFromMessage(message: string): number[] {
  const amounts: number[] = [];

  for (const match of message.matchAll(AMOUNT_WON_RE)) {
    const raw = match[1].replace(/,/g, '');
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) amounts.push(n);
  }

  for (const match of message.matchAll(AMOUNT_UNIT_RE)) {
    const raw = match[1].replace(/,/g, '');
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = match[2];
    if (unit === '만원') amounts.push(n * 10_000);
    else if (unit === '천원') amounts.push(n * 1_000);
    else if (unit === '백원') amounts.push(n * 100);
  }

  for (const match of message.matchAll(HANGUL_MANCHEON_RE)) {
    const man = parseInt(match[1], 10);
    const cheon = match[2] ? parseInt(match[2], 10) : 0;
    if (Number.isFinite(man) && man > 0) {
      amounts.push(man * 10_000 + (Number.isFinite(cheon) ? cheon * 1_000 : 0));
    }
  }

  amounts.push(...collectKoreanWonAmountsFromMessage(message));

  return amounts;
}

export function extractAmountSlot(message: string): number | null {
  const unique = [...new Set(collectAmountsFromMessage(message))];
  if (unique.length !== 1) return null;
  return unique[0];
}

export function extractCategorySlot(message: string, categories: string[]): string | null {
  const sorted = [...categories].sort((a, b) => b.length - a.length);
  for (const label of sorted) {
    if (label.length > 0 && message.includes(label)) {
      return label;
    }
  }
  return null;
}

export function extractRecordTypeSlot(message: string): ParseExpenseSlotRecordType {
  return hasIncomeHintInMessage(message) ? 'income' : 'expense';
}

/**
 * 날짜 슬롯. 생략이면 date=today, dateOmitted=true.
 * 요일/상대 표현이 있는데 해석 불가면 date=null.
 */
export function extractDateSlot(
  message: string,
  today: string,
): { date: string | null; dateOmitted: boolean; unresolved: boolean } {
  const relative = resolveRelativeWeekdayDateFromMessage(message, today);
  if (relative != null) {
    return { date: relative, dateOmitted: false, unresolved: false };
  }

  if (/오늘/.test(message)) {
    return { date: today, dateOmitted: false, unresolved: false };
  }
  if (/어제/.test(message)) {
    return { date: shiftToday(today, -1), dateOmitted: false, unresolved: false };
  }
  if (/그제/.test(message)) {
    return { date: shiftToday(today, -2), dateOmitted: false, unresolved: false };
  }
  if (/내일/.test(message)) {
    return { date: shiftToday(today, 1), dateOmitted: false, unresolved: false };
  }
  if (/모레/.test(message)) {
    return { date: shiftToday(today, 2), dateOmitted: false, unresolved: false };
  }

  const full = message.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (full) {
    return {
      date: formatDate(Number(full[1]), Number(full[2]), Number(full[3])),
      dateOmitted: false,
      unresolved: false,
    };
  }

  const md = message.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    const parts = parseTodayParts(today);
    if (!parts) {
      return { date: null, dateOmitted: false, unresolved: true };
    }
    return {
      date: formatDate(parts.y, Number(md[1]), Number(md[2])),
      dateOmitted: false,
      unresolved: false,
    };
  }

  if (WEEKDAY_OR_RELATIVE_HINT_RE.test(message)) {
    return { date: null, dateOmitted: false, unresolved: true };
  }

  return { date: today, dateOmitted: true, unresolved: false };
}

function extractWeekendOptionSlot(message: string): ParseExpenseReviewWeekendOption {
  const compact = message.replace(/\s+/g, '');
  if (/금주요?금요일|주말이면금요일|금요일에기록|금요일기록/.test(compact)) {
    return 'friday';
  }
  if (/차주요?월요일|주말이면월요일|월요일에기록|월요일기록/.test(compact)) {
    return 'monday';
  }
  return 'weekend';
}

export function extractSeriesSlot(message: string): {
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: ParseExpenseReviewWeekendOption;
} | null {
  if (hasIncomeHintInMessage(message)) {
    return null;
  }

  const hasRecurring = hasRecurringHintInMessage(message);
  const hasInstallment = hasInstallmentHintInMessage(message);
  if (!hasRecurring && !hasInstallment) {
    return null;
  }

  const weekendOption = extractWeekendOptionSlot(message);

  if (hasInstallment && !hasRecurring) {
    const match = message.match(/(\d+)개월/);
    const months = match ? Math.min(12, Math.max(2, parseInt(match[1], 10) || 3)) : 3;
    return {
      isInstallment: true,
      totalMonths: months,
      weekendOption,
    };
  }

  const inferred = resolveExpenseRecurringTypeFromMessage(message);
  let recurringType = inferred;
  if (!recurringType) {
    if (/매주|주간|weekly/i.test(message)) recurringType = '매주';
    else if (/매일|일간|daily/i.test(message)) recurringType = '매일';
    else recurringType = '매월';
  }

  return {
    isRecurring: true,
    recurringType,
    totalMonths: 12,
    weekendOption,
  };
}

/**
 * 메모 슬롯. 구조화 규칙 우선, 어순 보정용 trailing `메모 …` 폴백.
 * 자연어 의도만 있고 규칙 불가 → memoNeedsAi.
 */
export function extractMemoSlot(message: string): {
  memo: string | null;
  memoNeedsAi: boolean;
} {
  const ruleMemo = extractMemoFromMessage(message);
  const rawSpan = extractMemoRawSpan(message);
  if (rawSpan != null) {
    const ruled = ruleMemo ?? '';
    if (ruled.length > 0 && !shouldRefineMemoWithAi(rawSpan, ruled)) {
      return { memo: ruled, memoNeedsAi: false };
    }
    return { memo: ruled.length > 0 ? ruled : null, memoNeedsAi: true };
  }

  // 금액이 메모보다 앞에 있는 경우: `…8000원 메모 치킨`
  const trailing = message.match(/(?:^|\s)메모(?:[:：는]?\s+)(.+)$/);
  if (trailing) {
    const body = trailing[1].trim();
    if (body.length > 0 && !/넣어|남겨|적어|써|기록|추가|달아|해\s*줘/.test(body)) {
      return { memo: body, memoNeedsAi: false };
    }
  }

  if (hasMemoIntent(message)) {
    return { memo: null, memoNeedsAi: true };
  }

  return { memo: null, memoNeedsAi: false };
}

export function extractPaymentSlot(
  message: string,
  paymentSubtypeOptions: ParseExpensePaymentSubtypeOption[] = [],
): {
  paymentMethod: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
} {
  if (/현금/.test(message)) {
    return { paymentMethod: 'cash' };
  }

  const method: 'credit' | 'debit' = /체크/.test(message) ? 'debit' : 'credit';
  const sorted = [...paymentSubtypeOptions]
    .filter((item) => item.type === method)
    .sort((a, b) => b.label.length - a.label.length);

  for (const option of sorted) {
    if (message.includes(option.label)) {
      return { paymentMethod: method, paymentSubtypeLabel: option.label };
    }
  }

  return { paymentMethod: method };
}

/**
 * 문장에서 슬롯을 각각 추출 (어순 무관, 순열 루프 없음).
 */
export function extractParseExpenseSlots(
  message: string,
  today: string,
  categories: string[],
  paymentSubtypeOptions: ParseExpensePaymentSubtypeOption[] = [],
): ParseExpenseSlots {
  const msg = message.trim();
  if (msg.length === 0) {
    return {
      recordType: 'expense',
      category: null,
      amount: null,
      date: null,
      dateOmitted: true,
      memo: null,
      memoNeedsAi: false,
      rejectReason: 'empty',
    };
  }

  if (NON_EXPENSE_REPLY_RE.test(msg)) {
    return {
      recordType: 'expense',
      category: null,
      amount: null,
      date: null,
      dateOmitted: true,
      memo: null,
      memoNeedsAi: false,
      rejectReason: 'chat',
    };
  }

  if (HOLIDAY_HINT_RE.test(msg)) {
    return {
      recordType: 'expense',
      category: null,
      amount: null,
      date: null,
      dateOmitted: true,
      memo: null,
      memoNeedsAi: false,
      rejectReason: 'holiday',
    };
  }

  const amounts = [...new Set(collectAmountsFromMessage(msg))];
  if (amounts.length === 0) {
    return {
      recordType: extractRecordTypeSlot(msg),
      category: extractCategorySlot(msg, categories),
      amount: null,
      date: null,
      dateOmitted: true,
      memo: null,
      memoNeedsAi: false,
      rejectReason: 'no_amount',
    };
  }
  if (amounts.length > 1) {
    return {
      recordType: extractRecordTypeSlot(msg),
      category: extractCategorySlot(msg, categories),
      amount: null,
      date: null,
      dateOmitted: true,
      memo: null,
      memoNeedsAi: false,
      rejectReason: 'multi_amount',
    };
  }

  const recordType = extractRecordTypeSlot(msg);
  const category = extractCategorySlot(msg, categories);
  const amount = amounts[0];
  const dateSlot = extractDateSlot(msg, today);
  const memoSlot = extractMemoSlot(msg);
  const series =
    recordType === 'income' ? null : extractSeriesSlot(msg);
  const payment =
    recordType === 'income'
      ? undefined
      : extractPaymentSlot(msg, paymentSubtypeOptions);

  // AI 필요·날짜 미해석은 카테고리 유무와 무관하게 우선 거절 (Simple 게이트용)
  if (memoSlot.memoNeedsAi) {
    return {
      recordType,
      category,
      amount,
      date: dateSlot.date,
      dateOmitted: dateSlot.dateOmitted,
      memo: memoSlot.memo,
      memoNeedsAi: true,
      ...series,
      ...payment,
      rejectReason: 'memo_needs_ai',
    };
  }

  if (dateSlot.unresolved) {
    return {
      recordType,
      category,
      amount,
      date: null,
      dateOmitted: false,
      memo: memoSlot.memo,
      memoNeedsAi: false,
      ...series,
      ...payment,
      rejectReason: 'unresolved_date',
    };
  }

  if (category == null) {
    return {
      recordType,
      category: null,
      amount,
      date: dateSlot.date,
      dateOmitted: dateSlot.dateOmitted,
      memo: memoSlot.memo,
      memoNeedsAi: false,
      ...series,
      ...payment,
      rejectReason: 'no_category',
    };
  }

  return {
    recordType,
    category,
    amount,
    date: dateSlot.date,
    dateOmitted: dateSlot.dateOmitted,
    memo: memoSlot.memo,
    memoNeedsAi: false,
    ...series,
    ...payment,
  };
}

/** 규칙만으로 기록 JSON을 만들 수 있는지 (Gemini 생략 가능). */
export function canBuildRecordFromSlots(slots: ParseExpenseSlots): boolean {
  return (
    slots.rejectReason == null &&
    slots.category != null &&
    slots.amount != null &&
    slots.date != null &&
    !slots.memoNeedsAi
  );
}
