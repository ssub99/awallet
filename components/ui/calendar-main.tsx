/**
 * Calendar Main Component
 *
 * Monthly calendar with swipeable day cells (prev / current / next).
 */

import { CalendarDayCell, type CalendarDayGridType } from '@/components/ui/calendar-day-cell';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWeekStart } from '@/hooks/use-week-start';
import { formatCustomMonth } from '@/utils/custom-month';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutAnimation,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const STATUS_BAR_HEIGHT = 44;
const TOP_NAV_HEIGHT = 56;
const AMOUNT_SECTION_HEIGHT = 128;
const DAY_HEADER_HEIGHT = 40;
const TAB_BAR_BASE_HEIGHT = 64;

const SCREEN_WIDTH = Dimensions.get('window').width;
/** prev(0) · current(1) · next(2) */
const CALENDAR_CENTER_PAGE_INDEX = 1;
const CALENDAR_CENTER_SCROLL_X = SCREEN_WIDTH * CALENDAR_CENTER_PAGE_INDEX;
/** 2달 이상 점프 시 3슬롯 전체 재구성 (피커 먼 이동 등) */
const HEAVY_JUMP_MONTH_DISTANCE = 2;

const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);

export interface DayData {
  totalIncome?: number;
  totalExpense?: number;
  records?: {
    type: 'income' | 'expense';
    amount: number;
    category: string;
    memo?: string;
    timestamp: number;
  }[];
}

export interface CalendarMainProps {
  selectedDate?: string;
  onDayPress?: (dateString: string) => void;
  dayData?: Record<string, DayData>;
  onMonthChange?: (year: number, month: number) => void;
  showTitle?: boolean;
  style?: ViewStyle;
  initialYear?: number;
  initialMonth?: number;
  monthStartDay?: number;
  containerHeight?: number;
}

type GridCell = { date: string; day: number; isCurrentMonth: boolean };

interface MonthSlot {
  year: number;
  month: number;
  grid: GridCell[];
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
): GridCell[] {
  const grid: GridCell[] = [];

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

function countWeeksInGrid(grid: GridCell[]): number {
  return Math.max(1, Math.ceil(grid.length / 7));
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + offset);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function monthDistance(y1: number, m1: number, y2: number, m2: number): number {
  return (y2 - y1) * 12 + (m2 - m1);
}

function createMonthSlot(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number,
): MonthSlot {
  return {
    year,
    month,
    grid: generateMonthGrid(year, month, adjustFirstDayOfWeek, monthStartDay),
  };
}

function buildThreeMonthWindow(
  centerYear: number,
  centerMonth: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number,
): MonthSlot[] {
  return [-1, 0, 1].map((offset) => {
    const { year, month } = addMonths(centerYear, centerMonth, offset);
    return createMonthSlot(year, month, adjustFirstDayOfWeek, monthStartDay);
  });
}

function shiftSlotsForward(
  slots: MonthSlot[],
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number,
): MonthSlot[] {
  const next = addMonths(slots[2].year, slots[2].month, 1);
  return [
    slots[1],
    slots[2],
    createMonthSlot(next.year, next.month, adjustFirstDayOfWeek, monthStartDay),
  ];
}

function shiftSlotsBackward(
  slots: MonthSlot[],
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number,
): MonthSlot[] {
  const prev = addMonths(slots[0].year, slots[0].month, -1);
  return [
    createMonthSlot(prev.year, prev.month, adjustFirstDayOfWeek, monthStartDay),
    slots[0],
    slots[1],
  ];
}

function resolveSlotsForExternalTarget(
  slots: MonthSlot[],
  targetYear: number,
  targetMonth: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number,
): MonthSlot[] {
  const center = slots[CALENDAR_CENTER_PAGE_INDEX];
  const dist = monthDistance(center.year, center.month, targetYear, targetMonth);

  if (dist === 0) {
    return slots;
  }

  if (Math.abs(dist) >= HEAVY_JUMP_MONTH_DISTANCE) {
    return buildThreeMonthWindow(targetYear, targetMonth, adjustFirstDayOfWeek, monthStartDay);
  }

  if (dist === 1 && slots[2].year === targetYear && slots[2].month === targetMonth) {
    return shiftSlotsForward(slots, adjustFirstDayOfWeek, monthStartDay);
  }

  if (dist === -1 && slots[0].year === targetYear && slots[0].month === targetMonth) {
    return shiftSlotsBackward(slots, adjustFirstDayOfWeek, monthStartDay);
  }

  return buildThreeMonthWindow(targetYear, targetMonth, adjustFirstDayOfWeek, monthStartDay);
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
  monthStartDay = 1,
  containerHeight,
}: CalendarMainProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const insets = useSafeAreaInsets();
  const { weekdays, adjustFirstDayOfWeek } = useWeekStart();

  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  const bootYear = initialYear ?? initialDate.getFullYear();
  const bootMonth = initialMonth ?? initialDate.getMonth() + 1;

  const [currentYear, setCurrentYear] = useState(bootYear);
  const [currentMonth, setCurrentMonth] = useState(bootMonth);

  const displayYear = initialYear ?? currentYear;
  const displayMonth = initialMonth ?? currentMonth;

  const [monthSlots, setMonthSlots] = useState<MonthSlot[]>(() =>
    buildThreeMonthWindow(bootYear, bootMonth, adjustFirstDayOfWeek, monthStartDay),
  );

  const centerYearMonthRef = useRef({ year: bootYear, month: bootMonth });
  const skipPropsSyncRef = useRef(false);
  const weekLayoutSignature = weekdays.join(',');
  const monthLayoutKeyRef = useRef(`${monthStartDay}|${weekLayoutSignature}`);

  const [isAnimating, setIsAnimating] = useState(false);

  const TITLE_HEIGHT = 48;

  const centerSlot = monthSlots[CALENDAR_CENTER_PAGE_INDEX];
  const centerWeekCount = centerSlot ? countWeeksInGrid(centerSlot.grid) : 5;
  const centerWeekCountRef = useRef(centerWeekCount);

  useEffect(() => {
    centerWeekCountRef.current = centerWeekCount;
  }, [centerWeekCount]);

  const dayCellHeight = useMemo(() => {
    const weeks = centerWeekCount;

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
  }, [centerWeekCount, insets.bottom, containerHeight, showTitle]);

  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
  const [scrollInitialized, setScrollInitialized] = useState(false);

  const scrollToCenter = useCallback(() => {
    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    scrollViewRef.current?.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });
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

    const { year, month } = centerYearMonthRef.current;
    const nextSlots = buildThreeMonthWindow(year, month, adjustFirstDayOfWeek, monthStartDay);
    setMonthSlots(nextSlots);
    scrollToCenter();
  }, [
    adjustFirstDayOfWeek,
    monthStartDay,
    scrollToCenter,
    weekLayoutSignature,
  ]);

  /** 외부 년/월(피커·타임라인) — light shift vs heavy rebuild */
  useLayoutEffect(() => {
    if (initialYear === undefined && initialMonth === undefined) {
      return;
    }

    const targetYear = initialYear;
    const targetMonth = initialMonth;

    if (skipPropsSyncRef.current) {
      skipPropsSyncRef.current = false;
      setCurrentYear(targetYear);
      setCurrentMonth(targetMonth);
      centerYearMonthRef.current = { year: targetYear, month: targetMonth };
      scrollToCenter();
      return;
    }

    const { year: cy, month: cm } = centerYearMonthRef.current;
    const dist = monthDistance(cy, cm, targetYear, targetMonth);

    if (dist === 0) {
      if (currentYear !== targetYear) {
        setCurrentYear(targetYear);
      }
      if (currentMonth !== targetMonth) {
        setCurrentMonth(targetMonth);
      }
      return;
    }

    setMonthSlots((prev) =>
      resolveSlotsForExternalTarget(
        prev,
        targetYear,
        targetMonth,
        adjustFirstDayOfWeek,
        monthStartDay,
      ),
    );

    centerYearMonthRef.current = { year: targetYear, month: targetMonth };
    setCurrentYear(targetYear);
    setCurrentMonth(targetMonth);
    scrollToCenter();
  }, [
    adjustFirstDayOfWeek,
    currentMonth,
    currentYear,
    initialMonth,
    initialYear,
    monthStartDay,
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
    (year: number, month: number) => {
      centerYearMonthRef.current = { year, month };
      setCurrentYear(year);
      setCurrentMonth(month);
      onMonthChange?.(year, month);
    },
    [onMonthChange],
  );

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isAnimating) {
        return;
      }

      const offsetX = event.nativeEvent.contentOffset.x;
      const page = Math.round(offsetX / SCREEN_WIDTH);
      const monthsToMove = page - CALENDAR_CENTER_PAGE_INDEX;

      if (monthsToMove === 0) {
        return;
      }

      const { year: nextYear, month: nextMonth } = addMonths(
        centerYearMonthRef.current.year,
        centerYearMonthRef.current.month,
        monthsToMove,
      );
      const nextGrid = generateMonthGrid(
        nextYear,
        nextMonth,
        adjustFirstDayOfWeek,
        monthStartDay,
      );
      const nextWeekCount = countWeeksInGrid(nextGrid);

      setIsAnimating(true);

      if (nextWeekCount !== centerWeekCountRef.current) {
        LayoutAnimation.configureNext({
          duration: 50,
          update: { type: LayoutAnimation.Types.easeInEaseOut },
          delete: {
            type: LayoutAnimation.Types.easeInEaseOut,
            property: LayoutAnimation.Properties.opacity,
          },
        });
        centerWeekCountRef.current = nextWeekCount;
      }

      skipPropsSyncRef.current = true;

      setMonthSlots((prev) =>
        monthsToMove > 0
          ? shiftSlotsForward(prev, adjustFirstDayOfWeek, monthStartDay)
          : shiftSlotsBackward(prev, adjustFirstDayOfWeek, monthStartDay),
      );

      applyCenterMonth(nextYear, nextMonth);
      scrollToCenter();

      setTimeout(() => setIsAnimating(false), 100);
    },
    [adjustFirstDayOfWeek, applyCenterMonth, isAnimating, monthStartDay, scrollToCenter],
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
        onMomentumScrollEnd={handleScrollEnd}
        scrollEnabled={!isAnimating}
        style={styles.scrollView}
      >
        {monthSlots.map((monthData, index) => {
          const gridType: CalendarDayGridType =
            index === CALENDAR_CENTER_PAGE_INDEX
              ? 'current'
              : index < CALENDAR_CENTER_PAGE_INDEX
                ? 'prev'
                : 'next';
          return (
            <View
              key={`${monthData.year}-${monthData.month}-${gridType}`}
              style={[styles.monthPage, { width: SCREEN_WIDTH }]}
            >
              <View style={styles.weeksContainer}>
                {monthData.grid.map((item, dayIndex) => (
                  <CalendarDayCell
                    key={`${gridType}-${item.date}-${dayIndex}`}
                    date={item.date}
                    day={item.day}
                    isCurrentMonth={item.isCurrentMonth}
                    gridType={gridType}
                    dayCellHeight={dayCellHeight}
                    isSelected={item.date === selectedDate}
                    dayRecord={dayData[item.date]}
                    onDayPress={handleDayPress}
                    {...cellColorProps}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function calendarMainPropsAreEqual(prev: CalendarMainProps, next: CalendarMainProps): boolean {
  return (
    prev.selectedDate === next.selectedDate &&
    prev.initialYear === next.initialYear &&
    prev.initialMonth === next.initialMonth &&
    prev.monthStartDay === next.monthStartDay &&
    prev.containerHeight === next.containerHeight &&
    prev.showTitle === next.showTitle &&
    prev.dayData === next.dayData &&
    prev.onDayPress === next.onDayPress &&
    prev.onMonthChange === next.onMonthChange &&
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
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
