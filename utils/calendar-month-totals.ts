/**
 * calendarData 월별 합산 — 홈 financialData O(1) 조회용
 */

export type CalendarMonthTotals = {
  income: number;
  expense: number;
  balance: number;
};

export type CalendarDayTotalsRecord = {
  totalIncome?: number;
  totalExpense?: number;
};

/** YYYY-MM 키 — monthStartDay === 1 일 때만 사용 */
export function buildCalendarMonthTotalsIndex(
  calendarData: Record<string, CalendarDayTotalsRecord>,
): Map<string, { income: number; expense: number }> {
  const index = new Map<string, { income: number; expense: number }>();

  for (const [dateString, data] of Object.entries(calendarData)) {
    if (dateString.length < 7) {
      continue;
    }
    const key = dateString.slice(0, 7);
    const bucket = index.get(key) ?? { income: 0, expense: 0 };
    bucket.income += data.totalIncome ?? 0;
    bucket.expense += data.totalExpense ?? 0;
    index.set(key, bucket);
  }

  return index;
}

export function getCalendarMonthTotalsFromIndex(
  index: Map<string, { income: number; expense: number }>,
  year: number,
  month: number,
): CalendarMonthTotals {
  const key = `${year}-${String(month).padStart(2, '0')}`;
  const bucket = index.get(key);
  const income = bucket?.income ?? 0;
  const expense = bucket?.expense ?? 0;
  return { income, expense, balance: income - expense };
}
