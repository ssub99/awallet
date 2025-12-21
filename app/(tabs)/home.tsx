/**
 * Home Screen
 * 
 * Main home screen with monthly calendar and financial summary.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { CalendarMain } from '@/components/ui/calendar-main';
import { Icon } from '@/components/ui/icon';
import { MonthData, YearView, YearViewRef } from '@/components/ui/year-view';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getCustomMonthInfo, isDateInCustomMonth } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const navigation = useNavigation();
  const router = useRouter();
  const { calendarData, monthStartDay, refresh, isReady } = useAppData();
  const { updateCalendarContext } = useCreateSheetContext();
  const { setLoading } = useLoading();
  const pendingOpsRef = useRef(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const beginLoad = useCallback(() => {
    pendingOpsRef.current += 1;
    setLoading(true);
  }, [setLoading]);
  const endLoad = useCallback(() => {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    if (pendingOpsRef.current === 0) setLoading(false);
  }, [setLoading]);
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

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
  const handleYearMonthPress = useCallback(
    (month: number) => {
      if (isNavigating.current) {
        return;
      }

      lastYearViewMonth.current = month;
      isNavigating.current = true;

      router.push({
        pathname: '/monthly-expense-timeline',
        params: {
          year: currentYear.toString(),
          month: month.toString(),
          tab: 'status',
        },
      });

      setTimeout(() => {
        isNavigating.current = false;
      }, 500);
    },
    [router, currentYear]
  );
  
  // 사용되지 않는 오늘 날짜 유틸 제거 (기능 영향 없음)
  
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Shared year/month state for both TopNavigation and Calendar
  // 초기값은 임시로 설정하고, useFocusEffect에서 올바른 값으로 설정
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  
  // 앱 시작 시 저장된 설정 불러오기 및 params 처리
  useEffect(() => {
    const loadSettings = async () => {
      try {
        beginLoad();
        // 0) pending 타겟이 있으면 최우선 적용 후 종료
        try {
          const raw = await AsyncStorage.getItem('pendingCalendarTarget');
          if (raw) {
            const parsed = JSON.parse(raw) as { year?: number; month?: number; targetDate?: string };
            if (parsed?.year && parsed?.month && parsed?.targetDate) {
              setCurrentYear(parsed.year);
              setCurrentMonth(parsed.month);
              setSelectedDate(parsed.targetDate);
              setPeriodType('month');
              await AsyncStorage.removeItem('pendingCalendarTarget');
              return; // 오늘 초기화/기타 분기 타지 않게 조기 종료
            }
          }
        } catch {}
        // 소비 기록 완료 후 전달된 params가 있으면 해당 날짜로 이동
        if (params.targetYear && params.targetMonth && params.targetDate) {
          const targetYear = parseInt(params.targetYear);
          const targetMonth = parseInt(params.targetMonth);
          
          // 🔄 소비 기록 후에는 전역 데이터 새로고침
          await refresh();
          
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
        }
      } catch (error) {
        console.error('설정 로드 중 오류:', error);
      } finally {
        setIsLoadingSettings(false);
        endLoad();
      }
    };
    
    loadSettings();
  }, [params.targetYear, params.targetMonth, params.targetDate, beginLoad, endLoad, refresh]); // params가 변경될 때마다 실행
  
  // periodType 변경 시 저장
  useEffect(() => {
    if (!isLoadingSettings) {
      AsyncStorage.setItem('lastViewType', periodType).catch((error) => {

      });
    }
  }, [periodType, isLoadingSettings]);
  
  // Reset to today's date (and switch to month view if in year view)
  const resetToToday = useCallback(async () => {
    const today = new Date();
    
    // Load month start day to calculate correct custom month
    const monthStart = await loadMonthStartDay();
    
    // Get custom month info for today's date
    const customMonthInfo = getCustomMonthInfo(today, monthStart);
    
    setCurrentYear(customMonthInfo.year);
    setCurrentMonth(customMonthInfo.month);
    
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
  }, [periodType, setCurrentYear, setCurrentMonth, setSelectedDate, setPeriodType]);
  
  // Listen for double tap on home tab
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabDoubleTap' as any, (e: any) => {
      if (e.data?.routeName === 'home') {
        resetToToday().catch((error) => {
          console.error('Error resetting to today:', error);
        });
      }
    });
    
    return unsubscribe;
  }, [navigation, resetToToday]);
  
  // Listen for create tab press (only when focused)
  const effectiveSelectedDate = useMemo(() => {
    if (selectedDate) {
      return selectedDate;
    }
    const paddedMonth = String(currentMonth).padStart(2, '0');
    return `${currentYear}-${paddedMonth}-01`;
  }, [selectedDate, currentYear, currentMonth]);

  useEffect(() => {
    updateCalendarContext({
      selectedDate: effectiveSelectedDate,
      calendarYear: currentYear,
      calendarMonth: currentMonth,
    });
  }, [effectiveSelectedDate, currentYear, currentMonth, updateCalendarContext]);

  // 전역 캘린더 새로고침 이벤트 구독: 로컬 캐시 변경 즉시 반영
  useEffect(() => {
    const unsub = calendarRefreshEvent.subscribe(() => {
      refresh();
    });
    return unsub;
  }, [refresh]);

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

  // Calendar data는 전역 컨텍스트에서 제공됨


  // 모든 필요한 데이터가 준비된 이후(초기/갱신) 한 번만 페이드 트리거
  const animatingRef = useRef(false);
  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (hasAnimatedRef.current) {
      setIsContentReady(true);
      return;
    }

    if (animatingRef.current) {
      return;
    }

    animatingRef.current = true;
    const init = async () => {
      setIsContentReady(false);
      try {
        // selectedDate가 비어있고 pending/params도 없는 경우에만 오늘로 초기화
        if (!params.targetDate) {
          const raw = await AsyncStorage.getItem('pendingCalendarTarget');
          if (!raw) {
            await resetToToday();
          }
        }
      } finally {
        setIsContentReady(true);
        hasAnimatedRef.current = true;
        setTimeout(() => {
          animatingRef.current = false;
        }, 50);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  // 앱이 백그라운드에서 포그라운드로 돌아올 때 날짜 변경 여부를 감지하여 오늘로 리셋
  const handleAppStateChange = useCallback(
    (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        const checkDateChange = async () => {
          try {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const todayStr = `${year}-${month}-${day}`;

            const lastUsedDate = await AsyncStorage.getItem('lastUsedDate');

            if (!lastUsedDate) {
              // 첫 사용 시에는 기준 날짜만 저장하고 기존 초기화 로직에 맡김
              await AsyncStorage.setItem('lastUsedDate', todayStr);
              return;
            }

            if (lastUsedDate !== todayStr) {
              await resetToToday();
              await AsyncStorage.setItem('lastUsedDate', todayStr);
            }
          } catch (error) {
            
          }
        };

        void checkDateChange();
      }

      appState.current = nextAppState;
    },
    [resetToToday]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [handleAppStateChange]);

  useEffect(() => {
    if (isContentReady) {
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);


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
      
      {/* Top Navigation */}
      <Animated.View style={{ opacity: isContentReady ? contentOpacity : 0 }}>
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
          onYearChange={(year) => {
            const minYear = yearOptions[0]?.value ?? year;
            const maxYear = yearOptions[yearOptions.length - 1]?.value ?? year;
            const clampedYear = Math.min(maxYear, Math.max(minYear, year));
            setCurrentYear(clampedYear);
          }}
          monthOptions={periodType === 'month' ? monthOptions : undefined}
          selectedMonth={periodType === 'month' ? currentMonth : undefined}
          onMonthChange={periodType === 'month' ? (month) => setCurrentMonth(month) : undefined}
        />
      </Animated.View>

      {/* Conditional Content: Month View or Year View */}
      {periodType === 'month' ? (
        <Animated.View style={{ opacity: isContentReady ? contentOpacity : 0 }}>
            {/* Financial Summary Cards */}
            <View style={[styles.summaryContainer, { backgroundColor: colors.fill }]}> 
              <View style={styles.summaryRow}>
                {/* Income Card */}
                <Pressable 
                  style={[styles.card, { backgroundColor: colors.staticWhite }]}
                  onPress={() => {
                    // 수입 기록: 카테고리 선택 → 기록
                    const targetDate = effectiveSelectedDate;
                    router.push({
                      pathname: '/expense-category',
                      params: {
                        type: 'income',
                        selectedDate: targetDate,
                        calendarYear: currentYear.toString(),
                        calendarMonth: currentMonth.toString(),
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="수입 기록하기"
                > 
                  <Text style={[styles.cardLabel, { color: colors.textNeutral }]}> 
                    수입
                  </Text>
                  <Text 
                    style={[styles.cardAmount, { color: colors.text }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    + {financialData.income.toLocaleString()}원
                  </Text>
                </Pressable>

                {/* Balance Card */}
                <Pressable 
                  style={[styles.card, { backgroundColor: colors.staticWhite }]}
                  onPress={() => {
                    // 타임라인으로 이동
                    router.push({
                      pathname: '/monthly-expense-timeline',
                      params: {
                        year: currentYear.toString(),
                        month: currentMonth.toString(),
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="월 타임라인 보기"
                > 
                  <Text style={[styles.cardLabel, { color: colors.textNeutral }]}> 
                    잔액
                  </Text>
                  <Text 
                    style={[styles.cardAmount, { 
                      color: financialData.balance < 0 
                        ? AtomicColors.red[500] 
                        : AtomicColors.green[600]
                    }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    {financialData.balance.toLocaleString()}원
                  </Text>
                </Pressable>
              </View>

              <View style={styles.summaryRow}>
                {/* Expense Card */}
                <Pressable 
                  style={[styles.card, { backgroundColor: colors.staticWhite }]}
                  onPress={() => {
                    // 소비 카테고리 선택 화면으로 이동
                    const targetDate = effectiveSelectedDate;
                    router.push({
                      pathname: '/expense-category',
                      params: {
                        selectedDate: targetDate,
                        calendarYear: currentYear.toString(),
                        calendarMonth: currentMonth.toString(),
                      },
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="소비 기록하기"
                > 
                  <Text style={[styles.cardLabel, { color: colors.textNeutral }]}> 
                    소비
                  </Text>
                  <Text 
                    style={[styles.cardAmount, { color: colors.text }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    - {financialData.expense.toLocaleString()}원
                  </Text>
                </Pressable>

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
        </Animated.View>
      ) : (
        <>
          {/* Year View */}
          <YearView
            key={`year-${currentYear}`}
            ref={yearViewRef}
            year={currentYear}
            monthsData={yearData}
            initialMonth={lastYearViewMonth.current ?? undefined}
            onMonthPress={handleYearMonthPress}
          />
        </>
      )}

    </SafeAreaView>
  );
}

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
});

