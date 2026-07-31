/**
 * 매월/할부 일자 앵커 + 말일 클램프 회귀.
 * JS Date#setMonth(1/31→3/3) 오버플로가 없어야 함.
 */

import {
  addCalendarMonths,
  calculateRecurringIterations,
  formatDateWithDayAnchor,
  getNextRecurringDate,
} from '../utils/expense-calculations';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function chainMonthly(start: string, count: number, anchorDay: number): string[] {
  const [y] = start.split('.').map(Number);
  const out: string[] = [start];
  let cur = start;
  for (let i = 0; i < count; i++) {
    const next = getNextRecurringDate(cur, '매월', i + 1, y, anchorDay);
    assert(next, `next null after ${cur}`);
    out.push(next);
    cur = next;
  }
  return out;
}

function main(): void {
  // 1/31 → 2/28 → 3/31 → 4/30 (비윤년 2025)
  const fromJan31 = chainMonthly('2025.01.31', 3, 31);
  assert(fromJan31[1] === '2025.02.28', `feb: ${fromJan31[1]}`);
  assert(fromJan31[2] === '2025.03.31', `mar: ${fromJan31[2]}`);
  assert(fromJan31[3] === '2025.04.30', `apr: ${fromJan31[3]}`);

  // 2/28 시작 → 이후도 28 (31로 올리지 않음)
  const fromFeb28 = chainMonthly('2025.02.28', 3, 28);
  assert(fromFeb28[1] === '2025.03.28', `mar28: ${fromFeb28[1]}`);
  assert(fromFeb28[2] === '2025.04.28', `apr28: ${fromFeb28[2]}`);
  assert(fromFeb28[3] === '2025.05.28', `may28: ${fromFeb28[3]}`);

  // 윤년 1/31 → 2/29
  const leap = getNextRecurringDate('2024.01.31', '매월', 1, 2024, 31);
  assert(leap === '2024.02.29', `leap feb: ${leap}`);

  // 주말 보정 후 current가 1/30이어도 앵커 31 유지
  const afterWeekend = getNextRecurringDate('2025.01.30', '매월', 1, 2025, 31);
  assert(afterWeekend === '2025.02.28', `anchor after weekend: ${afterWeekend}`);

  // 할부식: addCalendarMonths + format
  const feb = addCalendarMonths(2025, 1, 1);
  assert(formatDateWithDayAnchor(feb.year, feb.month, 31) === '2025.02.28', 'installment feb');
  const mar = addCalendarMonths(2025, 1, 2);
  assert(formatDateWithDayAnchor(mar.year, mar.month, 31) === '2025.03.31', 'installment mar');

  // iteration 수: 2025.01.31 매월 → 12
  assert(calculateRecurringIterations('2025.01.31', '매월') === 12, 'iterations jan31');
  assert(calculateRecurringIterations('2025.02.28', '매월') === 11, 'iterations feb28');

  console.log('verify-recurring-month-anchor: ok');
}

main();
