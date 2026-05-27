/**
 * Calendar Main Component
 *
 * Monthly calendar with swipeable day cells (prev / current / next).
 */

import type { CalendarDayGridType } from '@/components/ui/calendar-day-cell';
import {
  buildMonthDayDataSignature,
  CalendarMainMonthPage,
  clearMonthDayDataSignatureCache,
  EMPTY_DAY_DATA,
  resolveCalendarPagerDayDataSignatures,
  type DayData,
} from '@/components/ui/calendar-main-month-page';
import { colors, typography, type ColorPalette } from '@/constants/theme';
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
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
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
/** scrollToCenter·리센터 후 지연 momentum 무시 (Android 이중 커밋 방지) */
const PROGRAMMATIC_SCROLL_SUPPRESS_MS = 280;
/** 중앙에서 시작한 드래그만 스와이프로 인정 */
const DRAG_START_CENTER_TOLERANCE_RATIO = 0.15;
/** onScroll이 보고한 중앙 허용치 */
const SCROLL_CENTER_TOLERANCE = Math.max(2, SCREEN_WIDTH * 0.02);
/** monthSlots 반영 직후 spurious momentum만 차단 (activeUserDrag 없을 때) */
const SWIPE_POST_RELEASE_GUARD_MS = Platform.select({
  android: 120,
  default: 400,
}) as number;
/** beginDrag 재진입 최소 간격 */
const SWIPE_COMMIT_COOLDOWN_MS = 80;
/** swipe commit 간 최소 간격 — 잔여 momentum·이중 scrollEnd 연속 커밋 방지 */
const SWIPE_MIN_COMMIT_INTERVAL_MS = Platform.select({
  android: 220,
  default: 80,
}) as number;
const IOS_DRAG_END_VELOCITY_THRESHOLD = 0.25;

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
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
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
  const isSwipeSettlingRef = useRef(false);
  const [isSwipeSettling, setIsSwipeSettling] = useState(false);
  /** scrollLockedRef와 동기 — 해제 전 사용자 스크롤로 off-center·beginDrag 실패 방지 */
  const [isPagerScrollLocked, setIsPagerScrollLocked] = useState(false);
  const [settleOverlaySlot, setSettleOverlaySlot] = useState<CalendarMonthSlot | null>(null);
  const pendingSwipeSlotsRef = useRef<CalendarMonthSlot[] | null>(null);
  /** scrollToCenter 중 onScrollBeginDrag 오인 방지 */
  const programmaticScrollRef = useRef(false);
  /** release 후 pager layout까지 spurious momentum 차단 */
  const postReleaseGuardUntilRef = useRef(0);
  /** unlock 이후에 시작한 사용자 드래그만 커밋 */
  const lastPagerUnlockAtRef = useRef(0);
  const userDragBeginAtRef = useRef(0);
  const lastSwipeCommitAtRef = useRef(0);

  const TITLE_HEIGHT = 48;

  const centerSlot = monthSlots[CALENDAR_CENTER_PAGE_INDEX];
  const centerWeekCount = centerSlot ? countWeeksInGrid(centerSlot.grid) : 5;
  const centerWeekCountRef = useRef(centerWeekCount);

  useEffect(() => {
    centerWeekCountRef.current = centerWeekCount;
  }, [centerWeekCount]);

  /** 정착 오버레이 중에는 목표 월 주 수로 높이 계산 (데이터·높이 동시 맞춤) */
  const weeksForDayCellHeight = useMemo(() => {
    if (settleOverlaySlot) {
      return countWeeksInGrid(settleOverlaySlot.grid);
    }
    return centerWeekCount;
  }, [settleOverlaySlot, centerWeekCount]);

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
  }, [weeksForDayCellHeight, insets.bottom, containerHeight, showTitle]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
  const [scrollInitialized, setScrollInitialized] = useState(false);

  const scrollToCenter = useCallback((extendSuppress = true) => {
    programmaticScrollRef.current = true;
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
    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
      });
    });
  }, []);

  const applyPagerUnlockAfterSwipe = useCallback(() => {
    activeUserDragRef.current = false;
    /** unlock 직후 잔여 momentum·dragEnd 재커밋 차단 — beginDrag에서만 false */
    dragGestureCommittedRef.current = true;
    postReleaseGuardUntilRef.current = Date.now() + SWIPE_POST_RELEASE_GUARD_MS;
    scrollToCenter(false);
    scrollLockedRef.current = false;
    setIsPagerScrollLocked(false);
    lastPagerUnlockAtRef.current = Date.now();
  }, [scrollToCenter]);

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

  /** unlock 직후 Android pager가 page 1·2에 남는 경우 즉시 중앙 복귀 */
  useLayoutEffect(() => {
    if (isPagerScrollLocked) {
      return;
    }
    if (!isOffsetAtCenterPage(scrollOffsetRef.current)) {
      scrollToCenter(false);
    }
  }, [isPagerScrollLocked, scrollToCenter]);

  /** 외부 년/월(피커·타임라인·오늘) — 스와이프는 내부 state만 갱신 */
  useLayoutEffect(() => {
    if (!externalView) {
      return;
    }

    const targetYear = externalView.year;
    const targetMonth = externalView.month;

    const { year: cy, month: cm } = centerYearMonthRef.current;
    const dist = monthDistance(cy, cm, targetYear, targetMonth);

    if (dist === 0) {
      if (currentYear !== targetYear) {
        setCurrentYear(targetYear);
      }
      if (currentMonth !== targetMonth) {
        setCurrentMonth(targetMonth);
      }
      onExternalViewApplied?.();
      return;
    }

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
    scrollToCenter();
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

  useEffect(() => {
    isSwipeSettlingRef.current = isSwipeSettling;
  }, [isSwipeSettling]);

  const settleOverlayDayDataSignature = useMemo(() => {
    if (!settleOverlaySlot) {
      return '';
    }
    return buildMonthDayDataSignature(settleOverlaySlot.grid, dayData);
  }, [settleOverlaySlot, dayData]);

  const settlePlaceholderHeight = dayCellHeight * weeksForDayCellHeight;

  const releaseSwipeTransition = useCallback(() => {
    if (!isSwipeSettlingRef.current) {
      return;
    }

    if (!isOffsetAtCenterPage(scrollOffsetRef.current)) {
      scrollToCenter(false);
    }

    const pendingSlots = pendingSwipeSlotsRef.current;
    pendingSwipeSlotsRef.current = null;

    flushSync(() => {
      if (pendingSlots) {
        setMonthSlots(pendingSlots);
      }
      setSettleOverlaySlot(null);
      isSwipeSettlingRef.current = false;
      setIsSwipeSettling(false);
    });

    applyPagerUnlockAfterSwipe();

    if (showTitle) {
      syncDisplayMonthFromCenterRef();
    }
  }, [applyPagerUnlockAfterSwipe, scrollToCenter, showTitle, syncDisplayMonthFromCenterRef]);

  const commitSwipeMonthsToMove = useCallback(
    (monthsToMove: number) => {
      if (scrollLockedRef.current || monthsToMove === 0) {
        return;
      }

      const { year: nextYear, month: nextMonth } = addCalendarMonths(
        centerYearMonthRef.current.year,
        centerYearMonthRef.current.month,
        monthsToMove,
      );
      const nextGrid = buildGrid(nextYear, nextMonth);
      const nextWeekCount = countWeeksInGrid(nextGrid);

      scrollLockedRef.current = true;
      setIsPagerScrollLocked(true);
      centerWeekCountRef.current = nextWeekCount;

      const nextSlots =
        monthsToMove > 0
          ? shiftSlotsForward(gridCacheRef.current, monthSlots, monthStartDay, buildGrid)
          : shiftSlotsBackward(gridCacheRef.current, monthSlots, monthStartDay, buildGrid);
      pendingSwipeSlotsRef.current = nextSlots;

      flushSync(() => {
        isSwipeSettlingRef.current = true;
        setIsSwipeSettling(true);
        setSettleOverlaySlot(nextSlots[CALENDAR_CENTER_PAGE_INDEX]);
        centerYearMonthRef.current = { year: nextYear, month: nextMonth };
      });

      applyCenterMonth(nextYear, nextMonth, { syncDisplayState: false });

      suppressMomentumUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_SUPPRESS_MS;
      swipeCooldownUntilRef.current =
        Date.now() +
        Math.max(SWIPE_COMMIT_COOLDOWN_MS, SWIPE_MIN_COMMIT_INTERVAL_MS);
      lastSwipeCommitAtRef.current = Date.now();
      activeUserDragRef.current = false;
      scrollToCenter(false);
      releaseSwipeTransition();
    },
    [
      applyCenterMonth,
      buildGrid,
      monthSlots,
      monthStartDay,
      releaseSwipeTransition,
      scrollToCenter,
    ],
  );

  const tryCommitSwipeFromScrollEnd = useCallback(
    (offsetX: number) => {
      const page = Math.round(offsetX / SCREEN_WIDTH);
      const monthsToMove = page - CALENDAR_CENTER_PAGE_INDEX;

      if (
        Date.now() < suppressMomentumUntilRef.current &&
        !activeUserDragRef.current
      ) {
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        return;
      }

      if (
        Date.now() < postReleaseGuardUntilRef.current &&
        !activeUserDragRef.current
      ) {
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        return;
      }

      if (scrollLockedRef.current || isSwipeSettlingRef.current) {
        activeUserDragRef.current = false;
        return;
      }

      if (Date.now() < swipeCooldownUntilRef.current) {
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        activeUserDragRef.current = false;
        return;
      }

      if (!activeUserDragRef.current) {
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        return;
      }

      if (userDragBeginAtRef.current < lastPagerUnlockAtRef.current) {
        activeUserDragRef.current = false;
        scrollToCenter();
        return;
      }

      if (monthsToMove === 0) {
        activeUserDragRef.current = false;
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        return;
      }

      if (dragGestureCommittedRef.current) {
        activeUserDragRef.current = false;
        scrollToCenter(false);
        return;
      }

      const sinceLastCommitMs = Date.now() - lastSwipeCommitAtRef.current;
      if (
        lastSwipeCommitAtRef.current > 0 &&
        sinceLastCommitMs < SWIPE_MIN_COMMIT_INTERVAL_MS
      ) {
        activeUserDragRef.current = false;
        if (!isOffsetAtCenterPage(offsetX)) {
          scrollToCenter(false);
        }
        return;
      }

      dragGestureCommittedRef.current = true;
      activeUserDragRef.current = false;
      commitSwipeMonthsToMove(monthsToMove);
    },
    [commitSwipeMonthsToMove, scrollToCenter],
  );

  const handleScrollBeginDrag = useCallback(() => {
    if (isSwipeSettlingRef.current) {
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
      const page = Math.round(offsetX / SCREEN_WIDTH);
      const onAdjacentPage = page !== CALENDAR_CENTER_PAGE_INDEX;
      if (Platform.OS === 'android' && onAdjacentPage) {
        activeUserDragRef.current = true;
        dragGestureCommittedRef.current = false;
        userDragBeginAtRef.current = Date.now();
        return;
      }
      scrollToCenter(false);
      return;
    }

    activeUserDragRef.current = true;
    dragGestureCommittedRef.current = false;
    userDragBeginAtRef.current = Date.now();
  }, [scrollToCenter]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      scrollOffsetRef.current = offsetX;
      tryCommitSwipeFromScrollEnd(offsetX);
    },
    [tryCommitSwipeFromScrollEnd],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      const offsetX = event.nativeEvent.contentOffset.x;
      scrollOffsetRef.current = offsetX;

      if (Platform.OS === 'android') {
        if (Math.abs(velocityX) < IOS_DRAG_END_VELOCITY_THRESHOLD) {
          tryCommitSwipeFromScrollEnd(offsetX);
        }
        return;
      }

      if (Math.abs(velocityX) >= IOS_DRAG_END_VELOCITY_THRESHOLD) {
        return;
      }

      tryCommitSwipeFromScrollEnd(offsetX);
    },
    [tryCommitSwipeFromScrollEnd],
  );

  const monthDayDataSignatures = useMemo(
    () =>
      resolveCalendarPagerDayDataSignatures(
        monthSlots,
        CALENDAR_CENTER_PAGE_INDEX,
        dayData,
        dayDataSignature,
      ).signatures,
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
      textAssistive: palette.textAssistive,
      textNeutral: palette.textNeutral,
      staticWhite: palette.staticWhite,
      primary: palette.primary,
    }),
    [palette.primary, palette.staticWhite, palette.textAssistive, palette.textNeutral],
  );

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }, style]}>
      {showTitle && (
        <View style={styles.titleContainer}>
          <Text style={[styles.titleText, { color: palette.text }]}>
            {formatCustomMonth(displayYear, displayMonth, monthStartDay)}
          </Text>
        </View>
      )}

      <View style={[styles.weekdayHeader, { backgroundColor: palette.fillStrong }]}>
        {weekdays.map((day) => (
          <View key={day} style={[styles.weekdayCell, { width: DAY_CELL_WIDTH }]}>
            <Text style={[styles.weekdayText, { color: palette.textNeutral }]}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pagerViewport}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            scrollOffsetRef.current = offsetX;
            if (isSwipeSettlingRef.current) {
              if (isOffsetAtCenterPage(offsetX)) {
                releaseSwipeTransition();
              } else {
                scrollToCenter(false);
              }
              return;
            }
            if (
              !isPagerScrollLocked &&
              !scrollLockedRef.current &&
              !activeUserDragRef.current &&
              !isOffsetAtCenterPage(offsetX)
            ) {
              if (Date.now() < postReleaseGuardUntilRef.current) {
                scrollToCenter(false);
              }
            }
          }}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEnabled={!isSwipeSettling && !isPagerScrollLocked}
          overScrollMode="never"
          style={[
            styles.scrollView,
            isSwipeSettling && styles.pagerScrollHiddenDuringSettle,
          ]}
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
                  showSettlePlaceholder={isSwipeSettling}
                  settlePlaceholderHeight={settlePlaceholderHeight}
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

        {isSwipeSettling && settleOverlaySlot ? (
          <View style={styles.swipeSettleOverlay} pointerEvents="none">
            <CalendarMainMonthPage
              monthData={settleOverlaySlot}
              gridType="current"
              dayCellHeight={dayCellHeight}
              selectedDate={selectedDate}
              dayData={dayData}
              monthDayDataSignature={settleOverlayDayDataSignature}
              onDayPress={handleDayPress}
              cellColorProps={cellColorProps}
            />
          </View>
        ) : null}
      </View>
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
    ...typography.headline4.r.bold,
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
    ...typography.detail.r.medium,
  },
  pagerViewport: {
    width: '100%',
    overflow: 'hidden',
  },
  scrollView: {
    width: '100%',
  },
  monthPage: {},
  pagerScrollHiddenDuringSettle: {
    opacity: 0,
  },
  swipeSettleOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: SCREEN_WIDTH,
  },
});
