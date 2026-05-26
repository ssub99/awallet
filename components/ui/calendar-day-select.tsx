/**
 * Calendar Day Select Component
 *
 * Date selection calendar with left/right navigation arrows.
 * Shows only dates without income/expense data.
 */

import {
  CalendarDaySelectCell,
  type CalendarDaySelectGridType,
} from '@/components/ui/calendar-day-select-cell';
import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWeekStart } from '@/hooks/use-week-start';
import {
  addCalendarMonths,
  buildThreeMonthWindow,
  type CalendarGridCell,
  type CalendarMonthSlot,
  resolveSlotsForTargetMonth,
  shiftSlotsBackward,
  shiftSlotsForward,
} from '@/utils/calendar-month-grid-cache';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);
const DAY_CELL_HEIGHT = 48;
const NAV_BAR_HEIGHT = 50;
const DAY_HEADER_HEIGHT = 40;
const DAY_CELLS_AREA_HEIGHT = 288; // 6주 기준 고정 (48px × 6)
/** prev(0) · current(1) · next(2) */
const CENTER_MONTH_PAGE_INDEX = 1;
const CALENDAR_CENTER_SCROLL_X = SCREEN_WIDTH * CENTER_MONTH_PAGE_INDEX;
/** iOS drag-end: fling이면 momentum에서 처리 */
const IOS_DRAG_END_VELOCITY_THRESHOLD = 0.25;
/** scrollToCenter 직후 bounce·이중 momentum 무시 (ms) */
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 500;
/** 스와이프 커밋 직후 연속 momentum 차단 (ms) */
const SWIPE_COMMIT_COOLDOWN_MS = 600;
/** 드래그 시작은 중앙 페이지 근처에서만 인정 */
const DRAG_START_CENTER_TOLERANCE_RATIO = 0.15;
/** 스와이프 잠금 해제: onScroll이 보고한 중앙 허용치 */
const SCROLL_CENTER_TOLERANCE = Math.max(2, SCREEN_WIDTH * 0.02);
/** suppress 이후 중앙 미도달 시 재시도 상한 */
const SWIPE_RELEASE_MAX_PASSES = 16;
const CALENDAR_DEBUG_TAG = '[CalendarDaySelect]';

type CalendarMonthChangeSource = 'swipe' | 'arrow-prev' | 'arrow-next';

function formatMonthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function isOffsetAtCenterPage(offsetX: number): boolean {
  return Math.abs(offsetX - CALENDAR_CENTER_SCROLL_X) <= SCROLL_CENTER_TOLERANCE;
}

function logCalendarMonthDebug(
  seqRef: { current: number },
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }
  seqRef.current += 1;
  console.log(`${CALENDAR_DEBUG_TAG} #${seqRef.current} ${event}`, {
    platform: Platform.OS,
    ts: Date.now(),
    ...payload,
  });
}

function getTodayLocalDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCustomMonthFromDate(date: Date, startDay: number): { year: number; month: number } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (d >= startDay) {
    return { year: y, month: m };
  }
  const prev = new Date(y, m - 2, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

export interface CalendarDaySelectProps {
  currentYear?: number;
  currentMonth?: number;
  selectedDate?: string;
  onDayPress?: (dateString: string) => void;
  onMonthChange?: (year: number, month: number) => void;
  style?: ViewStyle;
  hideNavBar?: boolean;
  monthStartDay?: number;
  /**
   * When true (default), selectedDate changes rebuild the 3-month window to center that month.
   * Set false to prevent month jump when selecting a day.
   */
  autoCenterOnSelectedDate?: boolean;
  disablePastDates?: boolean;
  onInvalidPastDate?: () => void;
}

function generateMonthGrid(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number = 1,
): CalendarGridCell[] {
  const grid: CalendarGridCell[] = [];

  const startDate = new Date(year, month - 1, monthStartDay);
  const endDate = new Date(year, month, monthStartDay - 1);

  const jsFirstDay = startDate.getDay();
  const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);

  if (firstDayOfWeek > 0) {
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(startDate);
      prevDate.setDate(prevDate.getDate() - (i + 1));
      grid.push({
        date: `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`,
        day: prevDate.getDate(),
        isCurrentMonth: false,
      });
    }
  }

  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    grid.push({
      date: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`,
      day: currentDate.getDate(),
      isCurrentMonth: true,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const remainingCells = grid.length % 7 === 0 ? 0 : 7 - (grid.length % 7);
  if (remainingCells > 0) {
    const nextDate = new Date(endDate);
    nextDate.setDate(nextDate.getDate() + 1);
    for (let i = 0; i < remainingCells; i++) {
      grid.push({
        date: `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`,
        day: nextDate.getDate(),
        isCurrentMonth: false,
      });
      nextDate.setDate(nextDate.getDate() + 1);
    }
  }

  return grid;
}

function CalendarDaySelectInner({
  currentYear: propYear,
  currentMonth: propMonth,
  selectedDate,
  onDayPress,
  onMonthChange,
  style,
  hideNavBar = false,
  monthStartDay = 1,
  autoCenterOnSelectedDate = true,
  disablePastDates = false,
  onInvalidPastDate,
}: CalendarDaySelectProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const { weekdays, adjustFirstDayOfWeek } = useWeekStart();

  const gridCacheRef = useRef(new Map<string, CalendarGridCell[]>());
  const weekLayoutSignature = weekdays.join(',');
  const monthLayoutKeyRef = useRef(`${monthStartDay}|${weekLayoutSignature}`);

  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const initialCustom = getCustomMonthFromDate(initialDate, monthStartDay);

  const [internalYear, setInternalYear] = useState(initialCustom.year);
  const [internalMonth, setInternalMonth] = useState(initialCustom.month);

  const currentYear = propYear !== undefined ? propYear : internalYear;
  const currentMonth = propMonth !== undefined ? propMonth : internalMonth;

  const buildGrid = useCallback(
    (year: number, month: number) =>
      generateMonthGrid(year, month, adjustFirstDayOfWeek, monthStartDay),
    [adjustFirstDayOfWeek, monthStartDay],
  );

  const [monthSlots, setMonthSlots] = useState<CalendarMonthSlot[]>(() =>
    buildThreeMonthWindow(
      gridCacheRef.current,
      initialCustom.year,
      initialCustom.month,
      monthStartDay,
      buildGrid,
    ),
  );

  const centerYearMonthRef = useRef({ year: initialCustom.year, month: initialCustom.month });
  const skipSelectedDateSyncRef = useRef(false);

  const [scrollInitialized, setScrollInitialized] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [transitionVisiblePage, setTransitionVisiblePage] = useState(CENTER_MONTH_PAGE_INDEX);
  const isAnimatingRef = useRef(false);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
  const calendarDebugSeqRef = useRef(0);
  const suppressMomentumUntilRef = useRef(0);
  const swipeCooldownUntilRef = useRef(0);
  /** onScrollBeginDrag 이후에만 momentum 커밋 (programmatic bounce 차단) */
  const activeUserDragRef = useRef(false);
  /** 한 번의 손가락 제스처당 월 변경 1회 */
  const dragGestureCommittedRef = useRef(false);
  const swipeReleaseGenRef = useRef(0);
  const swipeReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** shift 직후 layout 단계에서 scrollToCenter (offset 0에 전월 그리드 노출 방지) */
  const pendingSwipeLayoutRecenterRef = useRef(false);

  const todayLocal = useMemo(() => getTodayLocalDateString(), []);

  const cellColorProps = useMemo(
    () => ({
      textAssistive: colors.textAssistive,
      textNeutral: colors.textNeutral,
      staticWhite: colors.staticWhite,
      primary: colors.primary,
    }),
    [colors.primary, colors.staticWhite, colors.textAssistive, colors.textNeutral],
  );

  const scrollToCenter = useCallback((extendSuppress = true) => {
    if (extendSuppress) {
      suppressMomentumUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_SUPPRESS_MS;
    }
    scrollViewRef.current?.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });
    if (Platform.OS === 'android' && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ x: CALENDAR_CENTER_SCROLL_X, animated: false });
    }
  }, []);

  /** placeholder 해제 = programmatic suppress 끝 + onScroll 중앙 확인 후 */
  const scheduleReleaseSwipeLock = useCallback(() => {
    if (swipeReleaseTimerRef.current) {
      clearTimeout(swipeReleaseTimerRef.current);
      swipeReleaseTimerRef.current = null;
    }

    const generation = swipeReleaseGenRef.current + 1;
    swipeReleaseGenRef.current = generation;

    const finishRelease = (reason: 'ready' | 'timeout') => {
      if (swipeReleaseGenRef.current !== generation) {
        return;
      }

      if (!isOffsetAtCenterPage(scrollOffsetRef.current)) {
        scrollToCenter(false);
      }

      // placeholder 해제·3페이지 동시 페인트 전에 compositor가 중앙 프레임을 그릴 시간 확보
      requestAnimationFrame(() => {
        if (swipeReleaseGenRef.current !== generation) {
          return;
        }
        requestAnimationFrame(() => {
          if (swipeReleaseGenRef.current !== generation) {
            return;
          }
          setIsAnimating(false);
          logCalendarMonthDebug(calendarDebugSeqRef, 'isAnimating -> false (swipe lock release)', {
            reason,
            offsetX: scrollOffsetRef.current,
            atCenter: isOffsetAtCenterPage(scrollOffsetRef.current),
            suppressDone: Date.now() >= suppressMomentumUntilRef.current,
          });
        });
      });
    };

    const tryRelease = (pass: number) => {
      if (swipeReleaseGenRef.current !== generation) {
        return;
      }

      const suppressDone = Date.now() >= suppressMomentumUntilRef.current;
      const atCenter = isOffsetAtCenterPage(scrollOffsetRef.current);

      if (!suppressDone) {
        const remaining = Math.max(16, suppressMomentumUntilRef.current - Date.now() + 16);
        swipeReleaseTimerRef.current = setTimeout(() => {
          swipeReleaseTimerRef.current = null;
          tryRelease(0);
        }, remaining);
        return;
      }

      if (atCenter) {
        finishRelease('ready');
        return;
      }

      if (pass >= SWIPE_RELEASE_MAX_PASSES) {
        scrollToCenter(false);
        finishRelease('timeout');
        return;
      }

      scrollToCenter(false);
      requestAnimationFrame(() => tryRelease(pass + 1));
    };

    tryRelease(0);
  }, [scrollToCenter]);

  const applyCenterMonth = useCallback(
    (year: number, month: number, source: CalendarMonthChangeSource) => {
      centerYearMonthRef.current = { year, month };

      logCalendarMonthDebug(calendarDebugSeqRef, 'applyCenterMonth', {
        source,
        label: formatMonthLabel(year, month),
      });

      if (propYear === undefined) {
        setInternalYear(year);
      }
      if (propMonth === undefined) {
        setInternalMonth(month);
      }
      onMonthChange?.(year, month);
    },
    [onMonthChange, propMonth, propYear],
  );

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
    if (!isAnimating) {
      setTransitionVisiblePage(CENTER_MONTH_PAGE_INDEX);
    }
  }, [isAnimating]);

  useEffect(() => {
    logCalendarMonthDebug(calendarDebugSeqRef, 'mount', {
      monthStartDay,
      autoCenterOnSelectedDate,
      selectedDate,
    });
  }, [autoCenterOnSelectedDate, monthStartDay, selectedDate]);

  useEffect(() => {
    logCalendarMonthDebug(calendarDebugSeqRef, 'displayMonth updated', {
      year: currentYear,
      month: currentMonth,
      label: formatMonthLabel(currentYear, currentMonth),
      isAnimating,
    });
  }, [currentYear, currentMonth, isAnimating]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const slots = monthSlots.map((slot, index) => ({
      index,
      label: formatMonthLabel(slot.year, slot.month),
      cellCount: slot.grid.length,
    }));
    logCalendarMonthDebug(calendarDebugSeqRef, 'monthSlots updated', {
      center: slots[CENTER_MONTH_PAGE_INDEX],
      slots,
    });
  }, [monthSlots]);

  useEffect(() => {
    const layoutKey = `${monthStartDay}|${weekLayoutSignature}`;
    if (monthLayoutKeyRef.current === layoutKey) {
      return;
    }
    monthLayoutKeyRef.current = layoutKey;
    gridCacheRef.current.clear();

    const { year, month } = centerYearMonthRef.current;
    setMonthSlots(buildThreeMonthWindow(gridCacheRef.current, year, month, monthStartDay, buildGrid));
    scrollToCenter();
  }, [buildGrid, monthStartDay, scrollToCenter, weekLayoutSignature]);

  useEffect(() => {
    if (!layoutReady || scrollInitialized || !scrollViewRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      scrollToCenter();
      setScrollInitialized(true);
    });
  }, [layoutReady, scrollInitialized, scrollToCenter]);

  useLayoutEffect(() => {
    if (!pendingSwipeLayoutRecenterRef.current) {
      return;
    }

    pendingSwipeLayoutRecenterRef.current = false;
    scrollToCenter();

    logCalendarMonthDebug(calendarDebugSeqRef, 'useLayoutEffect swipe recenter', {
      centerLabel: formatMonthLabel(
        centerYearMonthRef.current.year,
        centerYearMonthRef.current.month,
      ),
      offsetBefore: scrollOffsetRef.current,
    });

    scheduleReleaseSwipeLock();
  }, [monthSlots, scheduleReleaseSwipeLock, scrollToCenter]);

  useEffect(() => {
    if (!selectedDate || !autoCenterOnSelectedDate || !scrollInitialized) {
      return;
    }

    if (skipSelectedDateSyncRef.current) {
      skipSelectedDateSyncRef.current = false;
      return;
    }

    const custom = getCustomMonthFromDate(new Date(selectedDate), monthStartDay);
    const { year: targetYear, month: targetMonth } = custom;

    setMonthSlots((prev) =>
      resolveSlotsForTargetMonth(
        gridCacheRef.current,
        prev,
        CENTER_MONTH_PAGE_INDEX,
        targetYear,
        targetMonth,
        monthStartDay,
        buildGrid,
      ),
    );

    centerYearMonthRef.current = { year: targetYear, month: targetMonth };
    if (propYear === undefined) {
      setInternalYear(targetYear);
    }
    if (propMonth === undefined) {
      setInternalMonth(targetMonth);
    }

    requestAnimationFrame(() => {
      scrollToCenter();
    });
  }, [
    autoCenterOnSelectedDate,
    buildGrid,
    monthStartDay,
    propMonth,
    propYear,
    scrollInitialized,
    selectedDate,
    scrollToCenter,
  ]);

  const handleDayPress = useCallback(
    (dateString: string) => {
      onDayPress?.(dateString);
    },
    [onDayPress],
  );

  const moveCenterMonth = useCallback(
    (monthsToMove: number, source: CalendarMonthChangeSource) => {
      const { year: fromYear, month: fromMonth } = centerYearMonthRef.current;
      const { year: nextYear, month: nextMonth } = addCalendarMonths(fromYear, fromMonth, monthsToMove);

      logCalendarMonthDebug(calendarDebugSeqRef, 'changeMonthBy', {
        source,
        amount: monthsToMove,
        from: formatMonthLabel(fromYear, fromMonth),
        to: formatMonthLabel(nextYear, nextMonth),
      });

      scrollToCenter();

      setMonthSlots((prev) =>
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, prev, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, prev, monthStartDay, buildGrid),
      );

      applyCenterMonth(nextYear, nextMonth, source);
    },
    [applyCenterMonth, buildGrid, monthStartDay, scrollToCenter],
  );

  /** 스크롤이 멈춘 뒤 page index로 방향 판정 (calendar-main과 동일) */
  const resolveMonthsToMoveFromOffset = useCallback((offsetX: number): number => {
    const page = Math.round(offsetX / SCREEN_WIDTH);
    return page - CENTER_MONTH_PAGE_INDEX;
  }, []);

  /** calendar-main과 동일: shift → applyCenterMonth → scrollToCenter → 짧은 잠금 */
  const commitSwipeMonthsToMove = useCallback(
    (monthsToMove: number, source: 'momentum' | 'drag-end', offsetX: number) => {
      if (isAnimating || monthsToMove === 0) {
        return;
      }

      const { year: fromYear, month: fromMonth } = centerYearMonthRef.current;
      const { year: nextYear, month: nextMonth } = addCalendarMonths(
        fromYear,
        fromMonth,
        monthsToMove,
      );

      logCalendarMonthDebug(calendarDebugSeqRef, 'swipe commit', {
        source,
        offsetX,
        page: Math.round(offsetX / SCREEN_WIDTH),
        monthsToMove,
        from: formatMonthLabel(fromYear, fromMonth),
        to: formatMonthLabel(nextYear, nextMonth),
      });

      skipSelectedDateSyncRef.current = true;
      pendingSwipeLayoutRecenterRef.current = true;
      setTransitionVisiblePage(Math.round(offsetX / SCREEN_WIDTH));
      setIsAnimating(true);

      setMonthSlots((prev) =>
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, prev, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, prev, monthStartDay, buildGrid),
      );
      applyCenterMonth(nextYear, nextMonth, 'swipe');

      // calendar-main과 동일: 슬롯 커밋 직후 동기 리센터 (useLayoutEffect 전 1프레임 전월 노출 방지)
      scrollToCenter();
      scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
      setTransitionVisiblePage(CENTER_MONTH_PAGE_INDEX);

      activeUserDragRef.current = false;
      swipeCooldownUntilRef.current = Date.now() + SWIPE_COMMIT_COOLDOWN_MS;
    },
    [applyCenterMonth, buildGrid, isAnimating, monthStartDay, scrollToCenter],
  );

  const handleScrollBeginDrag = useCallback(() => {
    if (Date.now() < suppressMomentumUntilRef.current) {
      return;
    }
    if (Date.now() < swipeCooldownUntilRef.current) {
      return;
    }
    if (isAnimating) {
      return;
    }

    const offsetX = scrollOffsetRef.current;
    const centerTolerance = SCREEN_WIDTH * DRAG_START_CENTER_TOLERANCE_RATIO;
    if (Math.abs(offsetX - CALENDAR_CENTER_SCROLL_X) > centerTolerance) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'scrollBeginDrag ignored (not from center)', {
        offsetX,
        centerX: CALENDAR_CENTER_SCROLL_X,
      });
      return;
    }

    activeUserDragRef.current = true;
    dragGestureCommittedRef.current = false;
  }, [isAnimating]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      scrollOffsetRef.current = offsetX;
      const page = Math.round(offsetX / SCREEN_WIDTH);
      const monthsToMove = resolveMonthsToMoveFromOffset(offsetX);

      if (Date.now() < suppressMomentumUntilRef.current) {
        logCalendarMonthDebug(calendarDebugSeqRef, 'momentum ignored (programmatic scroll)', {
          offsetX,
          page,
          suppressRemaining: suppressMomentumUntilRef.current - Date.now(),
        });
        return;
      }

      if (Date.now() < swipeCooldownUntilRef.current) {
        logCalendarMonthDebug(calendarDebugSeqRef, 'momentum ignored (swipe cooldown)', {
          offsetX,
          page,
          cooldownRemaining: swipeCooldownUntilRef.current - Date.now(),
        });
        if (page !== CENTER_MONTH_PAGE_INDEX) {
          scrollToCenter();
        }
        activeUserDragRef.current = false;
        return;
      }

      if (isAnimating) {
        return;
      }

      if (!activeUserDragRef.current) {
        logCalendarMonthDebug(calendarDebugSeqRef, 'momentum ignored (no user drag)', {
          offsetX,
          page,
          monthsToMove,
        });
        if (page !== CENTER_MONTH_PAGE_INDEX) {
          scrollToCenter();
        }
        return;
      }

      if (monthsToMove === 0) {
        activeUserDragRef.current = false;
        if (page !== CENTER_MONTH_PAGE_INDEX) {
          scrollToCenter();
        }
        return;
      }

      if (dragGestureCommittedRef.current) {
        logCalendarMonthDebug(calendarDebugSeqRef, 'momentum ignored (gesture already committed)', {
          offsetX,
          page,
          monthsToMove,
        });
        activeUserDragRef.current = false;
        scrollToCenter();
        return;
      }

      dragGestureCommittedRef.current = true;
      activeUserDragRef.current = false;
      commitSwipeMonthsToMove(monthsToMove, 'momentum', offsetX);
    },
    [commitSwipeMonthsToMove, isAnimating, resolveMonthsToMoveFromOffset, scrollToCenter],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;

      if (Platform.OS === 'android') {
        if (Math.abs(velocityX) < IOS_DRAG_END_VELOCITY_THRESHOLD) {
          const offsetX = event.nativeEvent.contentOffset.x;
          const monthsToMove = resolveMonthsToMoveFromOffset(offsetX);
          if (
            monthsToMove !== 0 &&
            activeUserDragRef.current &&
            !dragGestureCommittedRef.current &&
            Date.now() >= swipeCooldownUntilRef.current &&
            Date.now() >= suppressMomentumUntilRef.current &&
            !isAnimating
          ) {
            dragGestureCommittedRef.current = true;
            activeUserDragRef.current = false;
            commitSwipeMonthsToMove(monthsToMove, 'drag-end', offsetX);
          }
        }
        return;
      }

      if (Math.abs(velocityX) > IOS_DRAG_END_VELOCITY_THRESHOLD) {
        return;
      }

      const offsetX = event.nativeEvent.contentOffset.x;
      const monthsToMove = resolveMonthsToMoveFromOffset(offsetX);
      if (monthsToMove === 0 || dragGestureCommittedRef.current) {
        return;
      }
      dragGestureCommittedRef.current = true;
      commitSwipeMonthsToMove(monthsToMove, 'drag-end', offsetX);
    },
    [commitSwipeMonthsToMove, isAnimating, resolveMonthsToMoveFromOffset],
  );

  const handlePrevMonth = useCallback(() => {
    if (isAnimating) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-prev ignored (isAnimating)', {});
      return;
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-prev press', {
      from: formatMonthLabel(centerYearMonthRef.current.year, centerYearMonthRef.current.month),
    });

    skipSelectedDateSyncRef.current = true;
    setIsAnimating(true);
    moveCenterMonth(-1, 'arrow-prev');
    scrollToCenter();
    setTimeout(() => {
      setIsAnimating(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'isAnimating -> false (arrow-prev lock release)', {});
    }, 100);
  }, [isAnimating, moveCenterMonth, scrollToCenter]);

  const handleNextMonth = useCallback(() => {
    if (isAnimating) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-next ignored (isAnimating)', {});
      return;
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-next press', {
      from: formatMonthLabel(centerYearMonthRef.current.year, centerYearMonthRef.current.month),
    });

    skipSelectedDateSyncRef.current = true;
    setIsAnimating(true);
    moveCenterMonth(1, 'arrow-next');
    scrollToCenter();
    setTimeout(() => {
      setIsAnimating(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'isAnimating -> false (arrow-next lock release)', {});
    }, 100);
  }, [isAnimating, moveCenterMonth, scrollToCenter]);

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }, style]}>
      {!hideNavBar && (
        <View style={styles.navBar}>
          <Pressable
            onPress={handlePrevMonth}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="이전 달"
          >
            <Icon name="arrowLeft" variant="line" size={24} color={colors.text} />
          </Pressable>

          <Text style={[styles.navTitle, { color: colors.text }]}>
            {currentYear}년 {String(currentMonth).padStart(2, '0')}월
          </Text>

          <Pressable
            onPress={handleNextMonth}
            style={styles.navButton}
            accessibilityRole="button"
            accessibilityLabel="다음 달"
          >
            <Icon name="arrowRight" variant="line" size={24} color={colors.text} />
          </Pressable>
        </View>
      )}

      <View style={[styles.weekdayHeader, { backgroundColor: colors.fillStrong }]}>
        {weekdays.map((day) => (
          <View key={day} style={[styles.weekdayCell, { width: DAY_CELL_WIDTH }]}>
            <Text style={[styles.weekdayText, { color: colors.textNeutral }]}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.pagerViewport, { backgroundColor: colors.staticWhite }]}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            scrollOffsetRef.current = offsetX;
            if (isAnimatingRef.current) {
              setTransitionVisiblePage(Math.round(offsetX / SCREEN_WIDTH));
              if (!isOffsetAtCenterPage(offsetX)) {
                scrollToCenter(false);
              }
            }
          }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEnabled={!isAnimating}
          style={[styles.scrollView, { height: DAY_CELLS_AREA_HEIGHT }]}
          onLayout={() => setLayoutReady(true)}
        >
        {monthSlots.map((monthData, index) => {
          const gridType: CalendarDaySelectGridType =
            index === CENTER_MONTH_PAGE_INDEX
              ? 'current'
              : index < CENTER_MONTH_PAGE_INDEX
                ? 'prev'
                : 'next';
          const hideSidePageDuringTransition =
            isAnimating &&
            index === transitionVisiblePage &&
            index !== CENTER_MONTH_PAGE_INDEX;

          return (
            <View
              key={`${monthData.year}-${monthData.month}-${gridType}`}
              style={[styles.monthPage, { width: SCREEN_WIDTH }]}
            >
              {hideSidePageDuringTransition ? (
                <View style={styles.monthPageTransitionPlaceholder} />
              ) : (
                <View style={styles.weeksContainer}>
                  {monthData.grid.map((item, dayIndex) => (
                    <CalendarDaySelectCell
                      key={`${gridType}-${item.date}-${dayIndex}`}
                      date={item.date}
                      day={item.day}
                      isCurrentMonth={item.isCurrentMonth}
                      gridType={gridType}
                      selectedDate={selectedDate}
                      disablePastDates={disablePastDates}
                      todayLocal={todayLocal}
                      onDayPress={handleDayPress}
                      onInvalidPastDate={onInvalidPastDate}
                      {...cellColorProps}
                    />
                  ))}
                </View>
              )}
            </View>
          );
        })}
        </ScrollView>
      </View>
    </View>
  );
}

export const CalendarDaySelect = memo(CalendarDaySelectInner);

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  navBar: {
    height: NAV_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'white',
  },
  navButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navTitle: {
    ...Typography.body2.r.bold,
  },
  weekdayHeader: {
    flexDirection: 'row',
    height: DAY_HEADER_HEIGHT,
    alignItems: 'center',
  },
  weekdayCell: {
    height: DAY_HEADER_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  weekdayText: {
    ...Typography.detail.r.medium,
  },
  pagerViewport: {
    height: DAY_CELLS_AREA_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  scrollView: {
    width: '100%',
  },
  monthPage: {
    // width: SCREEN_WIDTH
  },
  /** 전환 중 잘못 보이는 page — 셀 미렌더(전월·옆달 전체 볼드 플래시 방지), 페이저 구조 유지 */
  monthPageTransitionPlaceholder: {
    height: DAY_CELLS_AREA_HEIGHT,
    width: '100%',
  },
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
