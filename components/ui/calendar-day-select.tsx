/**
 * Calendar Day Select Component
 *
 * Date selection calendar with left/right navigation arrows.
 * Shows only dates without income/expense data.
 */

import type { CalendarDaySelectGridType } from '@/components/ui/calendar-day-select-cell';
import { CalendarDaySelectMonthPage } from '@/components/ui/calendar-day-select-month-page';
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
import { flushSync } from 'react-dom';
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
/** scrollToCenter 직후 bounce·이중 momentum 무시 (ms) — UI 잠금과 분리 */
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 280;
/** 스와이프 커밋 직후 연속 커밋 차단 (ms) — 1단계 안정화 후 80ms로 축소 */
const SWIPE_COMMIT_COOLDOWN_MS = 80;
/** 드래그 시작은 중앙 페이지 근처에서만 인정 */
const DRAG_START_CENTER_TOLERANCE_RATIO = 0.15;
/** 스와이프 잠금 해제: onScroll이 보고한 중앙 허용치 */
const SCROLL_CENTER_TOLERANCE = Math.max(2, SCREEN_WIDTH * 0.02);
/** suppress 이후 중앙 미도달 시 재시도 상한 */
const SWIPE_RELEASE_MAX_PASSES = 16;
/** 화살표 월 변경 잠금 (calendar-main과 동일) */
const ARROW_MONTH_LOCK_MS = 100;

function isOffsetAtCenterPage(offsetX: number): boolean {
  return Math.abs(offsetX - CALENDAR_CENTER_SCROLL_X) <= SCROLL_CENTER_TOLERANCE;
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
  /** 스와이프 커밋~리센터: ScrollView 대신 중앙 월만 고정 표시 (bounce 시 전월 그리드 노출 방지) */
  const [isSwipeSettling, setIsSwipeSettling] = useState(false);
  /** 정착 중 오버레이용 중앙 월만 (3달 슬롯은 해제 시 반영) */
  const [settleOverlaySlot, setSettleOverlaySlot] = useState<CalendarMonthSlot | null>(null);
  const isAnimatingRef = useRef(false);
  const isSwipeSettlingRef = useRef(false);
  /** shift 결과 — releaseSwipeTransition에서 monthSlots에 반영 */
  const pendingSwipeSlotsRef = useRef<CalendarMonthSlot[] | null>(null);
  const pendingSwipeMonthChangeRef = useRef<{ year: number; month: number } | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
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

  /** 오버레이·스크롤 잠금 해제 (momentum suppress 대기와 무관) */
  const releaseSwipeTransition = useCallback(() => {
    if (!isSwipeSettlingRef.current) {
      return;
    }

    if (swipeReleaseTimerRef.current) {
      clearTimeout(swipeReleaseTimerRef.current);
      swipeReleaseTimerRef.current = null;
    }

    swipeReleaseGenRef.current += 1;

    if (!isOffsetAtCenterPage(scrollOffsetRef.current)) {
      scrollToCenter(false);
    }

    const pendingSlots = pendingSwipeSlotsRef.current;
    const pendingMonthChange = pendingSwipeMonthChangeRef.current;
    pendingSwipeSlotsRef.current = null;
    pendingSwipeMonthChangeRef.current = null;

    flushSync(() => {
      if (pendingSlots) {
        setMonthSlots(pendingSlots);
      }
      setSettleOverlaySlot(null);
      isSwipeSettlingRef.current = false;
      isAnimatingRef.current = false;
      setIsSwipeSettling(false);
      setIsAnimating(false);
    });

    if (pendingMonthChange) {
      onMonthChange?.(pendingMonthChange.year, pendingMonthChange.month);
    }
  }, [onMonthChange, scrollToCenter]);

  /** 중앙 미도달 시에만 rAF 재시도 (suppress 500ms 대기 제거) */
  const scheduleReleaseSwipeLock = useCallback(() => {
    if (swipeReleaseTimerRef.current) {
      clearTimeout(swipeReleaseTimerRef.current);
      swipeReleaseTimerRef.current = null;
    }

    const generation = swipeReleaseGenRef.current + 1;
    swipeReleaseGenRef.current = generation;

    const tryRelease = (pass: number) => {
      if (swipeReleaseGenRef.current !== generation) {
        return;
      }

      if (isOffsetAtCenterPage(scrollOffsetRef.current)) {
        releaseSwipeTransition();
        return;
      }

      if (pass >= SWIPE_RELEASE_MAX_PASSES) {
        scrollToCenter(false);
        releaseSwipeTransition();
        return;
      }

      scrollToCenter(false);
      requestAnimationFrame(() => tryRelease(pass + 1));
    };

    tryRelease(0);
  }, [releaseSwipeTransition, scrollToCenter]);

  const applyCenterMonth = useCallback(
    (year: number, month: number) => {
      centerYearMonthRef.current = { year, month };

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
  }, [isAnimating]);

  useEffect(() => {
    isSwipeSettlingRef.current = isSwipeSettling;
  }, [isSwipeSettling]);

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
    scheduleReleaseSwipeLock();
  }, [settleOverlaySlot, scheduleReleaseSwipeLock, scrollToCenter]);

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
    (monthsToMove: number) => {
      const { year: fromYear, month: fromMonth } = centerYearMonthRef.current;
      const { year: nextYear, month: nextMonth } = addCalendarMonths(fromYear, fromMonth, monthsToMove);

      scrollToCenter();

      setMonthSlots((prev) =>
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, prev, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, prev, monthStartDay, buildGrid),
      );

      applyCenterMonth(nextYear, nextMonth);
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
    (monthsToMove: number) => {
      if (isAnimating || monthsToMove === 0) {
        return;
      }

      const { year: fromYear, month: fromMonth } = centerYearMonthRef.current;
      const { year: nextYear, month: nextMonth } = addCalendarMonths(
        fromYear,
        fromMonth,
        monthsToMove,
      );

      skipSelectedDateSyncRef.current = true;
      pendingSwipeLayoutRecenterRef.current = true;

      const nextSlots =
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, monthSlots, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, monthSlots, monthStartDay, buildGrid);
      pendingSwipeSlotsRef.current = nextSlots;
      pendingSwipeMonthChangeRef.current = { year: nextYear, month: nextMonth };

      // 1단계 경량화: 커밋 시 3달 슬롯 대신 오버레이 중앙 1달만 동기 갱신 (해제 시 슬롯 반영)
      flushSync(() => {
        isSwipeSettlingRef.current = true;
        isAnimatingRef.current = true;
        setIsSwipeSettling(true);
        setIsAnimating(true);
        setSettleOverlaySlot(nextSlots[CENTER_MONTH_PAGE_INDEX]);
        centerYearMonthRef.current = { year: nextYear, month: nextMonth };
        if (propYear === undefined) {
          setInternalYear(nextYear);
        }
        if (propMonth === undefined) {
          setInternalMonth(nextMonth);
        }
      });

      scrollToCenter();

      activeUserDragRef.current = false;
      swipeCooldownUntilRef.current = Date.now() + SWIPE_COMMIT_COOLDOWN_MS;
    },
    [buildGrid, isAnimating, monthSlots, monthStartDay, propMonth, propYear, scrollToCenter],
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
        return;
      }

      if (Date.now() < swipeCooldownUntilRef.current) {
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
        activeUserDragRef.current = false;
        scrollToCenter();
        return;
      }

      dragGestureCommittedRef.current = true;
      activeUserDragRef.current = false;
      commitSwipeMonthsToMove(monthsToMove);
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
            commitSwipeMonthsToMove(monthsToMove);
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
      commitSwipeMonthsToMove(monthsToMove);
    },
    [commitSwipeMonthsToMove, isAnimating, resolveMonthsToMoveFromOffset],
  );

  const handlePrevMonth = useCallback(() => {
    if (isAnimating) {
      return;
    }

    skipSelectedDateSyncRef.current = true;
    setIsAnimating(true);
    moveCenterMonth(-1);
    scrollToCenter();
    setTimeout(() => {
      setIsAnimating(false);
    }, ARROW_MONTH_LOCK_MS);
  }, [isAnimating, moveCenterMonth, scrollToCenter]);

  const handleNextMonth = useCallback(() => {
    if (isAnimating) {
      return;
    }

    skipSelectedDateSyncRef.current = true;
    setIsAnimating(true);
    moveCenterMonth(1);
    scrollToCenter();
    setTimeout(() => {
      setIsAnimating(false);
    }, ARROW_MONTH_LOCK_MS);
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
            if (!isSwipeSettlingRef.current) {
              return;
            }
            if (isOffsetAtCenterPage(offsetX)) {
              releaseSwipeTransition();
            } else {
              scrollToCenter(false);
            }
          }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEnabled={!isAnimating}
          overScrollMode="never"
          style={[
            styles.scrollView,
            { height: DAY_CELLS_AREA_HEIGHT },
            isSwipeSettling && styles.pagerScrollHiddenDuringSettle,
          ]}
          onLayout={() => setLayoutReady(true)}
        >
          {monthSlots.map((monthData, index) => {
            const gridType: CalendarDaySelectGridType =
              index === CENTER_MONTH_PAGE_INDEX
                ? 'current'
                : index < CENTER_MONTH_PAGE_INDEX
                  ? 'prev'
                  : 'next';

            return (
              <View
                key={`${monthData.year}-${monthData.month}-${gridType}`}
                style={[styles.monthPage, { width: SCREEN_WIDTH }]}
              >
                <CalendarDaySelectMonthPage
                  monthData={monthData}
                  gridType={gridType}
                  showSettlePlaceholder={isSwipeSettling}
                  selectedDate={selectedDate}
                  disablePastDates={disablePastDates}
                  todayLocal={todayLocal}
                  onDayPress={handleDayPress}
                  onInvalidPastDate={onInvalidPastDate}
                  cellColorProps={cellColorProps}
                />
              </View>
            );
          })}
        </ScrollView>

        {isSwipeSettling && settleOverlaySlot ? (
          <View
            style={[styles.swipeSettleOverlay, { backgroundColor: colors.staticWhite }]}
            pointerEvents="none"
          >
            <CalendarDaySelectMonthPage
              monthData={settleOverlaySlot}
              gridType="current"
              showSettlePlaceholder={false}
              selectedDate={selectedDate}
              disablePastDates={disablePastDates}
              todayLocal={todayLocal}
              onDayPress={handleDayPress}
              onInvalidPastDate={onInvalidPastDate}
              cellColorProps={cellColorProps}
            />
          </View>
        ) : null}
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
  pagerScrollHiddenDuringSettle: {
    opacity: 0,
  },
  swipeSettleOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
    height: DAY_CELLS_AREA_HEIGHT,
  },
});
