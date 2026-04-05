/**
 * Consumption Index (FQ) utilities
 *
 * - 월별 소비 지능 지수(FQ) 계산
 * - Notion "소비 지수 기능" 정책을 코드로 옮긴 로직 계층
 *
 * 이 모듈은 UI/네트워크에 의존하지 않는 순수 함수만 제공합니다.
 */

import { getCustomMonthRange, parseCalendarDateKeyLocal } from './custom-month';

export type RecordType = 'income' | 'expense';

export interface CalendarRecord {
  id?: string;
  type: RecordType;
  category?: string;
  amount: number;
  timestamp?: number;
  isDeleted?: boolean;
  /** 정기 지출 여부 (피드백용 카테고리 집계에서 제외) */
  isRecurring?: boolean;
  /** 할부 지출 여부 (피드백용 카테고리 집계에서 제외) */
  isInstallment?: boolean;
}

export interface CalendarDayData {
  records?: CalendarRecord[];
}

export type CalendarData = Record<string, CalendarDayData | undefined>;

export interface MonthlyConsumptionStats {
  year: number;
  month: number;
  monthStartDay: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD

  totalExpense: number;
  expenseCount: number;

  /** 날짜별 소비 횟수 (지출 기록 수) */
  dailyExpenseCounts: Record<string, number>;

  /** 전체 건당 평균 300% 초과 건 비율 (0~1) */
  highAmountRatio: number;

  /** 무지출일 수 */
  noSpendDays: number;

  /** 커스텀 월의 전체 일수 */
  totalDays: number;

  /** 동일 연도 내 직전 달에 데이터가 있는지 여부 (1월은 항상 false) */
  hasPreviousMonthData: boolean;

  /** 직전 달 총 지출 (hasPreviousMonthData 가 true일 때만 유효) */
  previousMonthTotalExpense: number;

  /** 카테고리별 소비 총액 및 비율 (amount / totalExpense), amount 내림차순 정렬 */
  categoryTotals: {
    category: string;
    amount: number;
    ratio: number;
  }[];
}

export interface FqScoreComponents {
  totalSpendingScore: number; // 0~60
  dailyFrequencyScore: number; // 0~20
  highSingleSpendingScore: number; // 0~10
  noSpendDaysScore: number; // 0~10
}

export type ConsumptionIndexStatus =
  | 'collecting' // 임계점 미만: 데이터 수집 중, 점수는 노출하지 않음
  | 'ready';

export interface ConsumptionIndexResult {
  status: ConsumptionIndexStatus;
  fqScore: number | null; // status === 'ready' 일 때만 0~100
  components: FqScoreComponents | null;
  stats: MonthlyConsumptionStats;
}

/**
 * 튜닝 가능한 상수들
 *
 * 필요 시 Notion 정책에 맞춰 조정할 수 있도록 모두 상수로 분리합니다.
 */

// FQ 구성 비율
const MAX_TOTAL_SPENDING_SCORE = 60;
const MAX_DAILY_FREQUENCY_SCORE = 20;
const MAX_HIGH_SINGLE_SPENDING_SCORE = 10;
const MAX_NO_SPEND_DAYS_SCORE = 10;

// 일평균 소비 횟수 기준 (하루 2~3회)
const TARGET_DAILY_COUNT_CENTER = 2.5;
const TARGET_DAILY_COUNT_TOLERANCE = 0.5; // 2.0~3.0 구간은 만점
const MAX_DAILY_COUNT_DELTA_FOR_SCORE = 3; // 중심에서 ±3회 이상 벗어나면 0점

// 고액 단건 판단 기준: 전체 건당 평균의 300%
const HIGH_SINGLE_MULTIPLIER = 3;
const HIGH_SINGLE_GOOD_RATIO = 0.1; // 10% 이하일 때 만점
const HIGH_SINGLE_BAD_RATIO = 0.5; // 50% 이상이면 0점

// 무지출일 목표
const TARGET_NO_SPEND_DAYS = 4;

// FQ 계산을 위해 필요한 최소 데이터 임계값
const MIN_EXPENSE_RECORDS_FOR_INDEX = 5;
const MIN_EXPENSE_ACTIVE_DAYS_FOR_INDEX = 3;

/**
 * YYYY-MM-DD 문자열로 포맷팅
 */
function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 커스텀 월의 모든 날짜 키(YYYY-MM-DD)를 생성
 */
function buildDateKeysInRange(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cur.getTime() <= end.getTime()) {
    keys.push(formatDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return keys;
}

/**
 * 동일 연도 내 직전 달의 총 지출 합계와 데이터 존재 여부를 계산합니다.
 *
 * - 1월인 경우 직전 달은 보지 않고 항상 "없음"으로 처리합니다.
 * - monthStartDay를 그대로 사용하여 커스텀 월 범위를 구합니다.
 */
function getPreviousMonthExpenseTotal(
  calendarData: CalendarData,
  year: number,
  month: number,
  monthStartDay: number,
): { hasPreviousMonthData: boolean; totalExpense: number } {
  if (month <= 1) {
    return { hasPreviousMonthData: false, totalExpense: 0 };
  }

  const previousMonth = month - 1;
  const { startDate, endDate } = getCustomMonthRange(year, previousMonth, monthStartDay);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  let totalExpense = 0;

  Object.entries(calendarData).forEach(([dateKey, dayData]) => {
    if (!dayData || !dayData.records || dayData.records.length === 0) {
      return;
    }
    const date = parseCalendarDateKeyLocal(dateKey);
    if (date == null) {
      return;
    }
    const time = date.getTime();
    if (time < startTime || time > endTime) {
      return;
    }

    dayData.records.forEach((record) => {
      if (record.type !== 'expense') {
        return;
      }
      if (record.isDeleted) {
        return;
      }
      if (typeof record.amount !== 'number' || record.amount <= 0) {
        return;
      }
      totalExpense += record.amount;
    });
  });

  return {
    hasPreviousMonthData: totalExpense > 0,
    totalExpense,
  };
}

/**
 * 월별 소비 통계를 계산합니다.
 *
 * - customMonth (year, month, monthStartDay)를 기준으로 범위를 결정합니다.
 * - calendarData는 AsyncStorage에 저장된 calendarData 구조를 그대로 사용합니다.
 */
export function computeMonthlyConsumptionStats(params: {
  calendarData: CalendarData;
  year: number;
  month: number; // 1-12 (커스텀 월 인덱스)
  monthStartDay: number;
  today?: Date;
}): MonthlyConsumptionStats {
  const { calendarData, year, month, monthStartDay } = params;
  const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const allDateKeys = buildDateKeysInRange(startDate, endDate);
  const dailyExpenseCounts: Record<string, number> = {};

  let totalExpense = 0;
  let expenseCount = 0;

  const categoryMap = new Map<string, number>();

  Object.entries(calendarData).forEach(([dateKey, dayData]) => {
    if (!dayData || !dayData.records || dayData.records.length === 0) {
      return;
    }
    const date = parseCalendarDateKeyLocal(dateKey);
    if (date == null) {
      return;
    }
    const time = date.getTime();
    if (time < startTime || time > endTime) {
      return;
    }

    let dayExpenseCount = 0;

    dayData.records.forEach((record) => {
      if (record.type !== 'expense') {
        return;
      }
      if (record.isDeleted) {
        return;
      }
      if (typeof record.amount !== 'number' || record.amount <= 0) {
        return;
      }

      expenseCount += 1;
      dayExpenseCount += 1;
      totalExpense += record.amount;

      // 피드백용 카테고리 집계에서는 정기/할부 지출은 제외
      const isRecurring = record.isRecurring === true;
      const isInstallment = record.isInstallment === true;
      if (!isRecurring && !isInstallment) {
        const categoryKey = record.category ?? '기타';
        const prevAmount = categoryMap.get(categoryKey) ?? 0;
        categoryMap.set(categoryKey, prevAmount + record.amount);
      }
    });

    if (dayExpenseCount > 0) {
      dailyExpenseCounts[dateKey] = dayExpenseCount;
    }
  });

  const totalDays = allDateKeys.length;
  const daysWithExpense = Object.keys(dailyExpenseCounts).length;
  const noSpendDays = Math.max(0, totalDays - daysWithExpense);

  // 고액 단건 비율 계산을 위해 전체 평균 단가를 기반으로 고액 건 비율을 산출
  let highAmountRatio = 0;
  if (expenseCount > 0 && totalExpense > 0) {
    const averagePerRecord = totalExpense / expenseCount;
    const threshold = averagePerRecord * HIGH_SINGLE_MULTIPLIER;

    let highCount = 0;

    Object.entries(calendarData).forEach(([dateKey, dayData]) => {
      if (!dayData || !dayData.records || dayData.records.length === 0) {
        return;
      }
      const date = parseCalendarDateKeyLocal(dateKey);
      if (date == null) {
        return;
      }
      const time = date.getTime();
      if (time < startTime || time > endTime) {
        return;
      }

      dayData.records.forEach((record) => {
        if (record.type !== 'expense') {
          return;
        }
        if (record.isDeleted) {
          return;
        }
        if (typeof record.amount !== 'number' || record.amount <= 0) {
          return;
        }
        if (record.amount >= threshold) {
          highCount += 1;
        }
      });
    });

    if (highCount > 0) {
      highAmountRatio = highCount / expenseCount;
    }
  }

  const categoryTotals: {
    category: string;
    amount: number;
    ratio: number;
  }[] = [];

  if (totalExpense > 0 && categoryMap.size > 0) {
    categoryMap.forEach((amount, category) => {
      if (amount <= 0) return;
      categoryTotals.push({
        category,
        amount,
        ratio: amount / totalExpense,
      });
    });
    categoryTotals.sort((a, b) => b.amount - a.amount);
  }

  const previousMonth = getPreviousMonthExpenseTotal(calendarData, year, month, monthStartDay);

  return {
    year,
    month,
    monthStartDay,
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(endDate),
    totalExpense,
    expenseCount,
    dailyExpenseCounts,
    highAmountRatio,
    noSpendDays,
    totalDays,
    hasPreviousMonthData: previousMonth.hasPreviousMonthData,
    previousMonthTotalExpense: previousMonth.totalExpense,
    categoryTotals,
  };
}

/**
 * 총 지출 점수 (0~60)
 *
 * - 기준 대비 당월 누적 지출 비율을 사용합니다.
 * - 기준:
 *   - 직전 달 데이터 있음: 직전 달 총 지출
 *   - 직전 달 데이터 없음: 당월 누적 일평균 × 커스텀 월 전체 일수
 */
function computeTotalSpendingScore(
  stats: MonthlyConsumptionStats,
  today: Date,
): { score: number; baseline: number } {
  const { totalExpense, totalDays, hasPreviousMonthData, previousMonthTotalExpense, startDate, endDate } =
    stats;

  if (totalExpense <= 0) {
    return { score: MAX_TOTAL_SPENDING_SCORE, baseline: 0 };
  }

  let baseline: number;

  if (hasPreviousMonthData && previousMonthTotalExpense > 0) {
    baseline = previousMonthTotalExpense;
  } else {
    // 전월 데이터가 없는 경우: 당월 누적 일평균 기준
    const start = parseCalendarDateKeyLocal(startDate);
    const end = parseCalendarDateKeyLocal(endDate);
    if (start == null || end == null) {
      return { score: MAX_TOTAL_SPENDING_SCORE, baseline: 0 };
    }
    const todayClamped = new Date(today);
    todayClamped.setHours(0, 0, 0, 0);

    const effectiveEnd =
      todayClamped.getTime() < start.getTime()
        ? start
        : todayClamped.getTime() > end.getTime()
          ? end
          : todayClamped;

    const daysElapsed =
      Math.floor((effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const safeDaysElapsed = Math.max(daysElapsed, 1);
    const dailyAverageSoFar = totalExpense / safeDaysElapsed;
    baseline = dailyAverageSoFar * totalDays;
  }

  if (baseline <= 0) {
    return { score: MAX_TOTAL_SPENDING_SCORE, baseline: 0 };
  }

  const ratio = totalExpense / baseline;

  if (ratio <= 1) {
    return { score: MAX_TOTAL_SPENDING_SCORE, baseline };
  }

  if (ratio >= 2) {
    return { score: 0, baseline };
  }

  const score = MAX_TOTAL_SPENDING_SCORE * (2 - ratio); // 1 → 60, 2 → 0
  return { score, baseline };
}

/**
 * 일평균 소비 횟수 점수 (0~20)
 *
 * - 커스텀 월 전체 일수를 분모로 사용합니다.
 * - 하루 2~3회(중심 2.5회)를 최적 구간으로 보고, 그 밖으로 벗어날수록 점수가 감소합니다.
 */
function computeDailyFrequencyScore(stats: MonthlyConsumptionStats): { score: number; average: number } {
  const { expenseCount, totalDays } = stats;

  if (totalDays <= 0) {
    return { score: 0, average: 0 };
  }

  if (expenseCount === 0) {
    // 지출이 전혀 없는 경우, 일평균 횟수 자체는 매우 이상적이라 보고 만점 부여
    return { score: MAX_DAILY_FREQUENCY_SCORE, average: 0 };
  }

  const average = expenseCount / totalDays;
  const delta = Math.abs(average - TARGET_DAILY_COUNT_CENTER);

  if (delta <= TARGET_DAILY_COUNT_TOLERANCE) {
    return { score: MAX_DAILY_FREQUENCY_SCORE, average };
  }

  if (delta >= MAX_DAILY_COUNT_DELTA_FOR_SCORE) {
    return { score: 0, average };
  }

  const normalized =
    1 - (delta - TARGET_DAILY_COUNT_TOLERANCE) / (MAX_DAILY_COUNT_DELTA_FOR_SCORE - TARGET_DAILY_COUNT_TOLERANCE);
  const score = MAX_DAILY_FREQUENCY_SCORE * normalized;
  return { score, average };
}

/**
 * 고액 단건 비율 점수 (0~10)
 *
 * - 전체 건당 평균의 300% 초과 건 비율을 사용합니다.
 */
function computeHighSingleSpendingScore(stats: MonthlyConsumptionStats): { score: number } {
  const { highAmountRatio } = stats;

  if (highAmountRatio <= 0) {
    return { score: MAX_HIGH_SINGLE_SPENDING_SCORE };
  }

  if (highAmountRatio <= HIGH_SINGLE_GOOD_RATIO) {
    return { score: MAX_HIGH_SINGLE_SPENDING_SCORE };
  }

  if (highAmountRatio >= HIGH_SINGLE_BAD_RATIO) {
    return { score: 0 };
  }

  const normalized =
    1 - (highAmountRatio - HIGH_SINGLE_GOOD_RATIO) / (HIGH_SINGLE_BAD_RATIO - HIGH_SINGLE_GOOD_RATIO);
  const score = MAX_HIGH_SINGLE_SPENDING_SCORE * normalized;
  return { score };
}

/**
 * 무지출일 비율 점수 (0~10)
 *
 * - 커스텀 월 전체 일수 중 무지출일 수를 사용합니다.
 * - TARGET_NO_SPEND_DAYS 이상이면 만점, 그 미만은 선형 비례.
 */
function computeNoSpendDaysScore(stats: MonthlyConsumptionStats): {
  score: number;
  targetDays: number;
} {
  const { noSpendDays } = stats;

  if (noSpendDays <= 0) {
    return { score: 0, targetDays: TARGET_NO_SPEND_DAYS };
  }

  if (noSpendDays >= TARGET_NO_SPEND_DAYS) {
    return { score: MAX_NO_SPEND_DAYS_SCORE, targetDays: TARGET_NO_SPEND_DAYS };
  }

  const ratio = noSpendDays / TARGET_NO_SPEND_DAYS;
  const score = MAX_NO_SPEND_DAYS_SCORE * ratio;
  return { score, targetDays: TARGET_NO_SPEND_DAYS };
}

/**
 * 소비 지수(FQ)를 계산합니다.
 *
 * - calendarData: AsyncStorage의 calendarData 풀 데이터
 * - year, month, monthStartDay: 커스텀 월 컨텍스트
 * - today: 기준일 (생략 시 현재 시각)
 */
export function computeConsumptionIndex(params: {
  calendarData: CalendarData;
  year: number;
  month: number;
  monthStartDay: number;
  today?: Date;
}): ConsumptionIndexResult {
  const { calendarData, year, month, monthStartDay } = params;
  const today = params.today ?? new Date();

  const stats = computeMonthlyConsumptionStats({
    calendarData,
    year,
    month,
    monthStartDay,
    today,
  });

  // 데이터 임계점 미만이면 "데이터 수집 중" 상태로 간주
  const activeDays = Object.keys(stats.dailyExpenseCounts).length;
  const hasEnoughRecords =
    stats.expenseCount >= MIN_EXPENSE_RECORDS_FOR_INDEX &&
    activeDays >= MIN_EXPENSE_ACTIVE_DAYS_FOR_INDEX;

  if (!hasEnoughRecords) {
    return {
      status: 'collecting',
      fqScore: null,
      components: null,
      stats,
    };
  }

  const totalSpending = computeTotalSpendingScore(stats, today);
  const dailyFrequency = computeDailyFrequencyScore(stats);
  const highSingle = computeHighSingleSpendingScore(stats);
  const noSpend = computeNoSpendDaysScore(stats);

  const rawFq =
    totalSpending.score +
    dailyFrequency.score +
    highSingle.score +
    noSpend.score;

  const fqScore = Math.max(0, Math.min(100, rawFq));

  const components: FqScoreComponents = {
    totalSpendingScore: totalSpending.score,
    dailyFrequencyScore: dailyFrequency.score,
    highSingleSpendingScore: highSingle.score,
    noSpendDaysScore: noSpend.score,
  };

  return {
    status: 'ready',
    fqScore,
    components,
    stats,
  };
}

