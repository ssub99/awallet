/**
 * Calendar Day Select Component
 * 
 * Date selection calendar with left/right navigation arrows.
 * Shows only dates without income/expense data.
 */

import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWeekStart } from '@/hooks/use-week-start';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
  ViewStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);
/** Figma: 선택/포커스 원형 32×32 */
const DAY_CIRCLE_SIZE = 32;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;
const DAY_CELL_HEIGHT = 48;
const NAV_BAR_HEIGHT = 50;
const DAY_HEADER_HEIGHT = 40;
const DAY_CELLS_AREA_HEIGHT = 288; // 6주 기준 고정 (48px × 6)
const CENTER_MONTH_PAGE_INDEX = 3;

const CALENDAR_DEBUG_TAG = '[CalendarDaySelect]';

type CalendarMonthChangeSource = 'swipe' | 'arrow-prev' | 'arrow-next';

function formatMonthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
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

export interface CalendarDaySelectProps {
  currentYear?: number;
  currentMonth?: number;
  selectedDate?: string;
  onDayPress?: (dateString: string) => void;
  onMonthChange?: (year: number, month: number) => void;
  style?: ViewStyle;
  hideNavBar?: boolean;
  monthStartDay?: number; // 월 시작일 (1-31)
  /**
   * When true (default), scrolling auto-centers to the selectedDate's month.
   * Set false to prevent month jump when selecting a day.
   */
  autoCenterOnSelectedDate?: boolean;
  /**
   * Disable all days before today (local time)
   */
  disablePastDates?: boolean;
  /**
   * Callback when a disabled past date is tapped
   */
  onInvalidPastDate?: () => void;
}

/**
 * Generate calendar grid for a custom month (based on monthStartDay)
 */
function generateMonthGrid(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number = 1
): { date: string; day: number; isCurrentMonth: boolean }[] {
  const grid: { date: string; day: number; isCurrentMonth: boolean }[] = [];
  
  // monthStartDay 기준으로 시작일과 종료일 계산
  // 예: monthStartDay=21이면, 10월 21일 ~ 11월 20일이 "10월"
  const startDate = new Date(year, month - 1, monthStartDay);
  const endDate = new Date(year, month, monthStartDay - 1);
  
  // 첫 날의 요일 확인
  const jsFirstDay = startDate.getDay();
  const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);
  
  // 이전 월 날짜들로 첫 주 채우기
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
  
  // 현재 커스텀 월의 날짜들
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    grid.push({
      date: `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`,
      day: currentDate.getDate(),
      isCurrentMonth: true,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // 다음 월 날짜들로 마지막 주 채우기
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

/**
 * Calendar Day Select Component
 */
export function CalendarDaySelect({
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

  // Current month state (use props if provided, otherwise use internal state)
  const getTodayLocalDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const initialDate = selectedDate ? new Date(selectedDate) : new Date();
  // Compute custom month (based on monthStartDay)
  const getCustomMonthFromDate = (date: Date, startDay: number) => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1; // 1-indexed
    const d = date.getDate();
    if (d >= startDay) {
      return { year: y, month: m };
    }
    // Move to previous month
    const prev = new Date(y, m - 2, 1); // m-2 because Date month is 0-indexed
    return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
  };

  const initialCustom = getCustomMonthFromDate(initialDate, monthStartDay);
  const [internalYear, setInternalYear] = useState(initialCustom.year);
  const [internalMonth, setInternalMonth] = useState(initialCustom.month);
  
  // 변수 선언을 useEffect 앞으로 이동
  const currentYear = propYear !== undefined ? propYear : internalYear;
  const currentMonth = propMonth !== undefined ? propMonth : internalMonth;
  const [scrollInitialized, setScrollInitialized] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  
  // selectedDate가 변경될 때 내부 상태/스크롤 업데이트 (옵션)
  useEffect(() => {
    if (!selectedDate) return;
    // 사용처에서 선택: 날짜 선택이 있어도 현재 보이는 월을 유지하려면 완전히 무시
    if (!autoCenterOnSelectedDate) return;

      const newDate = new Date(selectedDate);
    const custom = getCustomMonthFromDate(newDate, monthStartDay);
      
    // prop으로 제어되지 않는 경우에만 내부 상태 업데이트 (항상 반영)
      if (propYear === undefined) {
      setInternalYear(custom.year);
      }
      if (propMonth === undefined) {
      setInternalMonth(custom.month);
      }
      
    // 자동 중앙 정렬 옵션일 때만 스크롤 이동
    if (autoCenterOnSelectedDate && scrollViewRef.current && scrollInitialized) {
        const currentDate = new Date(currentYear, currentMonth - 1);
      const selectedDateObj = new Date(custom.year, custom.month - 1);
        const monthsDiff = (selectedDateObj.getFullYear() - currentDate.getFullYear()) * 12 + 
                          (selectedDateObj.getMonth() - currentDate.getMonth());
        const targetIndex = CENTER_MONTH_PAGE_INDEX + monthsDiff;
        const targetX = SCREEN_WIDTH * targetIndex;
        
        setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: targetX, animated: true });
        }, 100);
    }
  }, [selectedDate, propYear, propMonth, currentYear, currentMonth, scrollInitialized, autoCenterOnSelectedDate, monthStartDay]);
  
  // Animation lock to prevent rapid swipes
  const [isAnimating, setIsAnimating] = useState(false);
  /** 스와이프 후 리센터 동안만 그리드 숨김 (화살표 월 변경에는 미적용) */
  const [isSwipeRecentering, setIsSwipeRecentering] = useState(false);

  // Generate grids for 7 months (prev3, prev2, prev1, current, next1, next2, next3)
  const monthGrids = useMemo(() => {
    const grids = [];
    
    for (let offset = -3; offset <= 3; offset++) {
      let targetMonth = currentMonth + offset;
      let targetYear = currentYear;
      
      // Handle month overflow/underflow
      while (targetMonth < 1) {
        targetMonth += 12;
        targetYear -= 1;
      }
      while (targetMonth > 12) {
        targetMonth -= 12;
        targetYear += 1;
      }
      
      grids.push({
        grid: generateMonthGrid(targetYear, targetMonth, adjustFirstDayOfWeek, monthStartDay),
        year: targetYear,
        month: targetMonth,
      });
    }
    
    return grids;
  }, [currentYear, currentMonth, adjustFirstDayOfWeek, monthStartDay]);
  
  // ScrollView ref and initialization
  const scrollViewRef = useRef<ScrollView>(null);
  const calendarDebugSeqRef = useRef(0);
  /** 스와이프: 월 state·monthGrids 반영 후 중앙 scroll */
  const pendingScrollResetRef = useRef(false);
  /** scrollTo(중앙) 직후 momentum end — 월 변경 재적용 방지 */
  const isRecenteringFromSwipeRef = useRef(false);
  const recenterFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    const slots = monthGrids.map((slot, index) => ({
      index,
      label: formatMonthLabel(slot.year, slot.month),
      cellCount: slot.grid.length,
    }));
    logCalendarMonthDebug(calendarDebugSeqRef, 'monthGrids rebuilt', {
      center: slots[CENTER_MONTH_PAGE_INDEX],
      slots,
    });
  }, [monthGrids]);

  // Initialize scroll to center after layout is ready
  useEffect(() => {
    if (!layoutReady || scrollInitialized || !scrollViewRef.current) return;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({
        x: SCREEN_WIDTH * CENTER_MONTH_PAGE_INDEX,
        animated: false,
      });
      setScrollInitialized(true);
    });
  }, [layoutReady, scrollInitialized]);

  useLayoutEffect(() => {
    if (!pendingScrollResetRef.current || !scrollViewRef.current) {
      return;
    }

    const centerX = SCREEN_WIDTH * CENTER_MONTH_PAGE_INDEX;
    const centerSlot = monthGrids[CENTER_MONTH_PAGE_INDEX];

    pendingScrollResetRef.current = false;
    isRecenteringFromSwipeRef.current = true;

    if (recenterFallbackTimerRef.current) {
      clearTimeout(recenterFallbackTimerRef.current);
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'useLayoutEffect scrollTo center (after monthGrids)', {
      centerX,
      targetPage: CENTER_MONTH_PAGE_INDEX,
      centerSlotLabel: centerSlot
        ? formatMonthLabel(centerSlot.year, centerSlot.month)
        : 'unknown',
      androidDoubleScroll: Platform.OS === 'android',
    });

    scrollViewRef.current.scrollTo({ x: centerX, animated: false });
    if (Platform.OS === 'android') {
      scrollViewRef.current.scrollTo({ x: centerX, animated: false });
    }

    recenterFallbackTimerRef.current = setTimeout(() => {
      if (!isRecenteringFromSwipeRef.current) {
        return;
      }
      isRecenteringFromSwipeRef.current = false;
      setIsAnimating(false);
      setIsSwipeRecentering(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'swipe recenter fallback (no momentum end)', {
        displayMonth: formatMonthLabel(currentYear, currentMonth),
      });
    }, 200);

    return () => {
      if (recenterFallbackTimerRef.current) {
        clearTimeout(recenterFallbackTimerRef.current);
        recenterFallbackTimerRef.current = null;
      }
    };
  }, [currentYear, currentMonth, monthGrids]);

  // Handle scroll end
  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    const monthsToMove = page - CENTER_MONTH_PAGE_INDEX;

    if (isRecenteringFromSwipeRef.current) {
      if (recenterFallbackTimerRef.current) {
        clearTimeout(recenterFallbackTimerRef.current);
        recenterFallbackTimerRef.current = null;
      }
      isRecenteringFromSwipeRef.current = false;
      setIsAnimating(false);
      setIsSwipeRecentering(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'programmatic recenter scroll end (ignored)', {
        offsetX,
        page,
        monthsToMove,
        displayMonth: formatMonthLabel(currentYear, currentMonth),
      });
      return;
    }

    if (pendingScrollResetRef.current) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'swipe ignored (pending scroll reset)', {
        offsetX,
        page,
        monthsToMove,
      });
      return;
    }

    if (isAnimating) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'swipe ignored (isAnimating)', {
        offsetX,
        page,
        monthsToMove,
      });
      return;
    }

    if (monthsToMove === 0) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'swipe end (no month change)', {
        offsetX,
        page,
      });
      return;
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'swipe end -> change month', {
      offsetX,
      page,
      monthsToMove,
      from: formatMonthLabel(currentYear, currentMonth),
      swipedToSlotLabel: monthGrids[page]
        ? formatMonthLabel(monthGrids[page].year, monthGrids[page].month)
        : 'unknown',
    });

    setIsAnimating(true);
    setIsSwipeRecentering(true);
    pendingScrollResetRef.current = true;
    changeMonthBy(monthsToMove, 'swipe');
  };

  // Change month by a specific amount (positive = forward, negative = backward)
  const changeMonthBy = useCallback(
    (amount: number, source: CalendarMonthChangeSource = 'swipe') => {
      const fromLabel = formatMonthLabel(currentYear, currentMonth);
      const currentDate = new Date(currentYear, currentMonth - 1);
      currentDate.setMonth(currentDate.getMonth() + amount);

      const newYear = currentDate.getFullYear();
      const newMonth = currentDate.getMonth() + 1;
      const toLabel = formatMonthLabel(newYear, newMonth);

      logCalendarMonthDebug(calendarDebugSeqRef, 'changeMonthBy', {
        source,
        amount,
        from: fromLabel,
        to: toLabel,
      });

      if (propYear === undefined) {
        setInternalYear(newYear);
      }
      if (propMonth === undefined) {
        setInternalMonth(newMonth);
      }

      if (onMonthChange) {
        onMonthChange(newYear, newMonth);
      }
    },
    [currentYear, currentMonth, propYear, propMonth, onMonthChange],
  );

  // Change month with functional updates (for arrow buttons)
  const changeMonth = useCallback(
    (direction: 'prev' | 'next') => {
      changeMonthBy(
        direction === 'next' ? 1 : -1,
        direction === 'next' ? 'arrow-next' : 'arrow-prev',
      );
    },
    [changeMonthBy],
  );

  // Handle day press
  const handleDayPress = (dateString: string) => {
    if (onDayPress) {
      onDayPress(dateString);
    }
  };

  // Handle navigation arrows
  const handlePrevMonth = () => {
    if (isAnimating) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-prev ignored (isAnimating)', {});
      return;
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-prev press', {
      from: formatMonthLabel(currentYear, currentMonth),
    });
    setIsAnimating(true);

    LayoutAnimation.configureNext({
      duration: 50,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    changeMonth('prev');

    setTimeout(() => {
      setIsAnimating(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'isAnimating -> false (arrow-prev lock release)', {});
    }, 100);
  };

  const handleNextMonth = () => {
    if (isAnimating) {
      logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-next ignored (isAnimating)', {});
      return;
    }

    logCalendarMonthDebug(calendarDebugSeqRef, 'arrow-next press', {
      from: formatMonthLabel(currentYear, currentMonth),
    });
    setIsAnimating(true);

    LayoutAnimation.configureNext({
      duration: 50,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    changeMonth('next');

    setTimeout(() => {
      setIsAnimating(false);
      logCalendarMonthDebug(calendarDebugSeqRef, 'isAnimating -> false (arrow-next lock release)', {});
    }, 100);
  };

  // Render day cell
  const renderDay = (item: { date: string; day: number; isCurrentMonth: boolean }, index: number, gridType: 'prev' | 'current' | 'next') => {
    const isSelected = item.date === selectedDate;
    // Disable past dates if requested
    const todayLocal = getTodayLocalDate();
    const isPast = disablePastDates && item.date < todayLocal;
    
    // For prev/next grids, consider their days as "current month" for styling
    const isCurrentMonthForStyling = gridType === 'current' ? item.isCurrentMonth : true;

    const dayTextColor = isPast
      ? colors.textAssistive
      : !isCurrentMonthForStyling
      ? colors.textAssistive
      : isSelected
      ? colors.staticWhite
      : colors.textNeutral;

    const dayTextStyle = isPast
      ? styles.dayTextOtherMonth
      : !isCurrentMonthForStyling
      ? styles.dayTextOtherMonth
      : isSelected
      ? styles.dayTextSelected
      : styles.dayTextDefault;

    return (
      <View
        key={`${gridType}-${item.date}-${index}`}
        style={[styles.dayContainer, { width: DAY_CELL_WIDTH }]}
      >
        <Pressable
          onPress={() => {
            if (isPast) {
              onInvalidPastDate?.();
              return;
            }
            handleDayPress(item.date);
          }}
          style={({ pressed }) => [
            styles.dayPressable,
            Platform.OS === 'ios' && pressed && !isSelected && !isPast && styles.dayCirclePressed,
          ]}
          android_ripple={
            Platform.OS === 'android'
              ? {
                  color: isSelected ? 'rgba(255, 255, 255, 0.35)' : 'rgba(54, 100, 206, 0.2)',
                  radius: DAY_CIRCLE_RADIUS,
                  borderless: false,
                }
              : undefined
          }
          accessibilityRole="button"
          accessibilityState={{ selected: isSelected }}
          accessibilityLabel={item.date}
          disabled={isPast}
        >
          <View
            style={[
              styles.dayCircle,
              {
                backgroundColor:
                  isSelected && !isPast ? colors.primary : 'transparent',
              },
            ]}
          >
            <Text style={[dayTextStyle, { color: dayTextColor }]}>
              {item.day}
            </Text>
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }, style]}>
      {/* Navigation Bar (조건부 표시) */}
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

      {/* Day Headers (Fixed) */}
      <View style={[styles.weekdayHeader, { backgroundColor: colors.fillStrong }]}>
        {weekdays.map((day) => (
          <View key={day} style={[styles.weekdayCell, { width: DAY_CELL_WIDTH }]}>
            <Text style={[styles.weekdayText, { color: colors.textNeutral }]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      {/* Day Cells (Swipeable with 5-month ScrollView) */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={() => {}}
        scrollEnabled={!isAnimating}
        style={[
          styles.scrollView,
          { height: DAY_CELLS_AREA_HEIGHT, opacity: isSwipeRecentering ? 0 : 1 },
        ]}
        onLayout={() => setLayoutReady(true)}
      >
        {/* Render 7 months: [prev3, prev2, prev1, current, next1, next2, next3] */}
        {monthGrids.map((monthData, index) => {
          const gridType =
            index === CENTER_MONTH_PAGE_INDEX ? 'current' : index < CENTER_MONTH_PAGE_INDEX ? 'prev' : 'next';
          return (
            <View key={`month-page-${index}`} style={[styles.monthPage, { width: SCREEN_WIDTH }]}>
              <View style={styles.weeksContainer}>
                {monthData.grid.map((item, dayIndex) => renderDay(item, dayIndex, gridType))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

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
  scrollView: {
    width: '100%',
  },
  monthPage: {
    // width: dynamic (SCREEN_WIDTH)
  },
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayContainer: {
    height: DAY_CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPressable: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_RADIUS,
    overflow: 'hidden',
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCirclePressed: {
    opacity: 0.7,
  },
  dayTextSelected: {
    ...Typography.body1.l.bold,
  },
  dayTextDefault: {
    ...Typography.body1.l.bold,
  },
  dayTextOtherMonth: {
    ...Typography.body1.l.medium,
  },
});

