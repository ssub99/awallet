/**
 * Cached month grids + 3-slot pager helpers for horizontal calendar components.
 */

export type CalendarGridCell = { date: string; day: number; isCurrentMonth: boolean };

export type CalendarMonthSlot = {
  year: number;
  month: number;
  grid: CalendarGridCell[];
};

const GRID_CACHE_MAX = 48;

export function monthGridCacheKey(year: number, month: number, monthStartDay: number): string {
  return `${year}-${month}-${monthStartDay}`;
}

export function addCalendarMonths(
  year: number,
  month: number,
  offset: number,
): { year: number; month: number } {
  const date = new Date(year, month - 1);
  date.setMonth(date.getMonth() + offset);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function monthDistance(y1: number, m1: number, y2: number, m2: number): number {
  return (y2 - y1) * 12 + (m2 - m1);
}

export function formatCalendarMonthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getCachedMonthGrid(
  cache: Map<string, CalendarGridCell[]>,
  year: number,
  month: number,
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarGridCell[] {
  const key = monthGridCacheKey(year, month, monthStartDay);
  let grid = cache.get(key);
  if (!grid) {
    grid = buildGrid(year, month);
    cache.set(key, grid);
    if (cache.size > GRID_CACHE_MAX) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
  }
  return grid;
}

export function createMonthSlot(
  cache: Map<string, CalendarGridCell[]>,
  year: number,
  month: number,
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarMonthSlot {
  return {
    year,
    month,
    grid: getCachedMonthGrid(cache, year, month, monthStartDay, buildGrid),
  };
}

export function buildThreeMonthWindow(
  cache: Map<string, CalendarGridCell[]>,
  centerYear: number,
  centerMonth: number,
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarMonthSlot[] {
  return [-1, 0, 1].map((offset) => {
    const { year, month } = addCalendarMonths(centerYear, centerMonth, offset);
    return createMonthSlot(cache, year, month, monthStartDay, buildGrid);
  });
}

export function shiftSlotsForward(
  cache: Map<string, CalendarGridCell[]>,
  slots: CalendarMonthSlot[],
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarMonthSlot[] {
  const next = addCalendarMonths(slots[2].year, slots[2].month, 1);
  return [
    slots[1],
    slots[2],
    createMonthSlot(cache, next.year, next.month, monthStartDay, buildGrid),
  ];
}

export function shiftSlotsBackward(
  cache: Map<string, CalendarGridCell[]>,
  slots: CalendarMonthSlot[],
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarMonthSlot[] {
  const prev = addCalendarMonths(slots[0].year, slots[0].month, -1);
  return [
    createMonthSlot(cache, prev.year, prev.month, monthStartDay, buildGrid),
    slots[0],
    slots[1],
  ];
}

/** 2달 이상 차이나면 3슬롯 전체 재구성 */
const HEAVY_JUMP_MONTH_DISTANCE = 2;

export function resolveSlotsForTargetMonth(
  cache: Map<string, CalendarGridCell[]>,
  slots: CalendarMonthSlot[],
  centerPageIndex: number,
  targetYear: number,
  targetMonth: number,
  monthStartDay: number,
  buildGrid: (year: number, month: number) => CalendarGridCell[],
): CalendarMonthSlot[] {
  const center = slots[centerPageIndex];
  const dist = monthDistance(center.year, center.month, targetYear, targetMonth);

  if (dist === 0) {
    return slots;
  }

  if (Math.abs(dist) >= HEAVY_JUMP_MONTH_DISTANCE) {
    return buildThreeMonthWindow(cache, targetYear, targetMonth, monthStartDay, buildGrid);
  }

  if (dist === 1 && slots[centerPageIndex + 1]?.year === targetYear && slots[centerPageIndex + 1]?.month === targetMonth) {
    return shiftSlotsForward(cache, slots, monthStartDay, buildGrid);
  }

  if (dist === -1 && slots[centerPageIndex - 1]?.year === targetYear && slots[centerPageIndex - 1]?.month === targetMonth) {
    return shiftSlotsBackward(cache, slots, monthStartDay, buildGrid);
  }

  return buildThreeMonthWindow(cache, targetYear, targetMonth, monthStartDay, buildGrid);
}
