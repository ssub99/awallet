/**
 * 반복 기록(정기·할부) 그룹의 순수 로직 — 원본 값 읽기·보존, 일괄 수정, 복사용 새 회차 생성.
 * 저장소는 건드리지 않는다.
 */

import {
  addCalendarMonths,
  adjustWeekendDate,
  calculateRecurringIterations,
  formatDateWithDayAnchor,
  getNextRecurringDate,
  shouldIgnoreWeekendOptionForRecurringType,
} from './expense-calculations';
import type { ExpenseRecord, PaymentMethod } from './expenses';

export type RecurringGroupKind = 'recurring' | 'installment';
export type WeekendOption = 'weekend' | 'friday' | 'monday';

export interface RecurringGroupRef {
  kind: RecurringGroupKind;
  groupId: string;
}

/** 편집·복사 화면에 채우는 값. 타임라인에서 회차별로 고친 값은 반영하지 않는다 */
export interface RecurringSeed {
  category: string;
  memo: string;
  /** 정기는 회차 금액, 할부는 총액 */
  amount: number;
  paymentMethod: PaymentMethod;
  paymentSubtypeId?: string;
  recurringType: string;
  installmentMonths: number;
  weekendOption: WeekendOption;
  /** 첫 기록의 예정일 (YYYY.MM.DD) */
  startDate: string;
}

/** 바꾼 항목만 담는다 */
export interface RecurringChanges {
  memo?: string;
  /** 정기는 회차 금액, 할부는 총액 */
  amount?: number;
  payment?: { paymentMethod: PaymentMethod; paymentSubtypeId?: string };
}

export function getGroupRecords(expenses: ExpenseRecord[], ref: RecurringGroupRef): ExpenseRecord[] {
  return expenses.filter((expense) => {
    if (expense.isDeleted) return false;
    return ref.kind === 'recurring'
      ? expense.isRecurring === true && expense.recurringId === ref.groupId
      : expense.isInstallment === true && expense.installmentId === ref.groupId;
  });
}

/** 첫(가장 이른 회차) 기록. 회차 timestamp는 생성 순서대로이고 수정해도 유지된다 */
export function getFirstRecord(records: ExpenseRecord[]): ExpenseRecord {
  return records.reduce((first, record) => (record.timestamp < first.timestamp ? record : first));
}

function originalAmountOf(record: ExpenseRecord): number {
  return (
    record.originalAmount ??
    record.originalAmountBeforeSettlement ??
    (record.isRefunded ? record.originalAmountBeforeRefund : undefined) ??
    record.amount
  );
}

/**
 * 원본 값이 비어 있으면 수정 전 값으로 채워, 개별 수정이 원본을 덮지 않게 한다.
 * 원본을 바꾸는 것은 반복 기록 관리의 일괄 수정뿐이다.
 */
export function keepSeriesOriginals(previous: ExpenseRecord, next: ExpenseRecord): ExpenseRecord {
  if (!previous.recurringId && !previous.installmentId) return next;
  return {
    ...next,
    originalAmount: originalAmountOf(previous),
    originalCategory: previous.originalCategory ?? previous.category,
    originalDate: previous.originalDate ?? previous.date,
    originalMemo: previous.originalMemo ?? previous.memo ?? '',
    originalPaymentMethod: previous.originalPaymentMethod ?? previous.paymentMethod,
    originalPaymentSubtypeId:
      previous.originalPaymentMethod !== undefined
        ? previous.originalPaymentSubtypeId
        : previous.paymentSubtypeId,
  };
}

/** 할부 총액을 회차 금액으로 나눈다. 나머지는 첫 회차에 더한다 */
export function splitInstallmentAmount(total: number, months: number): { first: number; rest: number } {
  const rest = Math.floor(total / months);
  return { first: total - rest * (months - 1), rest };
}

function getInstallmentTotal(records: ExpenseRecord[], months: number): number {
  const amounts = records.map(originalAmountOf);
  if (records.length === months) return amounts.reduce((sum, amount) => sum + amount, 0);
  // 올해를 넘는 회차는 만들어지지 않는다 — 첫 회차 + 나머지 회차 금액으로 되돌린다
  return originalAmountOf(getFirstRecord(records)) + Math.min(...amounts) * (months - 1);
}

export function buildRecurringSeed(records: ExpenseRecord[], kind: RecurringGroupKind): RecurringSeed {
  const first = getFirstRecord(records);
  const installmentMonths = first.installmentMonths ?? records.length;
  const hasOriginalPayment = first.originalPaymentMethod !== undefined;
  return {
    category: first.originalCategory ?? first.category,
    memo: first.originalMemo ?? first.memo ?? '',
    amount:
      kind === 'installment' ? getInstallmentTotal(records, installmentMonths) : originalAmountOf(first),
    paymentMethod: (hasOriginalPayment ? first.originalPaymentMethod : first.paymentMethod) ?? 'credit',
    paymentSubtypeId: hasOriginalPayment ? first.originalPaymentSubtypeId : first.paymentSubtypeId,
    recurringType: first.recurringType?.trim() || '매월',
    installmentMonths,
    weekendOption: first.weekendOption ?? 'weekend',
    startDate: first.originalDate ?? first.date,
  };
}

/**
 * 그룹의 모든 기록에 바꾼 항목을 적용한 전체 기록 목록을 돌려준다. 날짜와 반복 옵션은 바꾸지 않는다.
 * 환불·결산 기록은 0원을 유지하고 복구될 금액만 갱신한다. 선결제 기록은 금액도 갱신한다.
 */
export function applyRecurringChanges(
  expenses: ExpenseRecord[],
  ref: RecurringGroupRef,
  changes: RecurringChanges,
  updatedAt: string,
): ExpenseRecord[] {
  const records = getGroupRecords(expenses, ref);
  if (records.length === 0) return expenses;
  const first = getFirstRecord(records);
  const split =
    ref.kind === 'installment' && changes.amount !== undefined
      ? splitInstallmentAmount(changes.amount, first.installmentMonths ?? records.length)
      : null;
  const targets = new Set(records);

  return expenses.map((record) => {
    if (!targets.has(record)) return record;
    // 바꾸지 않는 항목의 원본은 먼저 확보해 둔다
    const next: ExpenseRecord = { ...keepSeriesOriginals(record, record), updatedAt };
    if (changes.memo !== undefined) {
      next.memo = changes.memo;
      next.originalMemo = changes.memo;
    }
    if (changes.payment) {
      next.paymentMethod = changes.payment.paymentMethod;
      next.paymentSubtypeId = changes.payment.paymentSubtypeId;
      next.originalPaymentMethod = changes.payment.paymentMethod;
      next.originalPaymentSubtypeId = changes.payment.paymentSubtypeId;
    }
    if (changes.amount !== undefined) {
      const amount = split ? (record === first ? split.first : split.rest) : changes.amount;
      next.originalAmount = amount;
      if (record.isRefunded) next.originalAmountBeforeRefund = amount;
      if (record.isSettled) next.originalAmountBeforeSettlement = amount;
      if (!record.isRefunded && !record.isSettled) next.amount = amount;
    }
    return next;
  });
}

export interface NewSeriesInput {
  /** 사용자가 고른 시작일 (YYYY.MM.DD) */
  date: string;
  category: string;
  /** 정기·일반은 회차 금액, 할부는 총액 */
  amount: number;
  memo: string;
  paymentMethod: PaymentMethod;
  paymentSubtypeId?: string;
  isRecurring: boolean;
  isInstallment: boolean;
  recurringType: string;
  totalMonths: number;
  weekendOption: WeekendOption;
}

export interface NewSeriesIds {
  groupId: string;
  createRecordId: () => string;
  /** 첫 회차 timestamp — 이후 회차는 1씩 더한다 */
  timestamp: number;
}

function dayOfWeekOf(date: string): number {
  const [year, month, day] = date.split('.').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function toDot(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

/** 새 소비 기록(반복 포함)을 만든다. 날짜 규칙은 소비 기록 생성 화면과 같다 (올해 안에서만 생성) */
export function buildNewSeries(input: NewSeriesInput, ids: NewSeriesIds): ExpenseRecord[] {
  const { date, isRecurring, isInstallment, recurringType, totalMonths, weekendOption } = input;
  const isRepeat = isRecurring || isInstallment;
  const ignoreWeekendOption = isRecurring && shouldIgnoreWeekendOptionForRecurringType(recurringType);
  const adjust = (target: string) => {
    const day = dayOfWeekOf(target);
    return isRepeat && (day === 0 || day === 6) && weekendOption !== 'weekend' && !ignoreWeekendOption
      ? adjustWeekendDate(target, weekendOption)
      : target;
  };

  const startDay = dayOfWeekOf(date);
  const isWeekendStart = startDay === 0 || startDay === 6;
  const isShiftedStart =
    isRecurring &&
    ((recurringType === '주중' && isWeekendStart) || (recurringType === '주말' && !isWeekendStart));

  let firstDate = adjust(date);
  if (isShiftedStart) {
    // 주말에서 시작하는 「주중」은 다음 월요일, 주중에서 시작하는 「주말」은 그 주 토요일부터
    const [year, month, day] = date.split('.').map(Number);
    const offset = recurringType === '주중' ? (8 - startDay) % 7 || 7 : 6 - startDay;
    firstDate = toDot(new Date(year, month - 1, day + offset));
  }

  const installment = isInstallment ? splitInstallmentAmount(input.amount, totalMonths) : null;
  const toRecord = (index: number, recordDate: string): ExpenseRecord => {
    const amount = installment ? (index === 0 ? installment.first : installment.rest) : input.amount;
    const paymentSubtypeId = input.paymentMethod === 'cash' ? undefined : input.paymentSubtypeId;
    return {
      id: ids.createRecordId(),
      type: 'expense',
      amount,
      category: input.category,
      memo: input.memo,
      date: recordDate,
      timestamp: ids.timestamp + index,
      paymentMethod: input.paymentMethod,
      paymentSubtypeId,
      isRecurring,
      weekendOption: isRepeat ? weekendOption : undefined,
      recurringId: isRecurring ? ids.groupId : undefined,
      installmentId: isInstallment ? ids.groupId : undefined,
      isAutoGenerated: index > 0,
      isInstallment: isInstallment ? true : undefined,
      totalMonths: isRecurring ? totalMonths : undefined,
      installmentMonths: isInstallment ? totalMonths : undefined,
      originalInstallment: isInstallment ? true : undefined,
      recurringType: isRecurring ? recurringType : undefined,
      originalAmount: amount,
      originalCategory: input.category,
      originalDate: recordDate,
      originalMemo: input.memo,
      originalPaymentMethod: input.paymentMethod,
      originalPaymentSubtypeId: paymentSubtypeId,
      createdVia: 'screen',
    };
  };

  const records = [toRecord(0, firstDate)];
  if (!isRepeat) return records;

  const [startYear, startMonth, anchorDay] = date.split('.').map(Number);
  const iterations = isRecurring ? calculateRecurringIterations(date, recurringType) : totalMonths;
  let currentDate = date;
  for (let index = 1; index < iterations; index += 1) {
    let nextDate: string | null;
    if (isRecurring) {
      nextDate = getNextRecurringDate(currentDate, recurringType, index, startYear, anchorDay);
    } else {
      const shifted = addCalendarMonths(startYear, startMonth, index);
      nextDate =
        shifted.year > startYear
          ? null
          : formatDateWithDayAnchor(shifted.year, shifted.month, anchorDay);
    }
    // 시작일을 옮긴 경우 첫 반복일이 시작일과 겹치지 않게 한 번 더 건너뛴다
    if (nextDate && index === 1 && isShiftedStart && nextDate <= firstDate) {
      nextDate = getNextRecurringDate(nextDate, recurringType, index, startYear, anchorDay);
    }
    if (!nextDate) break;
    records.push(toRecord(index, adjust(nextDate)));
    // 다음 회차는 주말 보정 전 날짜를 기준으로 계산한다
    currentDate = nextDate;
  }
  return records;
}
