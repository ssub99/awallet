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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View, ViewStyle } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELL_WIDTH = Math.floor(SCREEN_WIDTH / 7);
const DAY_CELL_HEIGHT = 48;
const NAV_BAR_HEIGHT = 50;
const DAY_HEADER_HEIGHT = 40;
const DAY_CELLS_AREA_HEIGHT = 288; // 6주 기준 고정 (48px × 6)

export interface CalendarDaySelectProps {
  currentYear?: number;
  currentMonth?: number;
  selectedDate?: string;
  onDayPress?: (dateString: string) => void;
  onMonthChange?: (year: number, month: number) => void;
  style?: ViewStyle;
  hideNavBar?: boolean;
  monthStartDay?: number; // 월 시작일 (1-31)
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
 * Generate calendar grid for a custom month (based on monthStartDay)
 */
function generateMonthGrid(
  year: number,
  month: number,
  adjustFirstDayOfWeek: (jsDay: number) => number,
  monthStartDay: number = 1
): Array<{ date: string; day: number; isCurrentMonth: boolean }> {
  const grid: Array<{ date: string; day: number; isCurrentMonth: boolean }> = [];
  
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
  const [internalYear, setInternalYear] = useState(initialDate.getFullYear());
  const [internalMonth, setInternalMonth] = useState(initialDate.getMonth() + 1);
  
  // 변수 선언을 useEffect 앞으로 이동
  const currentYear = propYear !== undefined ? propYear : internalYear;
  const currentMonth = propMonth !== undefined ? propMonth : internalMonth;
  const [scrollInitialized, setScrollInitialized] = useState(false);
  
  // selectedDate가 변경될 때 내부 상태 업데이트
  useEffect(() => {
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      const newYear = newDate.getFullYear();
      const newMonth = newDate.getMonth() + 1;
      
      // prop으로 제어되지 않는 경우에만 내부 상태 업데이트
      if (propYear === undefined) {
        setInternalYear(newYear);
      }
      if (propMonth === undefined) {
        setInternalMonth(newMonth);
      }
      
      // 스크롤 위치도 업데이트 (선택된 날짜가 보이도록)
      if (scrollViewRef.current && scrollInitialized) {
        // 현재 년월과 선택된 년월의 차이 계산
        const currentDate = new Date(currentYear, currentMonth - 1);
        const selectedDateObj = new Date(newYear, newMonth - 1);
        const monthsDiff = (selectedDateObj.getFullYear() - currentDate.getFullYear()) * 12 + 
                          (selectedDateObj.getMonth() - currentDate.getMonth());
        
        // 중앙 인덱스(3)에서 차이만큼 이동
        const targetIndex = 3 + monthsDiff;
        const targetX = SCREEN_WIDTH * targetIndex;
        
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            x: targetX,
            animated: true,
          });
        }, 100);
      }
    }
  }, [selectedDate, propYear, propMonth, currentYear, currentMonth, scrollInitialized]);
  
  // Animation lock to prevent rapid swipes
  const [isAnimating, setIsAnimating] = useState(false);

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
  
  // Initialize scroll to center (index 3)
  useEffect(() => {
    if (!scrollInitialized && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: SCREEN_WIDTH * 3, // Center of 7 months (index 3)
          animated: false,
        });
        setScrollInitialized(true);
      }, 100);
    }
  }, [scrollInitialized]);
  
  // Handle scroll end
  const handleScrollEnd = (event: any) => {
    // Prevent action if animation is in progress
    if (isAnimating) return;
    
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / SCREEN_WIDTH);
    const centerPage = 3; // Center index of 7-month array
    
    // Calculate how many months to move (positive = forward, negative = backward)
    const monthsToMove = page - centerPage;
    
    // If no change (still at center), do nothing
    if (monthsToMove === 0) return;
    
    // Lock and animate
    setIsAnimating(true);
    
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
    scrollViewRef.current?.scrollTo({
      x: SCREEN_WIDTH * 3,
      animated: false,
    });
    
    // Change month by the calculated amount
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
    
    // Update internal state only if not controlled by props
    if (propYear === undefined) {
      setInternalYear(newYear);
    }
    if (propMonth === undefined) {
      setInternalMonth(newMonth);
    }
    
    // Notify callback
    if (onMonthChange) {
      onMonthChange(newYear, newMonth);
    }
  }, [currentYear, currentMonth, propYear, propMonth, onMonthChange]);

  // Change month with functional updates (for arrow buttons)
  const changeMonth = useCallback((direction: 'prev' | 'next') => {
    changeMonthBy(direction === 'next' ? 1 : -1);
  }, [changeMonthBy]);

  // Handle day press
  const handleDayPress = (dateString: string) => {
    if (onDayPress) {
      onDayPress(dateString);
    }
  };

  // Handle navigation arrows
  const handlePrevMonth = () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    
    LayoutAnimation.configureNext({
      duration: 50,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    changeMonth('prev');
    
    setTimeout(() => setIsAnimating(false), 100);
  };

  const handleNextMonth = () => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    
    LayoutAnimation.configureNext({
      duration: 50,
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
    });
    changeMonth('next');
    
    setTimeout(() => setIsAnimating(false), 100);
  };

  // Render day cell
  const renderDay = (item: { date: string; day: number; isCurrentMonth: boolean }, index: number, gridType: 'prev' | 'current' | 'next') => {
    const isSelected = item.date === selectedDate;
    
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
      <Pressable
        key={`${gridType}-${item.date}-${index}`}
        onPress={() => handleDayPress(item.date)}
        style={[styles.dayContainer, { width: DAY_CELL_WIDTH }]}
        accessibilityRole="button"
        accessibilityLabel={item.date}
      >
        {/* Day Number */}
        <View
          style={[
            styles.dayCircle,
            isSelected && { backgroundColor: colors.primary },
          ]}
        >
          <Text style={[dayTextStyle, { color: dayTextColor }]}>
            {item.day}
          </Text>
        </View>
      </Pressable>
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
        style={[styles.scrollView, { height: DAY_CELLS_AREA_HEIGHT }]}
      >
        {/* Render 7 months: [prev3, prev2, prev1, current, next1, next2, next3] */}
        {monthGrids.map((monthData, index) => {
          const gridType = index === 3 ? 'current' : (index < 3 ? 'prev' : 'next');
          return (
            <View key={`${monthData.year}-${monthData.month}`} style={[styles.monthPage, { width: SCREEN_WIDTH }]}>
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
    fontSize: 14,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 21,
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
    fontSize: 12,
    fontFamily: 'Pretendard',
    fontWeight: '500',
    lineHeight: 18,
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
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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

