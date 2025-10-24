/**
 * Home Screen
 * 
 * Main home screen with monthly calendar and financial summary.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { CalendarMain, DayData } from '@/components/ui/calendar-main';
import { Icon } from '@/components/ui/icon';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { MonthData, YearView, YearViewRef } from '@/components/ui/year-view';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { isDateInCustomMonth } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const router = useRouter();
  const [monthStartDay, setMonthStartDay] = useState(1);

  // 소비 기록 완료 후 전달된 params 받기
  const params = useLocalSearchParams<{
    targetYear?: string;
    targetMonth?: string;
    targetDay?: string;
    targetDate?: string;
    periodType?: string;
  }>();
  
  // YearView ref for scrolling
  const yearViewRef = useRef<YearViewRef>(null);
  
  // Navigation lock to prevent duplicate navigation
  const isNavigating = useRef(false);
  
  // Top Navigation state
  const [periodType, setPeriodType] = useState<'year' | 'month'>('month');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  
  // 년도 화면에서 마지막으로 본 월 추적
  const lastYearViewMonth = useRef<number | null>(null);
  
  // Calendar state - 로컬 시간 기준으로 오늘 날짜 초기화
  const getTodayLocalDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const [selectedDate, setSelectedDate] = useState<string>(getTodayLocalDate());
  
  // Shared year/month state for both TopNavigation and Calendar
  // 항상 오늘 날짜로 초기화
  const currentDate = new Date();
  const [currentYear, setCurrentYear] = useState<number>(currentDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(currentDate.getMonth() + 1); // 1-12
  
  // 앱 시작 시 저장된 설정 불러오기 및 params 처리
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // 소비 기록 완료 후 전달된 params가 있으면 해당 날짜로 이동
        if (params.targetYear && params.targetMonth && params.targetDate) {
          const targetYear = parseInt(params.targetYear);
          const targetMonth = parseInt(params.targetMonth);
          
          // 🔄 소비 기록 후에는 AsyncStorage에서 최신 데이터 다시 로드
          const storedData = await AsyncStorage.getItem('calendarData');
          if (storedData) {
            const parsedData = JSON.parse(storedData);
            // 저장된 데이터만 사용 (샘플 데이터 병합 안 함)
            setCalendarData(parsedData);
          }
          
          setCurrentYear(targetYear);
          setCurrentMonth(targetMonth);
          setSelectedDate(params.targetDate); // 입력한 날짜 강조
          setPeriodType('month'); // 월 캘린더로 표시
        } else {
          // 기존 로직: 최초 설치 여부 확인
          const isFirstLaunch = await AsyncStorage.getItem('isFirstLaunch');
          
          if (isFirstLaunch === null) {
            // 최초 설치 - 월 캘린더로 시작
            setPeriodType('month');
            await AsyncStorage.setItem('isFirstLaunch', 'false');
          } else {
            // 재진입 - 마지막 화면 타입 불러오기
            const savedViewType = await AsyncStorage.getItem('lastViewType');
            if (savedViewType === 'year' || savedViewType === 'month') {
              setPeriodType(savedViewType);
            }
          }
          
          // 날짜는 항상 오늘로 설정 (이미 useState로 초기화됨)
          const today = new Date();
          setCurrentYear(today.getFullYear());
          setCurrentMonth(today.getMonth() + 1);
          setSelectedDate(getTodayLocalDate());
        }
      } catch (error) {

      } finally {
        setIsLoadingSettings(false);
      }
    };
    
    loadSettings();
  }, [params.targetYear, params.targetMonth, params.targetDate]); // params가 변경될 때마다 실행
  
  // periodType 변경 시 저장
  useEffect(() => {
    if (!isLoadingSettings) {
      AsyncStorage.setItem('lastViewType', periodType).catch((error) => {

      });
    }
  }, [periodType, isLoadingSettings]);
  
  // Reset to today's date (and switch to month view if in year view)
  const resetToToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth() + 1);
    
    // 로컬 시간 기준으로 날짜 문자열 생성 (UTC 대신)
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const localDateString = `${year}-${month}-${day}`;
    setSelectedDate(localDateString);
    
    // 년도 캘린더에서도 월 캘린더로 전환
    if (periodType === 'year') {
      setPeriodType('month');
    }
  };
  
  // Create bottom sheet state
  const [isCreateSheetVisible, setIsCreateSheetVisible] = useState(false);
  
  // Listen for double tap on home tab
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabDoubleTap' as any, (e: any) => {
      if (e.data?.routeName === 'home') {
        resetToToday();
      }
    });
    
    return unsubscribe;
  }, [navigation]);
  
  // Listen for create tab press (only when focused)
  useEffect(() => {
    const unsubscribe = createSheetEvent.subscribe(() => {
      // Only show sheet if this screen is currently focused
      if (isFocused) {
        setIsCreateSheetVisible(true);
      }
    });
    
    return unsubscribe;
  }, [isFocused]);

  // Auto-close bottom sheet when navigating away from this screen
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup when losing focus (navigating to another screen)
        setIsCreateSheetVisible(false);
      };
    }, [])
  );

  // 년도 화면에 진입할 때와 스크롤 애니메이션 처리
  useEffect(() => {
    if (periodType === 'year') {
      // 화면 전환 후 150ms 딜레이를 두고 스크롤 애니메이션 실행
      const timer = setTimeout(() => {
        yearViewRef.current?.scrollToMonth(currentMonth, true);
      }, 150);
      
      return () => {
        // 년도 화면을 떠날 때 현재 월 저장
        lastYearViewMonth.current = currentMonth;
        clearTimeout(timer);
      };
    }
  }, [periodType, currentMonth]);
  
  const dateText = useMemo(() => {
    if (periodType === 'year') {
      return `${currentYear}`; // 년도만 표시
    }
    return `${currentYear}/${String(currentMonth).padStart(2, '0')}`; // 년도/월 표시
  }, [currentYear, currentMonth, periodType]);
  
  // Year picker options (현재 년도 기준 ±10년)
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 21 }, (_, i) => {
      const year = currentYear - 10 + i;
      return {
        label: `${year}년`,
        value: year,
      };
    });
  }, []);
  
  // Month picker options
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      label: `${i + 1}월`,
      value: i + 1,
    })),
    []
  );

  // Calendar data (빈 초기 상태 - 실제 입력 데이터만 사용)
  const initialCalendarData: Record<string, DayData> = {};
  
  // State로 관리
  const [calendarData, setCalendarData] = useState<Record<string, DayData>>(initialCalendarData);

  // AsyncStorage에서 calendarData와 monthStartDay 불러오기 (화면 포커스 시마다)
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        try {
          // Load calendar data
          const storedData = await AsyncStorage.getItem('calendarData');
          if (storedData) {
            const parsedData = JSON.parse(storedData);
            setCalendarData(parsedData);
          } else {
            setCalendarData({});
          }
          
          // Load month start day
          const monthStart = await loadMonthStartDay();
          setMonthStartDay(monthStart);

        } catch (error) {

        }
      };
      
      loadData();
    }, [])
  );

  // Calculate year data from calendar data (based on custom month start day)
  const yearData: MonthData[] = useMemo(() => {
    
    // 각 월별로 데이터 집계
    const monthlyTotals: Record<number, { income: number; expense: number }> = {};
    
    // 1-12월 초기화
    for (let m = 1; m <= 12; m++) {
      monthlyTotals[m] = { income: 0, expense: 0 };
    }
    
    // calendarData에서 커스텀 월별로 합산
    Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearStr, monthStr, dayStr] = dateString.split('-');
      const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));
      
      // Check each month to see if this date belongs to it
      for (let m = 1; m <= 12; m++) {
        if (isDateInCustomMonth(date, currentYear, m, monthStartDay)) {
          monthlyTotals[m].income += data.totalIncome || 0;
          monthlyTotals[m].expense += data.totalExpense || 0;
          
          // 샘플 로그 (처음 3개 날짜만)
          if (Object.keys(calendarData).indexOf(dateString) < 3) {

          }
          break; // Date belongs to only one month
        }
      }
    });
    
    // MonthData 배열로 변환
    const result = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        month,
        income: monthlyTotals[month].income,
        expense: monthlyTotals[month].expense,
      };
    });
    
    
    return result;
  }, [currentYear, calendarData, monthStartDay]);

  // Calculate monthly financial data from calendar data (based on custom month start day)
  const financialData = useMemo(() => {
    
    // 월 범위 계산
    const { startDate, endDate } = (() => {
      if (monthStartDay === 1) {
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1),
          endDate: new Date(currentYear, currentMonth, 0)
        };
      }
      
      const start = new Date(currentYear, currentMonth - 1, monthStartDay);
      let endYear = currentYear;
      let endMonth = currentMonth + 1;
      if (endMonth > 12) {
        endMonth = 1;
        endYear += 1;
      }
      const end = new Date(endYear, endMonth - 1, monthStartDay - 1);
      
      return { startDate: start, endDate: end };
    })();
    
    // 로컬 시간 기준으로 날짜 문자열 생성
    const formatLocalDate = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    
    let totalIncome = 0;
    let totalExpense = 0;
    let includedDates: string[] = [];
    let excludedDates: string[] = [];

    // 현재 커스텀 년월의 데이터만 필터링 및 합산
    Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearStr, monthStr, dayStr] = dateString.split('-');
      const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));

      // Check if this date belongs to current custom month
      const isIncluded = isDateInCustomMonth(date, currentYear, currentMonth, monthStartDay);
      
      if (isIncluded) {
        totalIncome += data.totalIncome || 0;
        totalExpense += data.totalExpense || 0;
        includedDates.push(dateString);
      } else {
        if (excludedDates.length < 3) {
          excludedDates.push(dateString);
        }
      }
    });


    return {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    };
  }, [currentYear, currentMonth, calendarData, monthStartDay]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
      
      {/* Top Navigation */}
      <TopNavigation
        type="main"
        title=""
        showDay
        dateText={dateText}
        periodType={periodType}
        onPeriodChange={setPeriodType}
        showDropdownArrow
        yearOptions={yearOptions}
        selectedYear={currentYear}
        onYearChange={(year) => setCurrentYear(year)}
        monthOptions={periodType === 'month' ? monthOptions : undefined}
        selectedMonth={periodType === 'month' ? currentMonth : undefined}
        onMonthChange={periodType === 'month' ? (month) => setCurrentMonth(month) : undefined}
      />

      {/* Conditional Content: Month View or Year View */}
      {periodType === 'month' ? (
        <>
          {/* Financial Summary Cards */}
          <View style={[styles.summaryContainer, { backgroundColor: colors.fill }]}>
            <View style={styles.summaryRow}>
              {/* Income Card */}
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <Text style={[styles.cardLabel, { color: colors.textNeutral }]}>
                  입금
                </Text>
                <Text 
                  style={[styles.cardAmount, { color: '#05a234' }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.5}
                >
                  + {financialData.income.toLocaleString()}원
                </Text>
              </View>

              {/* Balance Card */}
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <Text style={[styles.cardLabel, { color: colors.textNeutral }]}>
                  잔액
                </Text>
                <Text 
                  style={[styles.cardAmount, { color: colors.text }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.5}
                >
                  {financialData.balance.toLocaleString()}원
                </Text>
              </View>
            </View>

            <View style={styles.summaryRow}>
              {/* Expense Card */}
              <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
                <Text style={[styles.cardLabel, { color: colors.textNeutral }]}>
                  소비
                </Text>
                <Text 
                  style={[styles.cardAmount, { color: '#ef2a2a' }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  minimumFontScale={0.5}
                >
                  - {financialData.expense.toLocaleString()}원
                </Text>
              </View>

              {/* Challenge Card */}
              <Pressable 
                style={[styles.card, { backgroundColor: colors.staticWhite }]}
                onPress={() => {
                  // 챌린지 현황으로 이동
                  router.push({
                    pathname: '/monthly-expense-timeline',
                    params: {
                      year: currentYear.toString(),
                      month: currentMonth.toString(),
                      tab: 'challenge'
                    }
                  });
                }}
              >
                <Text style={[styles.cardLabel, { color: colors.textNeutral }]}>
                  챌린지 진행현황
                </Text>
                <View style={styles.challengeIcon}>
                  <Icon name="arrowRight" variant="solid" size={24} color={colors.textAssistive} />
                </View>
              </Pressable>
            </View>
          </View>

          {/* Calendar */}
          <CalendarMain
            selectedDate={selectedDate}
            onDayPress={(dateString) => {
              // 이미 선택된 날짜를 다시 탭하면 월 소비현황으로 이동
              if (selectedDate === dateString) {
                // 중복 네비게이션 방지
                if (isNavigating.current) {
                  return;
                }
                
                isNavigating.current = true;
                
                // 🔧 수정: 날짜 문자열이 아닌 현재 보고 있는 캘린더의 년/월 사용
                // 월 시작일이 20일이면 9월 캘린더에 10월 날짜가 표시될 수 있음

                router.push({
                  pathname: '/monthly-expense-timeline',
                  params: {
                    year: currentYear.toString(),
                    month: currentMonth.toString(),
                    selectedDate: dateString,
                  },
                });
                
                // 500ms 후 네비게이션 잠금 해제
                setTimeout(() => {
                  isNavigating.current = false;
                }, 500);
              } else {
                // 새로운 날짜 선택

                setSelectedDate(dateString);
              }
            }}
            dayData={calendarData}
            showTitle={false}
            initialYear={currentYear}
            initialMonth={currentMonth}
            monthStartDay={monthStartDay}
            onMonthChange={(year, month) => {
              // Update shared year/month state when calendar changes
              setCurrentYear(year);
              setCurrentMonth(month);
            }}
          />
        </>
      ) : (
        <>
          {/* Year View */}
          <YearView
            key={`year-${currentYear}`}
            ref={yearViewRef}
            year={currentYear}
            monthsData={yearData}
            initialMonth={lastYearViewMonth.current ?? undefined}
          />
        </>
      )}

      {/* Create Bottom Sheet */}
      <ModalBottomsheet
        visible={isCreateSheetVisible}
        title="기록/챌린지"
        onClose={() => setIsCreateSheetVisible(false)}
        closeOnBackdrop={true}
      >
        <View style={styles.optionsContainer}>
          {/* 입금 기록 */}
          <Pressable 
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={() => {

              setIsCreateSheetVisible(false);
              setTimeout(() => {
                router.push({
                  pathname: '/income-record',
                  params: { 
                    selectedDate: selectedDate,
                    calendarYear: currentYear.toString(),
                    calendarMonth: currentMonth.toString()
                  }
                });
              }, 350);
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              💰 입금 기록
            </Text>
          </Pressable>

          {/* 소비 기록 */}
          <Pressable 
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={() => {

              setIsCreateSheetVisible(false);
              setTimeout(() => {
                router.push({
                  pathname: '/expense-category',
                  params: { 
                    selectedDate: selectedDate,
                    calendarYear: currentYear.toString(),
                    calendarMonth: currentMonth.toString()
                  }
                });
              }, 350); // 바텀시트 닫는 애니메이션 후
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              💸 소비 기록
            </Text>
          </Pressable>

          {/* 챌린지 도전 */}
          <Pressable 
            style={[styles.option, { backgroundColor: colors.fill }]}
            onPress={() => {

              setIsCreateSheetVisible(false);
              setTimeout(() => {
                router.push({
                  pathname: '/expense-category',
                  params: { 
                    mode: 'challenge',
                    selectedDate: selectedDate,
                    calendarYear: currentYear.toString(),
                    calendarMonth: currentMonth.toString()
                  }
                });
              }, 350);
            }}
          >
            <Text style={[styles.optionText, { color: colors.text }]}>
              🎯 챌린지 도전
            </Text>
          </Pressable>
        </View>
      </ModalBottomsheet>
    </SafeAreaView>
  );
}

const SCREEN_WIDTH = Dimensions.get('window').width;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  cardLabel: {
    ...Typography.body2.r.medium,
    flexShrink: 0, // Prevent label from shrinking
  },
  cardAmount: {
    ...Typography.body1.l.bold,
    flex: 1, // Take remaining space
    textAlign: 'right',
  },
  challengeIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto', // Push to right
  },
  // Bottom sheet styles
  optionsContainer: {
    gap: 8,
  },
  option: {
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  optionText: {
    ...Typography.body1.l.regular,
  },
});

