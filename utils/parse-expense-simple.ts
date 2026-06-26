/**
 * 간편입력 단순 패턴 규칙 파싱 — Gemini 호출 생략 (토큰 절감).
 * 카테고리·금액·날짜가 명확하고 메모/정기/할부/수입이 없을 때만 사용.
 */

import { resolveRelativeWeekdayDateFromMessage } from './parse-expense-relative-date';
import { hasMemoIntent } from './parse-expense-memo';

export interface SimpleParseRecord {
  recordType?: 'expense';
  category: string;
  date: string;
  amount: number;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
}

export interface SimpleParseResult {
  records: SimpleParseRecord[];
  suggestedCategory: null;
  reply: null;
}

export interface SimplePaymentSubtypeOption {
  type: 'credit' | 'debit';
  label: string;
}

const INCOME_HINT_RE =
  /월급|급여|보너스|입금|용돈|환급|수입|꽁돈|용돈받|salary|income|bonus|windfall/i;
const RECURRING_HINT_RE =
  /구독|매달|매월|월세|정기|매주|매일|subscription|monthly|recurring/i;
const INSTALLMENT_HINT_RE = /할부|\d+개월\s*할부/;
const HOLIDAY_HINT_RE = /설날|추석|크리스마스|공휴일|연휴|어린이날|현충일|광복절|개천절|한글날/;
const NON_EXPENSE_REPLY_RE = /^(안녕|고마워|뭐해|도움|설명|알려)/;

const AMOUNT_WON_RE = /(\d[\d,]*)\s*원/g;
const AMOUNT_UNIT_RE = /(\d[\d,]*)\s*(만원|천원|백원)/g;
const HANGUL_MANCHEON_RE = /(\d+)\s*만\s*(?:(\d+)\s*천)?\s*원/g;

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

function collectAmounts(message: string): number[] {
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

  return amounts;
}

function extractSingleAmount(message: string): number | null {
  const unique = [...new Set(collectAmounts(message))];
  if (unique.length !== 1) return null;
  return unique[0];
}

function findCategoryInMessage(message: string, categories: string[]): string | null {
  const sorted = [...categories].sort((a, b) => b.length - a.length);
  for (const label of sorted) {
    if (label.length > 0 && message.includes(label)) {
      return label;
    }
  }
  return null;
}

function resolveSimpleDate(message: string, today: string): string | null {
  const relative = resolveRelativeWeekdayDateFromMessage(message, today);
  if (relative != null) return relative;

  if (/오늘/.test(message)) return today;
  if (/어제/.test(message)) return shiftToday(today, -1);
  if (/그제/.test(message)) return shiftToday(today, -2);
  if (/내일/.test(message)) return shiftToday(today, 1);
  if (/모레/.test(message)) return shiftToday(today, 2);

  const full = message.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (full) {
    return formatDate(Number(full[1]), Number(full[2]), Number(full[3]));
  }

  const md = message.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (md) {
    const parts = parseTodayParts(today);
    if (!parts) return null;
    return formatDate(parts.y, Number(md[1]), Number(md[2]));
  }

  if (
    /저번주|이번주|다음주|월요일|화요일|수요일|목요일|금요일|토요일|일요일/.test(message)
  ) {
    return null;
  }

  return today;
}

function resolveSimplePayment(
  message: string,
  paymentSubtypeOptions: SimplePaymentSubtypeOption[],
): Pick<SimpleParseRecord, 'paymentMethod' | 'paymentSubtypeLabel'> {
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

/** Gemini 없이 처리 가능한 단순 입력인지 (사전 게이트). */
export function isSimpleExpenseCandidate(message: string, historyLength: number): boolean {
  const msg = message.trim();
  if (msg.length === 0 || historyLength > 0) return false;
  if (hasMemoIntent(msg)) return false;
  if (INCOME_HINT_RE.test(msg)) return false;
  if (RECURRING_HINT_RE.test(msg)) return false;
  if (INSTALLMENT_HINT_RE.test(msg)) return false;
  if (HOLIDAY_HINT_RE.test(msg)) return false;
  if (NON_EXPENSE_REPLY_RE.test(msg)) return false;
  if (extractSingleAmount(msg) == null) return false;
  return true;
}

/**
 * 단순 패턴 파싱. 불가하면 null → 호출측에서 Gemini 사용.
 */
export function tryParseSimpleExpense(
  message: string,
  categories: string[],
  today: string,
  paymentSubtypeOptions: SimplePaymentSubtypeOption[] = [],
): SimpleParseResult | null {
  const msg = message.trim();
  if (!isSimpleExpenseCandidate(msg, 0)) {
    return null;
  }

  const category = findCategoryInMessage(msg, categories);
  if (category == null) {
    return null;
  }

  const amount = extractSingleAmount(msg);
  if (amount == null) {
    return null;
  }

  const date = resolveSimpleDate(msg, today);
  if (date == null) {
    return null;
  }

  const payment = resolveSimplePayment(msg, paymentSubtypeOptions);

  return {
    records: [
      {
        recordType: 'expense',
        category,
        date,
        amount,
        ...payment,
      },
    ],
    suggestedCategory: null,
    reply: null,
  };
}
