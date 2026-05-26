/**
 * Calendar Main Component
 *
 * Monthly calendar with swipeable day cells (prev / current / next).
 */

import type { CalendarDayGridType } from '@/components/ui/calendar-day-cell';
import {
  CalendarMainMonthPage,
  clearMonthDayDataSignatureCache,
  EMPTY_DAY_DATA,
  resolveCalendarPagerDayDataSignatures,
  type DayData,
} from '@/components/ui/calendar-main-month-page';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWeekStart } from '@/hooks/use-week-start';
import { formatCustomMonth } from '@/utils/custom-month';
import {
  addCalendarMonths,
  buildThreeMonthWindow,
  type CalendarGridCell,
  type CalendarMonthSlot,
  monthDistance,
  resolveSlotsForTargetMonth,
  shiftSlotsBackward,
  shiftSlotsForward,
} from '@/utils/calendar-month-grid-cache';
import {
  beginMonthTransitionTiming,
  completeMonthTransitionTiming,
  formatCalendarMonthLabel,
  logCalendarDayCellDebugSummary,
  logCalendarMonthDebug,
  markMonthTransitionTiming,
  measureCalendarMonthDebug,
  resetCalendarDayCellDebugCounters,
  type MonthTransitionTimingSession,
} from '@/utils/calendar-month-debug';
import {
  memo,
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_BAR_HEIGHT = 44;
const TOP_NAV_HEIGHT = 56;
const AMOUNT_SECTION_HEIGHT = 128;
const DAY_HEADER_HEIGHT = 40;
const TAB_BAR_BASE_HEIGHT = 64;

const SCREEN_WIDTH = Dimensions.get('window').width;
/** prev(0) · current(1) · next(2) */
const CALENDAR_CENTER_PAGE_INDEX = 1;
const CALENDAR_CENTER_SCROLL_X = SCREEN_WIDTH * CALENDAR_CENTER_PAGE_INDEX;

const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);
const CALENDAR_MAIN_DEBUG_TAG = '[CalendarMain]';
/** scrollToCenter·리센터 후 지연 momentum 무시 (Android 이중 커밋 방지) */
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 280;
/** 리센터·렌더 완료까지 새 스와이프 차단 (monthSlots render 대기) */
const SWIPE_RECENTER_MAX_MS = 720;
/** 중앙에서 시작한 드래그만 스와이프로 인정 */
const DRAG_START_CENTER_TOLERANCE_RATIO = 0.15;
/** onScroll이 보고한 중앙 허용치 */
const SCROLL_CENTER_TOLERANCE = Math.max(2, SCREEN_WIDTH * 0.02);
/** 중앙 미도달 시 rAF 재시도 상한 */
const SWIPE_RELEASE_MAX_PASSES = 16;

function isOffsetAtCenterPage(offsetX: number): boolean {
  return Math.abs(offsetX - CALENDAR_CENTER_SCROLL_X) <= SCROLL_CENTER_TOLERANCE;
}

export type { DayData } from '@/components/ui/calendar-main-month-page';

export type CalendarExternalView = {
  year: number;
  month: number;
};

export interface CalendarMainProps {
  selectedDate?: string;
  onDayPress?: (dateString: string) => void;
  dayData?: Record<string, DayData>;
  onMonthChange?: (year: number, month: number) => void;
  showTitle?: boolean;
  style?: ViewStyle;
  /** 마운트 시 1회만 사용 (스와이프 후 부모 state와 동기화하지 않음) */
  initialYear?: number;
  initialMonth?: number;
  /** 상단 피커·타임라인 등 외부 월 이동 — 스와이프와 분리해 불필요한 리렌더 방지 */
  externalView?: CalendarExternalView | null;
  onExternalViewApplied?: () => void;
  monthStartDay?: number;
  containerHeight?: number;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function generateMonthGrid(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number = 1,
): CalendarGridCell[] {
  const grid: CalendarGridCell[] = [];

  if (monthStartDay === 1) {
    const daysInMonth = getDaysInMonth(year, month);
    const jsFirstDay = getFirstDayOfWeek(year, month);
    const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);

    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      grid.push({
        date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        isCurrentMonth: false,
      });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      grid.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        isCurrentMonth: true,
      });
    }

    const remainingCells = grid.length % 7 === 0 ? 0 : 7 - (grid.length % 7);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    for (let day = 1; day <= remainingCells; day++) {
      grid.push({
        date: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        isCurrentMonth: false,
      });
    }
  } else {
    const startDate = new Date(year, month - 1, monthStartDay);

    let endYear = year;
    let endMonth = month + 1;
    if (endMonth > 12) {
      endMonth = 1;
      endYear += 1;
    }
    const endDate = new Date(endYear, endMonth - 1, monthStartDay - 1);

    const jsFirstDay = startDate.getDay();
    const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);

    let currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() - firstDayOfWeek);

    for (let i = 0; i < firstDayOfWeek; i++) {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      const d = currentDate.getDate();
      grid.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: false,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      const d = currentDate.getDate();
      grid.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: true,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const remainingCells = grid.length % 7 === 0 ? 0 : 7 - (grid.length % 7);
    for (let i = 0; i < remainingCells; i++) {
      const y = currentDate.getFullYear();
      const m = currentDate.getMonth() + 1;
      const d = currentDate.getDate();
      grid.push({
        date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: false,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return grid;
}

function countWeeksInGrid(grid: CalendarGridCell[]): number {
  return Math.max(1, Math.ceil(grid.length / 7));
}

function CalendarMainInner({
  selectedDate,
  onDayPress,
  dayData = {},
  onMonthChange,
  showTitle = true,
  style,
  initialYear,
  initialMonth,
  externalView,
  onExternalViewApplied,
  monthStartDay = 1,
  containerHeight,
}: CalendarMainProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const insets = useSafeAreaInsets();
  const { weekdays, adjustFirstDayOfWeek } = useWeekStart();

  const gridCacheRef = useRef(new Map<string, CalendarGridCell[]>());
  const weekLayoutSignature = weekdays.join(',');
  const monthLayoutKeyRef = useRef(`${monthStartDay}|${weekLayoutSignature}`);

  const buildGrid = useCallback(
    (year: number, month: number) =>
      generateMonthGrid(year, month, adjustFirstDayOfWeek, monthStartDay),
    [adjustFirstDayOfWeek, monthStartDay],
  );

  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const bootYear = initialYear ?? initialDate.getFullYear();
  const bootMonth = initialMonth ?? initialDate.getMonth() + 1;

  const [currentYear, setCurrentYear] = useState(bootYear);
  const [currentMonth, setCurrentMonth] = useState(bootMonth);

  const displayYear = currentYear;
  const displayMonth = currentMonth;

  const [monthSlots, setMonthSlots] = useState<CalendarMonthSlot[]>(() =>
    buildThreeMonthWindow(
      gridCacheRef.current,
      bootYear,
      bootMonth,
      monthStartDay,
      buildGrid,
    ),
  );

  const centerYearMonthRef = useRef({ year: bootYear, month: bootMonth });

  /** 스와이프 중복 방지 — state 없이 ref만 (unlock 시 리렌더 방지) */
  const scrollLockedRef = useRef(false);
  const suppressMomentumUntilRef = useRef(0);
  const swipeCooldownUntilRef = useRef(0);
  /** onScrollBeginDrag 이후에만 momentum 커밋 (programmatic bounce 차단) */
  const activeUserDragRef = useRef(false);
  /** 한 제스처당 월 변경 1회 */
  const dragGestureCommittedRef = useRef(false);
  /** 커밋 후 scroll offset 중앙 정착 전 — spurious onScrollBeginDrag·이중 momentum 차단 */
  const pendingSwipeRecenterRef = useRef(false);
  const swipeReleaseGenRef = useRef(0);
  const swipeReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 주 수 변경 시 스와이프 잠금 동안 이전 주 수로 셀 높이 고정 */
  const frozenHeightWeeksRef = useRef<number | null>(null);
  const [heightEpoch, setHeightEpoch] = useState(0);

  const TITLE_HEIGHT = 48;

  const centerSlot = monthSlots[CALENDAR_CENTER_PAGE_INDEX];
  const centerWeekCount = centerSlot ? countWeeksInGrid(centerSlot.grid) : 5;
  const centerWeekCountRef = useRef(centerWeekCount);

  useEffect(() => {
    centerWeekCountRef.current = centerWeekCount;
  }, [centerWeekCount]);

  const weeksForDayCellHeight = frozenHeightWeeksRef.current ?? centerWeekCount;

  const dayCellHeight = useMemo(() => {
    const weeks = weeksForDayCellHeight;

    if (containerHeight != null && containerHeight > 0) {
      const forGrid = containerHeight - (showTitle ? TITLE_HEIGHT : 0) - DAY_HEADER_HEIGHT;
      return Math.max(32, Math.floor(forGrid / weeks));
    }

    const screenHeight = Dimensions.get('window').height;
    const fixedHeight =
      STATUS_BAR_HEIGHT +
      TOP_NAV_HEIGHT +
      AMOUNT_SECTION_HEIGHT +
      TITLE_HEIGHT +
      DAY_HEADER_HEIGHT +
      TAB_BAR_BASE_HEIGHT +
      insets.bottom;
    const remainingHeight = screenHeight - fixedHeight;
    return Math.floor(remainingHeight / weeks);
  }, [weeksForDayCellHeight, insets.bottom, containerHeight, showTitle, heightEpoch]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
  const [scrollInitialized, setScrollInitialized] = useState(false);
  const calendarDebugSeqRef = useRef(0);
  const monthTransitionTimingRef = useRef<MonthTransitionTimingSession | null>(null);

  const scrollToCenter = useCallback((extendSuppress = true) => {
    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    if (extendSuppress) {
      suppressMomentumUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_SUPPRESS_MS;
    }
    scrollViewRef.current?.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });
    if (Platform.OS === 'android' && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({
        x: CALENDAR_CENTER_SCROLL_X,
        animated: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!scrollInitialized && scrollViewRef.current) {
      const timer = setTimeout(() => {
        scrollToCenter();
        setScrollInitialized(true);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [scrollInitialized, scrollToCenter]);

  /** Heavy: 월 시작일·주 시작 요일 변경 */
  useEffect(() => {
    const layoutKey = `${monthStartDay}|${weekLayoutSignature}`;
    if (monthLayoutKeyRef.current === layoutKey) {
      return;
    }
    monthLayoutKeyRef.current = layoutKey;
    gridCacheRef.current.clear();
    clearMonthDayDataSignatureCache();

    const { year, month } = centerYearMonthRef.current;
    setMonthSlots(
      buildThreeMonthWindow(gridCacheRef.current, year, month, monthStartDay, buildGrid),
    );
    scrollToCenter();
  }, [buildGrid, monthStartDay, scrollToCenter, weekLayoutSignature]);

  useEffect(() => {
    logCalendarMonthDebug(CALENDAR_MAIN_DEBUG_TAG, calendarDebugSeqRef, 'mount', {
      boot: formatCalendarMonthLabel(bootYear, bootMonth),
      monthStartDay,
    });
  }, [bootMonth, bootYear, monthStartDay]);

  useEffect(() => {
    return () => {
      if (swipeReleaseTimerRef.current) {
        clearTimeout(swipeReleaseTimerRef.current);
        swipeReleaseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    logCalendarMonthDebug(CALENDAR_MAIN_DEBUG_TAG, calendarDebugSeqRef, 'displayMonth updated', {
      display: formatCalendarMonthLabel(displayYear, displayMonth),
    });
    if (__DEV__ && monthTransitionTimingRef.current) {
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'displayMonth render',
      );
    }
  }, [displayMonth, displayYear]);

  useEffect(() => {
    logCalendarMonthDebug(CALENDAR_MAIN_DEBUG_TAG, calendarDebugSeqRef, 'monthSlots updated', {
      slots: monthSlots.map((s) => formatCalendarMonthLabel(s.year, s.month)),
    });
    if (__DEV__ && monthTransitionTimingRef.current) {
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'monthSlots render',
      );
      logCalendarDayCellDebugSummary(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        'monthSlots cell summary',
        { slots: monthSlots.map((s) => formatCalendarMonthLabel(s.year, s.month)) },
      );
    }
  }, [monthSlots]);

  /** 외부 년/월(피커·타임라인·오늘) — 스와이프는 내부 state만 갱신 */
  useLayoutEffect(() => {
    if (!externalView) {
      return;
    }

    const targetYear = externalView.year;
    const targetMonth = externalView.month;
    const toLabel = formatCalendarMonthLabel(targetYear, targetMonth);
    const fromLabel = formatCalendarMonthLabel(
      centerYearMonthRef.current.year,
      centerYearMonthRef.current.month,
    );

    beginMonthTransitionTiming(monthTransitionTimingRef, 'external', toLabel);
    logCalendarMonthDebug(CALENDAR_MAIN_DEBUG_TAG, calendarDebugSeqRef, 'externalView sync', {
      from: fromLabel,
      to: toLabel,
    });

    const { year: cy, month: cm } = centerYearMonthRef.current;
    const dist = monthDistance(cy, cm, targetYear, targetMonth);

    if (dist === 0) {
      if (currentYear !== targetYear) {
        setCurrentYear(targetYear);
      }
      if (currentMonth !== targetMonth) {
        setCurrentMonth(targetMonth);
      }
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'externalView noop (same month)',
        { dist },
      );
      completeMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'complete (external noop)',
      );
      onExternalViewApplied?.();
      return;
    }

    markMonthTransitionTiming(
      CALENDAR_MAIN_DEBUG_TAG,
      calendarDebugSeqRef,
      monthTransitionTimingRef,
      'resolveSlotsForTargetMonth',
      { dist },
    );

    setMonthSlots((prev) =>
      resolveSlotsForTargetMonth(
        gridCacheRef.current,
        prev,
        CALENDAR_CENTER_PAGE_INDEX,
        targetYear,
        targetMonth,
        monthStartDay,
        buildGrid,
      ),
    );

    centerYearMonthRef.current = { year: targetYear, month: targetMonth };
    setCurrentYear(targetYear);
    setCurrentMonth(targetMonth);
    markMonthTransitionTiming(
      CALENDAR_MAIN_DEBUG_TAG,
      calendarDebugSeqRef,
      monthTransitionTimingRef,
      'scrollToCenter sync',
    );
    scrollToCenter();
    completeMonthTransitionTiming(
      CALENDAR_MAIN_DEBUG_TAG,
      calendarDebugSeqRef,
      monthTransitionTimingRef,
      'complete (external)',
    );
    onExternalViewApplied?.();
  }, [
    buildGrid,
    currentMonth,
    currentYear,
    externalView,
    monthStartDay,
    onExternalViewApplied,
    scrollToCenter,
  ]);

  const dayDataSignature = useMemo(() => {
    const keys = Object.keys(dayData);
    if (keys.length === 0) {
      return '';
    }
    keys.sort();
    let sig = `${keys.length}:`;
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      const d = dayData[k];
      sig += `${k}|${d?.totalExpense ?? 0}|${d?.totalIncome ?? 0};`;
    }
    return sig;
  }, [dayData]);

  useLayoutEffect(() => {
    if (!scrollInitialized || !scrollViewRef.current) {
      return;
    }

    const offset = scrollOffsetRef.current;
    if (Math.abs(offset - CALENDAR_CENTER_SCROLL_X) < SCREEN_WIDTH * 0.35) {
      return;
    }

    scrollToCenter();
  }, [dayDataSignature, scrollInitialized, scrollToCenter]);

  const applyCenterMonth = useCallback(
    (year: number, month: number, options?: { syncDisplayState?: boolean }) => {
      centerYearMonthRef.current = { year, month };
      const syncDisplayState = options?.syncDisplayState ?? true;
      if (syncDisplayState) {
        setCurrentYear(year);
        setCurrentMonth(month);
      }
      onMonthChange?.(year, month);
    },
    [onMonthChange],
  );

  const syncDisplayMonthFromCenterRef = useCallback(() => {
    const { year, month } = centerYearMonthRef.current;
    setCurrentYear(year);
    setCurrentMonth(month);
  }, []);

  const finalizeSwipeUnlock = useCallback(
    (toLabel: string, weekCountChanged: boolean) => {
      scrollLockedRef.current = false;
      pendingSwipeRecenterRef.current = false;
      if (weekCountChanged) {
        frozenHeightWeeksRef.current = null;
        requestAnimationFrame(() => {
          startTransition(() => {
            setHeightEpoch((epoch) => epoch + 1);
          });
        });
      }
      if (showTitle) {
        syncDisplayMonthFromCenterRef();
      }
      logCalendarMonthDebug(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        'scrollLockedRef -> false (swipe lock release)',
        { to: toLabel, weekCountChanged },
      );
      completeMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'complete (ui unlocked)',
      );
    },
    [showTitle, syncDisplayMonthFromCenterRef],
  );

  const scheduleReleaseSwipeLock = useCallback(
    (toLabel: string, weekCountChanged: boolean) => {
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
          finalizeSwipeUnlock(toLabel, weekCountChanged);
          return;
        }

        if (pass >= SWIPE_RELEASE_MAX_PASSES) {
          scrollToCenter(false);
          finalizeSwipeUnlock(toLabel, weekCountChanged);
          return;
        }

        scrollToCenter(false);
        requestAnimationFrame(() => tryRelease(pass + 1));
      };

      swipeReleaseTimerRef.current = setTimeout(() => {
        if (swipeReleaseGenRef.current !== generation) {
          return;
        }
        scrollToCenter(false);
        finalizeSwipeUnlock(toLabel, weekCountChanged);
      }, SWIPE_RECENTER_MAX_MS);

      tryRelease(0);
    },
    [finalizeSwipeUnlock, scrollToCenter],
  );

  const handleScrollBeginDrag = useCallback(() => {
    if (pendingSwipeRecenterRef.current) {
      return;
    }
    if (Date.now() < suppressMomentumUntilRef.current) {
      return;
    }
    if (Date.now() < swipeCooldownUntilRef.current) {
      return;
    }
    if (scrollLockedRef.current) {
      return;
    }

    const offsetX = scrollOffsetRef.current;
    const centerTolerance = SCREEN_WIDTH * DRAG_START_CENTER_TOLERANCE_RATIO;
    if (Math.abs(offsetX - CALENDAR_CENTER_SCROLL_X) > centerTolerance) {
      return;
    }

    activeUserDragRef.current = true;
    dragGestureCommittedRef.current = false;
  }, []);

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      scrollOffsetRef.current = offsetX;

      if (Date.now() < suppressMomentumUntilRef.current) {
        logCalendarMonthDebug(
          CALENDAR_MAIN_DEBUG_TAG,
          calendarDebugSeqRef,
          'swipe ignored (suppressMomentum)',
          {},
        );
        return;
      }

      if (scrollLockedRef.current) {
        logCalendarMonthDebug(
          CALENDAR_MAIN_DEBUG_TAG,
          calendarDebugSeqRef,
          'swipe ignored (scrollLockedRef)',
          {},
        );
        return;
      }

      if (pendingSwipeRecenterRef.current) {
        logCalendarMonthDebug(
          CALENDAR_MAIN_DEBUG_TAG,
          calendarDebugSeqRef,
          'swipe ignored (pendingRecenter)',
          {},
        );
        const recenterPage = Math.round(offsetX / SCREEN_WIDTH);
        if (recenterPage !== CALENDAR_CENTER_PAGE_INDEX) {
          scrollToCenter();
        }
        return;
      }

      if (Date.now() < swipeCooldownUntilRef.current) {
        const cooldownPage = Math.round(offsetX / SCREEN_WIDTH);
        if (cooldownPage !== CALENDAR_CENTER_PAGE_INDEX) {
          scrollToCenter();
        }
        activeUserDragRef.current = false;
        return;
      }

      if (!activeUserDragRef.current) {
        const pageWithoutDrag = Math.round(offsetX / SCREEN_WIDTH);
        if (pageWithoutDrag !== CALENDAR_CENTER_PAGE_INDEX) {
          scrollToCenter();
        }
        return;
      }

      const page = Math.round(offsetX / SCREEN_WIDTH);
      const monthsToMove = page - CALENDAR_CENTER_PAGE_INDEX;

      if (monthsToMove === 0) {
        activeUserDragRef.current = false;
        if (page !== CALENDAR_CENTER_PAGE_INDEX) {
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
      pendingSwipeRecenterRef.current = true;
      suppressMomentumUntilRef.current = Date.now() + SWIPE_RECENTER_MAX_MS;
      swipeCooldownUntilRef.current = Date.now() + SWIPE_RECENTER_MAX_MS;

      const fromLabel = formatCalendarMonthLabel(
        centerYearMonthRef.current.year,
        centerYearMonthRef.current.month,
      );
      const { year: nextYear, month: nextMonth } = addCalendarMonths(
        centerYearMonthRef.current.year,
        centerYearMonthRef.current.month,
        monthsToMove,
      );
      const toLabel = formatCalendarMonthLabel(nextYear, nextMonth);
      const nextGrid = buildGrid(nextYear, nextMonth);
      const nextWeekCount = countWeeksInGrid(nextGrid);

      resetCalendarDayCellDebugCounters();
      beginMonthTransitionTiming(monthTransitionTimingRef, 'swipe', toLabel);
      logCalendarMonthDebug(CALENDAR_MAIN_DEBUG_TAG, calendarDebugSeqRef, 'swipe commit', {
        from: fromLabel,
        to: toLabel,
        monthsToMove,
        offsetX,
        page,
      });
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'swipe commit',
        { nextWeekCount, prevWeekCount: centerWeekCountRef.current },
      );

      const prevWeekCount = centerWeekCountRef.current;
      const weekCountChanged = nextWeekCount !== prevWeekCount;
      scrollLockedRef.current = true;
      if (weekCountChanged) {
        frozenHeightWeeksRef.current = prevWeekCount;
        centerWeekCountRef.current = nextWeekCount;
      }

      setMonthSlots((prev) =>
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, prev, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, prev, monthStartDay, buildGrid),
      );
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'shift monthSlots',
      );

      applyCenterMonth(nextYear, nextMonth, { syncDisplayState: false });
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'applyCenterMonth (swipe, display deferred)',
      );
      scrollToCenter();
      markMonthTransitionTiming(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        monthTransitionTimingRef,
        'scrollToCenter sync',
      );

      scheduleReleaseSwipeLock(toLabel, weekCountChanged);
    },
    [
      applyCenterMonth,
      buildGrid,
      monthStartDay,
      scheduleReleaseSwipeLock,
      scrollToCenter,
    ],
  );

  const monthDayDataSignatures = useMemo(
    () =>
      measureCalendarMonthDebug(
        CALENDAR_MAIN_DEBUG_TAG,
        calendarDebugSeqRef,
        'resolveMonthDayDataSignatures',
        () => {
          const { signatures, cacheHits, cacheMisses } = resolveCalendarPagerDayDataSignatures(
            monthSlots,
            CALENDAR_CENTER_PAGE_INDEX,
            dayData,
            dayDataSignature,
          );
          if (__DEV__) {
            logCalendarMonthDebug(
              CALENDAR_MAIN_DEBUG_TAG,
              calendarDebugSeqRef,
              'monthDayDataSignatures cache',
              { cacheHits, cacheMisses },
            );
          }
          return signatures;
        },
        { slotCount: monthSlots.length },
      ),
    [dayData, dayDataSignature, monthSlots],
  );

  const handleDayPress = useCallback(
    (dateString: string) => {
      onDayPress?.(dateString);
    },
    [onDayPress],
  );

  const cellColorProps = useMemo(
    () => ({
      textAssistive: colors.textAssistive,
      textNeutral: colors.textNeutral,
      staticWhite: colors.staticWhite,
      primary: colors.primary,
    }),
    [colors.primary, colors.staticWhite, colors.textAssistive, colors.textNeutral],
  );

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }, style]}>
      {showTitle && (
        <View style={styles.titleContainer}>
          <Text style={[styles.titleText, { color: colors.text }]}>
            {formatCustomMonth(displayYear, displayMonth, monthStartDay)}
          </Text>
        </View>
      )}

      <View style={[styles.weekdayHeader, { backgroundColor: colors.fillStrong }]}>
        {weekdays.map((day) => (
          <View key={day} style={[styles.weekdayCell, { width: DAY_CELL_WIDTH }]}>
            <Text style={[styles.weekdayText, { color: colors.textNeutral }]}>{day}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        onScrollBeginDrag={handleScrollBeginDrag}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEnabled
        style={styles.scrollView}
      >
        {monthSlots.map((monthData, index) => {
          const isCenterPage = index === CALENDAR_CENTER_PAGE_INDEX;
          const gridType: CalendarDayGridType = isCenterPage
            ? 'current'
            : index < CALENDAR_CENTER_PAGE_INDEX
              ? 'prev'
              : 'next';
          return (
            <View
              key={gridType}
              style={[styles.monthPage, { width: SCREEN_WIDTH }]}
            >
              <CalendarMainMonthPage
                monthData={monthData}
                gridType={gridType}
                dayCellHeight={dayCellHeight}
                selectedDate={selectedDate}
                dayData={isCenterPage ? dayData : EMPTY_DAY_DATA}
                monthDayDataSignature={monthDayDataSignatures[index] ?? ''}
                onDayPress={handleDayPress}
                cellColorProps={cellColorProps}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function calendarMainPropsAreEqual(prev: CalendarMainProps, next: CalendarMainProps): boolean {
  const prevExternal = prev.externalView;
  const nextExternal = next.externalView;
  const externalEqual =
    prevExternal === nextExternal ||
    (prevExternal != null &&
      nextExternal != null &&
      prevExternal.year === nextExternal.year &&
      prevExternal.month === nextExternal.month);

  return (
    prev.selectedDate === next.selectedDate &&
    prev.initialYear === next.initialYear &&
    prev.initialMonth === next.initialMonth &&
    externalEqual &&
    prev.monthStartDay === next.monthStartDay &&
    prev.containerHeight === next.containerHeight &&
    prev.showTitle === next.showTitle &&
    prev.dayData === next.dayData &&
    prev.onDayPress === next.onDayPress &&
    prev.onMonthChange === next.onMonthChange &&
    prev.onExternalViewApplied === next.onExternalViewApplied &&
    prev.style === next.style
  );
}

export const CalendarMain = memo(CalendarMainInner, calendarMainPropsAreEqual);

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    overflow: 'hidden',
  },
  titleContainer: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(144, 146, 158, 0.16)',
  },
  titleText: {
    ...Typography.headline4.r.bold,
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
  scrollView: {
    width: '100%',
  },
  monthPage: {},
});
