/**
 * 리포트 「소비 현황」 집계.
 * 레코드 선별·금액 합산 규칙은 기존 소비 현황(챌린지 화면의 리포트 모드)과 동일하며,
 * 한 달 대신 여러 달 구간으로 묶는 것만 다르다.
 */

import { isDateInCustomMonth } from './custom-month';

export interface TrendItem {
  date: string;
  category: string;
  amount: number;
  isRecurring?: boolean;
  isInstallment?: boolean;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeId?: string;
}

export interface MonthTotal {
  count: number;
  amount: number;
}

/** 지출 순위(전체) / 정기 지출 / 할부 지출 */
export type TrendRankingFilter = 'all' | 'recurring' | 'installment';

/**
 * 평균을 낼 때 쓰는 「지출이 있는」 기록인지. 환불·결산으로 0원이 된 기록은 건수와 목록에는 남지만
 * 그것만 있는 달은 평균의 분모에 넣지 않는다.
 */
export function hasSpentAmount(item: { amount?: number }): boolean {
  return (item.amount ?? 0) > 0;
}

export function matchesTrendType(
  item: { isRecurring?: boolean; isInstallment?: boolean },
  filter: TrendRankingFilter,
): boolean {
  if (filter === 'recurring') return item.isRecurring === true;
  if (filter === 'installment') return item.isInstallment === true;
  return true;
}

/** 년·월을 연속된 정수로 변환 (구간 계산용) */
export function toMonthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function parseTrendItems(storedData: string): TrendItem[] {
  const calendarData = JSON.parse(storedData) as Record<
    string,
    {
      records?: {
        type?: string;
        category?: string;
        amount?: number;
        isRecurring?: boolean;
        isInstallment?: boolean;
        isDeleted?: boolean;
        paymentMethod?: 'credit' | 'debit' | 'cash';
        paymentSubtypeId?: string;
      }[];
    }
  >;
  const items: TrendItem[] = [];
  Object.entries(calendarData).forEach(([dateString, data]) => {
    data?.records?.forEach((record) => {
      if (record.isDeleted || record.type !== 'expense') return;
      items.push({
        date: dateString,
        category: record.category || '기타',
        amount: record.amount || 0,
        isRecurring: record.isRecurring,
        isInstallment: record.isInstallment,
        paymentMethod: record.paymentMethod ?? 'credit',
        paymentSubtypeId: record.paymentSubtypeId,
      });
    });
  });
  return items;
}

/** 커스텀 월(월 시작일 반영)별로 묶는다. 키는 `toMonthIndex` */
export function groupByMonth(items: TrendItem[], monthStartDay: number): Map<number, TrendItem[]> {
  const byMonth = new Map<number, TrendItem[]>();
  const monthsByDate = new Map<string, number[]>();
  items.forEach((item) => {
    let indexes = monthsByDate.get(item.date);
    if (!indexes) {
      const [y, m, d] = item.date.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const calendarIndex = toMonthIndex(y, m);
      // 월 시작일이 1이 아니면 앞선 달의 커스텀 월에 속할 수 있다. 판정은 `isDateInCustomMonth` 그대로 사용.
      indexes = [calendarIndex - 2, calendarIndex - 1, calendarIndex].filter((index) => {
        const target = fromMonthIndex(index);
        return isDateInCustomMonth(date, target.year, target.month, monthStartDay);
      });
      monthsByDate.set(item.date, indexes);
    }
    indexes.forEach((index) => {
      const bucket = byMonth.get(index);
      if (bucket) bucket.push(item);
      else byMonth.set(index, [item]);
    });
  });
  return byMonth;
}

export function sumItems(items: TrendItem[] | undefined): MonthTotal {
  return (items ?? []).reduce<MonthTotal>(
    (total, item) => ({ count: total.count + 1, amount: total.amount + item.amount }),
    { count: 0, amount: 0 },
  );
}

/**
 * 선택한 달을 가운데 두는 구간의 마지막 달. 짝수 개월은 과거 쪽에 한 달을 더 둔다.
 * 당월을 넘을 수 없고, 넘는 만큼은 구간이 과거 쪽으로 밀린다.
 */
export function getWindowEndIndex(anchorIndex: number, length: number, currentIndex: number): number {
  return Math.min(anchorIndex + Math.floor((length - 1) / 2), currentIndex);
}

/** `endIndex`에서 거꾸로 `length`개월. 기록이 없는 달도 포함한다. 반환 순서는 최신 달 먼저. */
export function getWindowMonths(endIndex: number, length: number): number[] {
  return Array.from({ length }, (_, offset) => endIndex - offset);
}

/** 달을 직접 골라 담을 수 있는 폭 — 보고 있는 구간의 마지막 달까지 */
export const PICKABLE_MONTH_LENGTH = 12;

export interface MonthPickRule {
  /** 담을 수 있는 최대 개월 수 (조회 범위) */
  maxCount: number;
  /** 보고 있는 기본 구간의 마지막 달 */
  endIndex: number;
}

/**
 * 막대를 길게 눌렀을 때의 새 선택 목록(최신 달 먼저). 반응하지 않아야 하면 null —
 * 하나 남은 달 빼기, 꽉 찬 상태에서 담기, 12개월 밖의 달 담기.
 */
export function togglePickedMonth(
  pickedMonths: number[],
  monthIndex: number,
  { maxCount, endIndex }: MonthPickRule,
): number[] | null {
  if (pickedMonths.includes(monthIndex)) {
    return pickedMonths.length > 1 ? pickedMonths.filter((index) => index !== monthIndex) : null;
  }
  if (pickedMonths.length >= maxCount) return null;
  const pickable = getWindowMonths(endIndex, PICKABLE_MONTH_LENGTH);
  if (!pickable.includes(monthIndex)) return null;
  return [...pickedMonths, monthIndex].sort((a, b) => b - a);
}

/** 선택한 달을 뺐을 때 옮겨 갈 달 — 바로 다음의 최근 달, 없으면 바로 이전 달 */
export function getNextSelectedMonth(pickedMonths: number[], removedIndex: number): number {
  const newer = pickedMonths.filter((index) => index > removedIndex);
  return newer.length > 0 ? Math.min(...newer) : Math.max(...pickedMonths);
}

/** 달이 빠짐없이 이어지며 `currentIndex`에서 끝나는지 (제목의 「최근」) */
export function isRecentRun(months: number[], currentIndex: number): boolean {
  if (months.length === 0) return false;
  const newest = Math.max(...months);
  return newest === currentIndex && newest - Math.min(...months) + 1 === months.length;
}

/** 구간의 합계와 월 평균. 평균은 금액이 있는 달만으로 나눈다 (빈 달·0원뿐인 달 제외) */
export function summarizeWindow(
  byMonth: Map<number, TrendItem[]>,
  months: number[],
): { total: number; average: number; recordedMonthCount: number } {
  const total = months.reduce((sum, index) => sum + sumItems(byMonth.get(index)).amount, 0);
  const recordedMonthCount = months.filter((index) => byMonth.get(index)?.some(hasSpentAmount)).length;
  return {
    total,
    average: recordedMonthCount > 0 ? total / recordedMonthCount : 0,
    recordedMonthCount,
  };
}

export interface CategoryTrend {
  category: string;
  count: number;
  amount: number;
  /** `months` 순서 그대로 */
  monthly: (MonthTotal & { monthIndex: number })[];
}

/** 카테고리별 합계 — 금액 큰 순. 지출 유형은 `byMonth`를 만들기 전에 거른다 */
export function rankCategories(
  byMonth: Map<number, TrendItem[]>,
  months: number[],
): CategoryTrend[] {
  const categories = new Map<string, Map<number, MonthTotal>>();
  months.forEach((monthIndex) => {
    byMonth.get(monthIndex)?.forEach((item) => {
      const monthly = categories.get(item.category) ?? new Map<number, MonthTotal>();
      const current = monthly.get(monthIndex) ?? { count: 0, amount: 0 };
      monthly.set(monthIndex, { count: current.count + 1, amount: current.amount + item.amount });
      categories.set(item.category, monthly);
    });
  });

  return Array.from(categories.entries())
    .map(([category, totals]) => {
      const monthly = months.map((monthIndex) => ({
        monthIndex,
        ...(totals.get(monthIndex) ?? { count: 0, amount: 0 }),
      }));
      return {
        category,
        count: monthly.reduce((sum, month) => sum + month.count, 0),
        amount: monthly.reduce((sum, month) => sum + month.amount, 0),
        monthly,
      };
    })
    .sort((a, b) => b.amount - a.amount);
}

export interface AverageDifference {
  /** `same`은 반올림한 차이가 0원 */
  direction: 'over' | 'under' | 'same';
  /** 월 평균과의 차이(원) */
  amount: number;
}

/** 월 평균보다 더/덜 쓴 금액. 비교하는 달에 내역이 있을 때 부른다 */
export function getAverageDifference(amount: number, average: number): AverageDifference {
  const rounded = Math.round(amount - average);
  if (rounded === 0) return { direction: 'same', amount: 0 };
  return { direction: rounded > 0 ? 'over' : 'under', amount: Math.abs(rounded) };
}

function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * `start`~`end` 중 소비 금액이 0원인 날 수. 오늘 이후와 첫 기록 이전의 날은 세지 않는다.
 * `firstRecordDate`는 calendarData 날짜 키(YYYY-MM-DD).
 */
export function countNoSpendDays(
  items: TrendItem[],
  start: Date,
  end: Date,
  firstRecordDate: string | null,
  today: Date,
): number {
  if (firstRecordDate === null) return 0;
  const spentDates = new Set(items.filter((item) => item.amount > 0).map((item) => item.date));
  const todayKey = toDateKey(today);
  const endKey = toDateKey(end);
  const lastKey = endKey < todayKey ? endKey : todayKey;
  let count = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let key = toDateKey(cursor); key <= lastKey; key = toDateKey(cursor)) {
    if (key >= firstRecordDate && !spentDates.has(key)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
