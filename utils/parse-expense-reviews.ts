/**
 * parse-expense 규칙 보정 SSOT (동기).
 * Gemini 초안·Simple 결과 모두 이 모듈을 거친다.
 * 공휴일 해석·메모 AI micro-call은 API 레이어 전용.
 *
 * 시리즈 소유권:
 *  1) reviewConsumptionForm — 일반 | 정기 | 할부
 *  2) reviewSeriesDetails — recurringType · totalMonths · weekendOption
 *  3) reviewDates — 날짜 (주말옵션 요일 오염 방지 · 매달 N일)
 */

import {
  extractWeekendOptionFromMessage,
  resolveExpenseRecurringTypeFromMessage,
  stripWeekendOptionClauses,
} from './expense-calculations';
import { extractMemoFromMessage } from './parse-expense-memo';
import {
  resolveExpenseSeriesStartDateFromMessage,
  resolveRelativeWeekdayDateFromMessage,
} from './parse-expense-relative-date';

export const PARSE_EXPENSE_INCOME_HINT_RE =
  /월급|급여|보너스|입금|용돈|환급|수입|꽁돈|용돈받|salary|income|bonus|windfall/i;

export const PARSE_EXPENSE_RECURRING_HINT_RE =
  /구독|매달|매월|월세|정기|매주|매일|주말마다|매주말|주중마다|subscription|monthly|recurring/i;

export const PARSE_EXPENSE_INSTALLMENT_HINT_RE = /할부|\d+개월\s*할부/;

export type ParseExpenseReviewWeekendOption = 'weekend' | 'friday' | 'monday';

export interface ParseExpenseReviewRecord {
  recordType?: 'expense' | 'income';
  category?: string | null;
  date: string;
  amount?: number;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
  memo?: string;
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: ParseExpenseReviewWeekendOption;
}

export interface ParseExpenseReviewResult<T extends ParseExpenseReviewRecord> {
  records: T[];
  suggestedCategory?: { label: string; emoji: string } | null;
  reply?: string | null;
}

function toBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === 'true') return true;
  if (v === 1) return true;
  return false;
}

function parseTodayParts(today: string): { y: number; m: number; d: number } | null {
  const m = today.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDot(y: number, m: number, d: number): string {
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`;
}

/** 매달/매월 N일 → 기준월(today)의 해당 일 (말일 클램프) */
export function resolveMonthlyRecurringDayDateFromMessage(
  message: string,
  today: string,
): string | null {
  const compact = stripWeekendOptionClauses(message).replace(/\s+/g, '');
  const match = compact.match(/(?:매달|매월|월마다)(\d{1,2})일/);
  if (!match) return null;
  const parts = parseTodayParts(today);
  if (!parts) return null;
  const day = Number(match[1]);
  if (!Number.isFinite(day) || day < 1 || day > 31) return null;
  const clamped = Math.min(day, lastDayOfMonth(parts.y, parts.m));
  return formatDot(parts.y, parts.m, clamped);
}

export function hasIncomeHintInMessage(message: string): boolean {
  return PARSE_EXPENSE_INCOME_HINT_RE.test(message);
}

/**
 * 정기 형태 힌트. 주기 resolver에 의존하지 않음 (주말옵션 오염 방지).
 */
export function hasRecurringHintInMessage(message: string): boolean {
  const stripped = stripWeekendOptionClauses(message);
  return (
    PARSE_EXPENSE_RECURRING_HINT_RE.test(stripped) ||
    /subscription|monthly|recurring/i.test(stripped)
  );
}

export function hasInstallmentHintInMessage(message: string): boolean {
  return PARSE_EXPENSE_INSTALLMENT_HINT_RE.test(message);
}

/**
 * 기록타입: 수입 힌트가 있으면 income으로 확정하고 결제·시리즈 필드 제거.
 */
export function reviewRecordType<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  if (!hasIncomeHintInMessage(message)) {
    return record;
  }

  return {
    ...record,
    recordType: 'income',
    paymentMethod: undefined,
    paymentSubtypeLabel: undefined,
    isRecurring: undefined,
    isInstallment: undefined,
    recurringType: undefined,
    totalMonths: undefined,
    weekendOption: undefined,
  };
}

export type ConsumptionForm = 'none' | 'recurring' | 'installment';

/**
 * 소비 형태: 일반 | 정기 | 할부.
 * 할부 명시가 정기 힌트보다 우선. 힌트 없으면 AI 플래그 유지.
 */
export function resolveConsumptionForm(
  message: string,
  record: {
    isRecurring?: boolean;
    isInstallment?: boolean;
  },
): ConsumptionForm {
  const hasInstallment = hasInstallmentHintInMessage(message);
  const hasRecurring = hasRecurringHintInMessage(message);

  if (hasInstallment) return 'installment';
  if (hasRecurring) return 'recurring';

  if (toBool(record.isInstallment) && !toBool(record.isRecurring)) return 'installment';
  if (toBool(record.isRecurring)) return 'recurring';
  return 'none';
}

export function reviewConsumptionForm<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  const msg = message.trim();
  if (!msg) return record;
  if (record.recordType === 'income' || hasIncomeHintInMessage(msg)) {
    return record;
  }

  const form = resolveConsumptionForm(msg, record);
  if (form === 'installment') {
    const match = msg.match(/(\d+)\s*개월/);
    const months = match ? Math.min(12, Math.max(2, parseInt(match[1], 10) || 3)) : 3;
    return {
      ...record,
      isInstallment: true,
      isRecurring: undefined,
      recurringType: undefined,
      totalMonths: record.totalMonths ?? months,
    };
  }

  if (form === 'recurring') {
    return {
      ...record,
      isRecurring: true,
      isInstallment: undefined,
      totalMonths: record.totalMonths ?? 12,
    };
  }

  // 힌트 없음 → AI 플래그 유지 (넷플릭스 등)
  return record;
}

/**
 * 주기·개월·주말옵션. 형태가 시리즈일 때만.
 * weekendOption은 문장 기준(요청 없으면 weekend).
 */
export function reviewSeriesDetails<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  const msg = message.trim();
  if (!msg) return record;
  if (record.recordType === 'income') return record;

  const isRecurring = toBool(record.isRecurring);
  const isInstallment = toBool(record.isInstallment);
  if (!isRecurring && !isInstallment) return record;

  const weekendOption = extractWeekendOptionFromMessage(msg);

  if (isInstallment) {
    const match = msg.match(/(\d+)\s*개월/);
    const months = match
      ? Math.min(12, Math.max(2, parseInt(match[1], 10) || 3))
      : (record.totalMonths ?? 3);
    return {
      ...record,
      isInstallment: true,
      isRecurring: undefined,
      recurringType: undefined,
      totalMonths: months,
      weekendOption,
    };
  }

  const inferredRecurringType = resolveExpenseRecurringTypeFromMessage(
    msg,
    record.recurringType,
  );
  let recurringType = inferredRecurringType || record.recurringType;
  if (!recurringType) {
    if (/매주|주간|weekly/i.test(msg)) recurringType = '매주';
    else if (/매일|일간|daily/i.test(msg)) recurringType = '매일';
    else recurringType = '매월';
  }

  return {
    ...record,
    isRecurring: true,
    isInstallment: undefined,
    recurringType,
    totalMonths: record.totalMonths ?? 12,
    weekendOption,
  };
}

/**
 * 정기/할부: 형태 → 디테일.
 */
export function reviewSeries<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  return reviewSeriesDetails(message, reviewConsumptionForm(message, record));
}

/**
 * 날짜: absoluteDateOverride 우선.
 * 주말옵션 절의 요일은 상대요일 해석에서 제외.
 * 시리즈면 매달 N일·시리즈 시작일 보정.
 */
export function reviewDates<T extends ParseExpenseReviewRecord>(
  message: string,
  today: string,
  record: T,
  absoluteDateOverride?: string | null,
): T {
  const messageForRelative = stripWeekendOptionClauses(message);

  const resolvedDate =
    absoluteDateOverride ??
    resolveRelativeWeekdayDateFromMessage(messageForRelative, today) ??
    null;

  let next: T = resolvedDate != null ? { ...record, date: resolvedDate } : record;

  const isExpenseSeries =
    next.recordType !== 'income' &&
    (toBool(next.isRecurring) || toBool(next.isInstallment));
  if (!isExpenseSeries) {
    return next;
  }

  const monthlyDay = resolveMonthlyRecurringDayDateFromMessage(message, today);
  if (monthlyDay != null) {
    next = { ...next, date: monthlyDay };
  }

  const seriesStart = resolveExpenseSeriesStartDateFromMessage(
    message,
    today,
    next.date,
  );
  return seriesStart ? { ...next, date: seriesStart } : next;
}

/** 메모에서 시리즈·주말옵션 지시어 제거 */
export function sanitizeParseExpenseMemo(memo: string): string {
  return memo
    .replace(/주말\s*옵션\S*/g, ' ')
    .replace(/(?:금주\s*)?금요일에\s*(?:나가|기록)\S*/g, ' ')
    .replace(/(?:차주\s*)?월요일에\s*(?:나가|기록)\S*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * API memo가 비었을 때 구조화 규칙 채움 + 시리즈 노이즈 제거.
 */
export function reviewMemoRuleFallback<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  const apiMemo = typeof record.memo === 'string' ? record.memo.trim() : '';
  if (apiMemo.length > 0) {
    const cleaned = sanitizeParseExpenseMemo(apiMemo);
    return cleaned.length > 0 ? { ...record, memo: cleaned } : { ...record, memo: undefined };
  }

  const ruleMemo = extractMemoFromMessage(message);
  if (ruleMemo == null) return record;
  const cleaned = sanitizeParseExpenseMemo(ruleMemo);
  if (cleaned.length === 0) return record;
  return { ...record, memo: cleaned };
}

/**
 * 첫 레코드에 타입·시리즈 보정 적용 (동기 SSOT 핵심).
 */
export function reviewRecordTypeAndSeries<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  return reviewSeries(message, reviewRecordType(message, record));
}

/**
 * 응답 records 전체에 타입·시리즈·날짜·메모 보정.
 */
export function applySyncParseExpenseReviews<T extends ParseExpenseReviewRecord>(
  message: string,
  today: string,
  result: ParseExpenseReviewResult<T>,
  options?: { absoluteDateOverride?: string | null },
): ParseExpenseReviewResult<T> {
  if (result.records.length === 0) {
    return result;
  }

  const first = reviewMemoRuleFallback(
    message,
    reviewRecordTypeAndSeries(message, result.records[0]),
  );
  const withTypeSeries: T[] = [first, ...result.records.slice(1)];

  const override = options?.absoluteDateOverride;
  const records = withTypeSeries.map((record, index) => {
    const dated = reviewDates(message, today, record, override);
    return index === 0 ? reviewMemoRuleFallback(message, dated) : dated;
  });

  return {
    ...result,
    records,
  };
}
