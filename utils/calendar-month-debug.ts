/**
 * __DEV__ 전용 — 홈/바텀시트 캘린더 월 전환 타이밍 검증 로그
 */

import { Platform } from 'react-native';

export type CalendarMonthTransitionKind = 'swipe' | 'external' | 'arrow-prev' | 'arrow-next';

export type MonthTransitionTimingSession = {
  id: number;
  kind: CalendarMonthTransitionKind;
  toLabel: string;
  startedAt: number;
  lastMarkAt: number;
};

let monthTransitionTimingSeq = 0;

export function formatCalendarMonthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function logCalendarMonthDebug(
  tag: string,
  seqRef: { current: number },
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }
  seqRef.current += 1;
  console.log(`${tag} #${seqRef.current} ${event}`, {
    platform: Platform.OS,
    ts: Date.now(),
    ...payload,
  });
}

export function beginMonthTransitionTiming(
  timingRef: { current: MonthTransitionTimingSession | null },
  kind: MonthTransitionTimingSession['kind'],
  toLabel: string,
): void {
  if (!__DEV__) {
    return;
  }
  const now = Date.now();
  monthTransitionTimingSeq += 1;
  timingRef.current = {
    id: monthTransitionTimingSeq,
    kind,
    toLabel,
    startedAt: now,
    lastMarkAt: now,
  };
}

export function markMonthTransitionTiming(
  tag: string,
  seqRef: { current: number },
  timingRef: { current: MonthTransitionTimingSession | null },
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }
  const session = timingRef.current;
  if (!session) {
    return;
  }
  const now = Date.now();
  const elapsedMs = now - session.startedAt;
  const deltaMs = now - session.lastMarkAt;
  session.lastMarkAt = now;
  logCalendarMonthDebug(tag, seqRef, `transition timing · ${phase}`, {
    transitionId: session.id,
    kind: session.kind,
    to: session.toLabel,
    elapsedMs,
    deltaMs,
    ...extra,
  });
}

export function completeMonthTransitionTiming(
  tag: string,
  seqRef: { current: number },
  timingRef: { current: MonthTransitionTimingSession | null },
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }
  const session = timingRef.current;
  if (!session) {
    return;
  }
  const totalMs = Date.now() - session.startedAt;
  logCalendarMonthDebug(tag, seqRef, `transition timing · ${phase}`, {
    transitionId: session.id,
    kind: session.kind,
    to: session.toLabel,
    totalMs,
    elapsedMs: totalMs,
    ...extra,
  });
  timingRef.current = null;
}

/** useMemo 등 동기 구간 측정 */
let calendarDayCellRenderCount = 0;
let calendarDayCellMemoSkipCount = 0;
let calendarMonthPageFullRenderCount = 0;
let calendarMonthPageLiteRenderCount = 0;

export function resetCalendarDayCellDebugCounters(): void {
  calendarDayCellRenderCount = 0;
  calendarDayCellMemoSkipCount = 0;
  calendarMonthPageFullRenderCount = 0;
  calendarMonthPageLiteRenderCount = 0;
}

export function recordCalendarMonthPageRender(mode: 'full' | 'lite'): void {
  if (!__DEV__) {
    return;
  }
  if (mode === 'full') {
    calendarMonthPageFullRenderCount += 1;
  } else {
    calendarMonthPageLiteRenderCount += 1;
  }
}

export function recordCalendarDayCellRender(): void {
  if (__DEV__) {
    calendarDayCellRenderCount += 1;
  }
}

export function recordCalendarDayCellMemoSkip(): void {
  if (__DEV__) {
    calendarDayCellMemoSkipCount += 1;
  }
}

export function logCalendarDayCellDebugSummary(
  tag: string,
  seqRef: { current: number },
  phase: string,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }
  logCalendarMonthDebug(tag, seqRef, phase, {
    cellRenderPasses: calendarDayCellRenderCount,
    cellMemoSkips: calendarDayCellMemoSkipCount,
    monthPageFullRenders: calendarMonthPageFullRenderCount,
    monthPageLiteRenders: calendarMonthPageLiteRenderCount,
    ...extra,
  });
  resetCalendarDayCellDebugCounters();
}

export function measureCalendarMonthDebug<T>(
  tag: string,
  seqRef: { current: number },
  label: string,
  fn: () => T,
  extra?: Record<string, unknown>,
): T {
  if (!__DEV__) {
    return fn();
  }
  const startedAt = Date.now();
  const result = fn();
  logCalendarMonthDebug(tag, seqRef, label, {
    durationMs: Date.now() - startedAt,
    ...extra,
  });
  return result;
}
