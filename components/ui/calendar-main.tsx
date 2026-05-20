/**
 * Calendar Main Component
 * 
 * Monthly calendar with swipeable day cells.
 * Header and weekdays are fixed, only day cells scroll.
 */

import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWeekStart } from '@/hooks/use-week-start';
import { formatCustomMonth } from '@/utils/custom-month';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Fixed heights from design
const STATUS_BAR_HEIGHT = 44;
const TOP_NAV_HEIGHT = 56;
const AMOUNT_SECTION_HEIGHT = 128;
const DAY_HEADER_HEIGHT = 40;
const TAB_BAR_BASE_HEIGHT = 64;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CALENDAR_CENTER_PAGE_INDEX = 3;
const CALENDAR_CENTER_SCROLL_X = SCREEN_WIDTH * CALENDAR_CENTER_PAGE_INDEX;
const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);
/** Figma: 선택/포커스 원형 32×32 */
const DAY_CIRCLE_SIZE = 32;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;

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
  /** 부모가 flex로 할당한 높이. 있으면 이 값으로 셀 높이를 계산해 FAB 등과 겹치지 않게 함 */
  containerHeight?: number;
}

/**
 * Get days in month
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Get first day of week (0 = Sunday)
 */
function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Generate calendar grid for a month (custom month start day support)
 */
function generateMonthGrid(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number = 1
): { date: string; day: number; isCurrentMonth: boolean }[] {
  const grid: { date: string; day: number; isCurrentMonth: boolean }[] = [];
  
  if (monthStartDay === 1) {
    // Standard month (1일 시작) - 기존 로직 유지
    const daysInMonth = getDaysInMonth(year, month);
    const jsFirstDay = getFirstDayOfWeek(year, month);
    const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);
    
    // Previous month days
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
    
    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      grid.push({
        date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        day,
        isCurrentMonth: true,
      });
    }
    
    // Next month days (fill to complete weeks)
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
    // Custom month start day (e.g., 20일 시작)
    // 현재 월의 monthStartDay부터 다음 월의 (monthStartDay - 1)까지 표시
    
    // 시작일: 현재 년/월의 monthStartDay
    const startDate = new Date(year, month - 1, monthStartDay);
    
    // 종료일: 다음 월의 (monthStartDay - 1)
    let endYear = year;
    let endMonth = month + 1;
    if (endMonth > 12) {
      endMonth = 1;
      endYear += 1;
    }
    const endDate = new Date(endYear, endMonth - 1, monthStartDay - 1);
    
    // 첫 날의 요일 가져오기
    const jsFirstDay = startDate.getDay();
    const firstDayOfWeek = adjustFirstDayOfWeek(jsFirstDay);
    
    // 이전 날짜들로 빈 칸 채우기
    let currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() - firstDayOfWeek);
    
    // 주의 시작부터 시작일 전까지 (이전 월 날짜들)
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
    
    // 현재 커스텀 월의 날짜들 (startDate ~ endDate)
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
    
    // 남은 칸을 다음 날짜들로 채우기
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

/**
 * Format number with commas
 */
function formatCurrency(num: number): string {
  return num.toLocaleString('ko-KR');
}

/**
 * Calendar Main Component
 */
export function CalendarMain({
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
  const [currentYear, setCurrentYear] = useState(initialYear ?? initialDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(initialMonth ?? (initialDate.getMonth() + 1));

  /** Parent props take effect immediately (timeline → home) before internal state effect runs. */
  const displayYear = initialYear ?? currentYear;
  const displayMonth = initialMonth ?? currentMonth;

  // Animation lock to prevent rapid swipes
  const [isAnimating, setIsAnimating] = useState(false);

  const TITLE_HEIGHT = 48;

  // Calculate dynamic day cell height (containerHeight 있으면 그걸 쓰고, 없으면 화면 높이 기준)
  const dayCellHeight = useMemo(() => {
    const grid = generateMonthGrid(displayYear, displayMonth, adjustFirstDayOfWeek, monthStartDay);
    const weeks = Math.ceil(grid.length / 7);
    if (weeks <= 0) return 40;

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
  }, [displayYear, displayMonth, insets.bottom, adjustFirstDayOfWeek, monthStartDay, containerHeight, showTitle]);

  // Generate grids for 7 months (prev3, prev2, prev1, current, next1, next2, next3)
  const monthGrids = useMemo(() => {
    const grids = [];
    
    for (let offset = -3; offset <= 3; offset++) {
      let targetMonth = displayMonth + offset;
      let targetYear = displayYear;
      
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
  }, [displayYear, displayMonth, adjustFirstDayOfWeek, monthStartDay]);
  
  // ScrollView ref and initialization
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(CALENDAR_CENTER_SCROLL_X);
  const [scrollInitialized, setScrollInitialized] = useState(false);
  
  // Initialize scroll to center (index 3)
  useEffect(() => {
    if (!scrollInitialized && scrollViewRef.current) {
      setTimeout(() => {
        scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
        scrollViewRef.current?.scrollTo({
          x: CALENDAR_CENTER_SCROLL_X,
          animated: false,
        });
        setScrollInitialized(true);
      }, 100);
    }
  }, [scrollInitialized]);
  
  // Sync external year/month before paint; keep horizontal offset at center.
  useLayoutEffect(() => {
    if (initialYear === undefined && initialMonth === undefined) {
      return;
    }

    const yearChanged = initialYear !== undefined && initialYear !== currentYear;
    const monthChanged = initialMonth !== undefined && initialMonth !== currentMonth;

    if (!yearChanged && !monthChanged) {
      return;
    }

    if (yearChanged) {
      setCurrentYear(initialYear);
    }
    if (monthChanged) {
      setCurrentMonth(initialMonth);
    }

    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    scrollViewRef.current?.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });
  }, [initialYear, initialMonth, currentYear, currentMonth]);

  /** dayData 객체 참조만 바뀌고 내용이 같을 때 스크롤 복구를 막기 위한 시그니처 */
  const dayDataSignature = useMemo(() => {
    const keys = Object.keys(dayData);
    if (keys.length === 0) return '';
    keys.sort();
    let sig = `${keys.length}:`;
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      const d = dayData[k];
      sig += `${k}|${d?.totalExpense ?? 0}|${d?.totalIncome ?? 0};`;
    }
    return sig;
  }, [dayData]);

  // refresh() 후 dayData 갱신 시 ScrollView가 x=0으로 리셋되는 경우 복구
  useLayoutEffect(() => {
    if (!scrollInitialized || !scrollViewRef.current) {
      return;
    }

    const offset = scrollOffsetRef.current;
    if (offset >= SCREEN_WIDTH * 2) {
      return;
    }

    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    scrollViewRef.current.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });
  }, [dayDataSignature, scrollInitialized]);
  
  // Handle scroll end
  const handleScrollEnd = (event: any) => {
    // Prevent action if animation is in progress
    if (isAnimating) return;
    
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    const centerPage = CALENDAR_CENTER_PAGE_INDEX;
    
    // Calculate how many months to move (positive = forward, negative = backward)
    const monthsToMove = page - centerPage;
    
    // If no change (still at center), do nothing
    if (monthsToMove === 0) return;
    
    // Lock and animate
    setIsAnimating(true);
    
    // Configure fast layout animation
    LayoutAnimation.configureNext({
      duration: 50,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
    
    // Reset scroll to center
    scrollOffsetRef.current = CALENDAR_CENTER_SCROLL_X;
    scrollViewRef.current?.scrollTo({
      x: CALENDAR_CENTER_SCROLL_X,
      animated: false,
    });

    // Change month by the calculated amount (LayoutAnimation will handle the transition)
    changeMonthBy(monthsToMove);
    
    // Release lock after animation completes
    setTimeout(() => setIsAnimating(false), 100);
  };

  // Change month by a specific amount (positive = forward, negative = backward)
  const changeMonthBy = useCallback((amount: number) => {
    // Use Date object for safe month/year calculation
    const currentDate = new Date(currentYear, currentMonth - 1); // month is 0-indexed in Date
    currentDate.setMonth(currentDate.getMonth() + amount);
    
    const newYear = currentDate.getFullYear();
    const newMonth = currentDate.getMonth() + 1; // Convert back to 1-indexed
    
    // Update both states atomically
    setCurrentYear(newYear);
    setCurrentMonth(newMonth);
    
    // Notify callback
    if (onMonthChange) {
      onMonthChange(newYear, newMonth);
    }
  }, [currentYear, currentMonth, onMonthChange]);

  // Handle day press
  const handleDayPress = (dateString: string) => {
    
    if (onDayPress) {
      onDayPress(dateString);
    }
  };

  // Render day cell
  const renderDay = (item: { date: string; day: number; isCurrentMonth: boolean }, index: number, gridType: 'prev' | 'current' | 'next') => {
    const isSelected = item.date === selectedDate;
    const data = dayData[item.date];
    
    // For prev/next grids, consider their days as "current month" for styling
    const isCurrentMonthForStyling = gridType === 'current' ? item.isCurrentMonth : true;

    const dayTextColor = !isCurrentMonthForStyling
      ? colors.textAssistive
      : isSelected
      ? colors.staticWhite
      : colors.textNeutral;

    const dayTextStyle = !isCurrentMonthForStyling
      ? styles.dayTextOtherMonth
      : isSelected
      ? styles.dayTextSelected
      : styles.dayTextDefault;

    return (
      <View
        key={`${gridType}-${item.date}-${index}`}
        style={[styles.dayContainer, { width: DAY_CELL_WIDTH, height: dayCellHeight }]}
      >
        <Pressable
          {...(Platform.OS === 'android'
            ? {
                onPressIn: () => {
                  handleDayPress(item.date);
                },
              }
            : {
                onPress: () => {
                  handleDayPress(item.date);
                },
              })}
          style={({ pressed }) => [
            styles.dayPressable,
            Platform.OS === 'ios' && pressed && !isSelected && styles.dayCirclePressed,
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
        >
          <View
            style={[
              styles.dayCircle,
              { backgroundColor: isSelected ? colors.primary : 'transparent' },
            ]}
          >
            <Text style={[dayTextStyle, { color: dayTextColor }]}>
              {item.day}
            </Text>
          </View>
        </Pressable>

        {/* Income/Expense */}
        {data && isCurrentMonthForStyling && (
          <View style={styles.costContainer}>
            {data.totalExpense !== undefined && data.totalExpense > 0 && (
              <Text
                style={styles.expenseText}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.5}
              >
                {formatCurrency(data.totalExpense)}
              </Text>
            )}
            {data.totalIncome !== undefined && data.totalIncome > 0 && (
              <Text
                style={styles.incomeText}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.5}
              >
                {formatCurrency(data.totalIncome)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { width: SCREEN_WIDTH }, style]}>
      {/* Year/Month Title (Fixed) - Optional */}
      {showTitle && (
        <View style={styles.titleContainer}>
          <Text style={[styles.titleText, { color: colors.text }]}>
            {formatCustomMonth(displayYear, displayMonth, monthStartDay)}
          </Text>
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
        onScroll={(event) => {
          scrollOffsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollBeginDrag={() => {}}
        scrollEnabled={!isAnimating}
        style={styles.scrollView}
      >
        {/* Render 7 months: [prev3, prev2, prev1, current, next1, next2, next3] */}
        {monthGrids.map((monthData, index) => {
          const gridType = index === 3 ? 'current' : (index < 3 ? 'prev' : 'next');
          return (
            <View key={`month-slot-${index}`} style={[styles.monthPage, { width: SCREEN_WIDTH }]}>
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
  monthPage: {
    // width: dynamic (SCREEN_WIDTH)
  },
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayContainer: {
    alignItems: 'center',
    paddingTop: 8,
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
  costContainer: {
    marginTop: 4,
    gap: 0,
    alignItems: 'center',
  },
  expenseText: {
    ...Typography.tiny.r.regular,
    color: '#ef2a2a',
  },
  incomeText: {
    ...Typography.tiny.r.regular,
    color: '#058943',
  },
});

