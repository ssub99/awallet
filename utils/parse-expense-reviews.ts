/**
 * parse-expense 규칙 보정 SSOT (동기).
 * Gemini 초안·Simple 결과 모두 이 모듈을 거친다.
 * 공휴일 해석·메모 AI micro-call은 API 레이어 전용.
 */

import { resolveExpenseRecurringTypeFromMessage } from './expense-calculations';
import { extractMemoFromMessage } from './parse-expense-memo';
import {
  resolveExpenseSeriesStartDateFromMessage,
  resolveRelativeWeekdayDateFromMessage,
} from './parse-expense-relative-date';

export const PARSE_EXPENSE_INCOME_HINT_RE =
  /월급|급여|보너스|입금|용돈|환급|수입|꽁돈|용돈받|salary|income|bonus|windfall/i;

export const PARSE_EXPENSE_RECURRING_HINT_RE =
  /구독|매달|매월|월세|정기|매주|매일|subscription|monthly|recurring/i;

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

export function hasIncomeHintInMessage(message: string): boolean {
  return PARSE_EXPENSE_INCOME_HINT_RE.test(message);
}

export function hasRecurringHintInMessage(message: string): boolean {
  const inferred = resolveExpenseRecurringTypeFromMessage(message);
  return (
    inferred != null ||
    PARSE_EXPENSE_RECURRING_HINT_RE.test(message) ||
    /subscription|monthly|recurring/i.test(message)
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

/**
 * 정기/할부: 메시지 힌트로 isRecurring / isInstallment·기간·주말옵션 보정.
 * 수입 레코드는 시리즈를 두지 않음.
 */
export function reviewSeries<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  const msg = message.trim();
  if (!msg) return record;
  if (record.recordType === 'income' || hasIncomeHintInMessage(msg)) {
    return record;
  }

  const inferredRecurringType = resolveExpenseRecurringTypeFromMessage(
    msg,
    record.recurringType,
  );
  const hasRecurring = hasRecurringHintInMessage(msg);
  const hasInstallment = hasInstallmentHintInMessage(msg);
  const isRecurring = toBool(record.isRecurring);
  const isInstallment = toBool(record.isInstallment);

  // AI가 이미 정기인데 메시지 힌트로 타입·기본값 보강
  if (hasRecurring && isRecurring && !isInstallment) {
    return {
      ...record,
      isRecurring: true,
      recurringType: inferredRecurringType || record.recurringType || '매월',
      totalMonths: record.totalMonths ?? 12,
      weekendOption: record.weekendOption ?? 'weekend',
    };
  }

  // 메시지에 정기 힌트 있는데 AI가 안 준 경우
  if (hasRecurring && !isRecurring && !isInstallment) {
    let recurringType = record.recurringType;
    if (!recurringType) {
      if (inferredRecurringType) recurringType = inferredRecurringType;
      else if (/매주|주간|weekly/i.test(msg)) recurringType = '매주';
      else if (/매일|일간|daily/i.test(msg)) recurringType = '매일';
      else recurringType = '매월';
    }
    return {
      ...record,
      isRecurring: true,
      recurringType,
      totalMonths: record.totalMonths ?? 12,
      weekendOption: record.weekendOption ?? 'weekend',
    };
  }

  // AI는 정기인데 메시지에서 더 구체적 주기 추론
  if (isRecurring && inferredRecurringType && inferredRecurringType !== record.recurringType) {
    return {
      ...record,
      recurringType: inferredRecurringType,
    };
  }

  if (hasInstallment && !isRecurring && !isInstallment) {
    const match = msg.match(/(\d+)개월/);
    const months = match ? Math.min(12, Math.max(2, parseInt(match[1], 10) || 3)) : 3;
    return {
      ...record,
      isInstallment: true,
      totalMonths: record.totalMonths ?? months,
      weekendOption: record.weekendOption ?? 'weekend',
    };
  }

  return record;
}

/**
 * 날짜: absoluteDateOverride(공휴일 등) 우선, 없으면 상대요일 규칙.
 * 정기/할부 지출은 시리즈 시작일도 보정.
 */
export function reviewDates<T extends ParseExpenseReviewRecord>(
  message: string,
  today: string,
  record: T,
  absoluteDateOverride?: string | null,
): T {
  const resolvedDate =
    absoluteDateOverride ??
    resolveRelativeWeekdayDateFromMessage(message, today) ??
    null;

  let next: T = resolvedDate != null ? { ...record, date: resolvedDate } : record;

  const isExpenseSeries =
    next.recordType !== 'income' &&
    (toBool(next.isRecurring) || toBool(next.isInstallment));
  if (!isExpenseSeries) {
    return next;
  }

  const seriesStart = resolveExpenseSeriesStartDateFromMessage(
    message,
    today,
    next.date,
  );
  return seriesStart ? { ...next, date: seriesStart } : next;
}

/**
 * API memo가 비었을 때 구조화 `메모 … 금액` 규칙만 채움 (AI 없음).
 */
export function reviewMemoRuleFallback<T extends ParseExpenseReviewRecord>(
  message: string,
  record: T,
): T {
  const apiMemo = typeof record.memo === 'string' ? record.memo.trim() : '';
  if (apiMemo.length > 0) return record;

  const ruleMemo = extractMemoFromMessage(message);
  if (ruleMemo == null) return record;
  return { ...record, memo: ruleMemo };
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
 * 응답 records 전체에 타입·시리즈·날짜 보정.
 * absoluteDateOverride: 공휴일 매칭일 등 (API에서만 넘김).
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

  // 타입·시리즈는 첫 건만 (기존 API 동작과 동일)
  const first = reviewRecordTypeAndSeries(message, result.records[0]);
  const withTypeSeries: T[] = [first, ...result.records.slice(1)];

  const override = options?.absoluteDateOverride;
  const records = withTypeSeries.map((record) =>
    reviewDates(message, today, record, override),
  );

  return {
    ...result,
    records,
  };
}
