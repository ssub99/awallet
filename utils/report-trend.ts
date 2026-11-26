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
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeId?: string;
}

export interface MonthTotal {
  count: number;
  amount: number;
}

export type TrendRankingFilter = 'all' | 'recurring';

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
 * `endIndex`에서 거꾸로 `length`개월. 첫 기록이 있는 달보다 앞선 달은 제외한다.
 * 반환 순서는 최신 달 먼저.
 */
export function getWindowMonths(
  endIndex: number,
  length: number,
  firstRecordIndex: number | null,
): number[] {
  if (firstRecordIndex == null) return [];
  return Array.from({ length }, (_, offset) => endIndex - offset).filter(
    (index) => index >= firstRecordIndex,
  );
}

/** 구간의 합계와 월 평균. 기록 시작 이후의 빈 달은 0원으로 평균에 포함된다. */
export function summarizeWindow(
  byMonth: Map<number, TrendItem[]>,
  months: number[],
): { total: number; average: number } {
  const total = months.reduce((sum, index) => sum + sumItems(byMonth.get(index)).amount, 0);
  return { total, average: months.length > 0 ? total / months.length : 0 };
}

export interface CategoryTrend {
  category: string;
  count: number;
  amount: number;
  /** `months` 순서 그대로 */
  monthly: (MonthTotal & { monthIndex: number })[];
}

/** 지출 순위(정기 지출 제외) / 정기 지출 — 금액 큰 순 */
export function rankCategories(
  byMonth: Map<number, TrendItem[]>,
  months: number[],
  filter: TrendRankingFilter,
): CategoryTrend[] {
  const categories = new Map<string, Map<number, MonthTotal>>();
  months.forEach((monthIndex) => {
    byMonth.get(monthIndex)?.forEach((item) => {
      if (filter === 'recurring' ? !item.isRecurring : item.isRecurring) return;
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
