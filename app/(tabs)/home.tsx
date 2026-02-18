/**
 * Home Screen
 * 
 * Main home screen with monthly calendar and financial summary.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { CalendarMain } from '@/components/ui/calendar-main';
import { Icon } from '@/components/ui/icon';
import { QuickInputShort } from '@/components/ui/quick-input-short';
import { BlurView } from 'expo-blur';
import { MonthData, YearView, YearViewRef } from '@/components/ui/year-view';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { FAB_OFFSET_ABOVE_TABS, useQuickInputContext } from '@/contexts/quick-input-context';
import { useLoading } from '@/contexts/loading-context';
import { applyPendingCalendarTargetEvent, calendarRefreshEvent } from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useThemeColor } from '@/hooks/use-theme-color';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { getCustomMonthInfo, isDateInCustomMonth } from '@/utils/custom-month';
import { saveMonthlyExpenseToWidget } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, AppStateStatus, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, Defs, LinearGradient, Stop, Svg } from 'react-native-svg';

const FAB_SIZE = 48;

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const iconWhite = useThemeColor({}, 'staticWhite');
  const navigation = useNavigation();
  const router = useRouter();
  const { calendarData, monthStartDay, refresh, isReady } = useAppData();
  const { updateCalendarContext } = useCreateSheetContext();
  const { setLoading } = useLoading();
  const pendingOpsRef = useRef(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const insets = useSafeAreaInsets();
  
  const { isQuickInputVisible, showQuickInput } = useQuickInputContext();
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

  // Star 아이콘 애니메이션: isContentReady 후 2초 대기 → (스케일 다운·업 → 2초 대기 → 회전 2바퀴 → 5초 대기 → 리셋) 루프
  const starScale = useRef(new Animated.Value(1)).current;
  const starRotate = useRef(new Animated.Value(0)).current;
  const starAnimationRunRef = useRef(false);

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

  // 캘린더가 차지할 수 있는 높이 (FAB/간편입력과 겹치지 않게 flex로 남은 영역만 사용)
  const [calendarContainerHeight, setCalendarContainerHeight] = useState<number | undefined>(undefined);
  
  // Top Navigation state
  const [periodType, setPeriodType] = useState<'year' | 'month'>('month');
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  
  // 년도 화면에서 마지막으로 본 월 추적
  const lastYearViewMonth = useRef<number | null>(null);
  // Shared year/month state for both TopNavigation and Calendar
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
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

  // 간편입력 등: 홈에 있을 때 해당 날짜로 포커스 적용
  useEffect(() => {
    const unsub = applyPendingCalendarTargetEvent.subscribe(async () => {
      try {
        const raw = await AsyncStorage.getItem('pendingCalendarTarget');
        if (!raw) return;
        const parsed = JSON.parse(raw) as { year?: number; month?: number; targetDate?: string };
        if (parsed?.year != null && parsed?.month != null && parsed?.targetDate) {
          setCurrentYear(parsed.year);
          setCurrentMonth(parsed.month);
          setSelectedDate(parsed.targetDate);
          setPeriodType('month');
          await AsyncStorage.removeItem('pendingCalendarTarget');
          await refresh();
        }
      } catch {
        // ignore
      }
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

  const handleQuickInputPress = useCallback(
    (shortBottomFromScreen: number) => showQuickInput(starScale, starRotate, shortBottomFromScreen),
    [showQuickInput, starScale, starRotate]
  );

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

  // Star 애니메이션: 홈 로딩 2초 후 → (스케일 다운·업 → 2초 대기 → 회전 2바퀴 → 5초 대기 → 리셋) 루프 반복
  useEffect(() => {
    if (!isContentReady || starAnimationRunRef.current) return;
    starAnimationRunRef.current = true;

    Animated.sequence([
      Animated.delay(2500),
      Animated.loop(
        Animated.sequence([
          Animated.timing(starScale, { toValue: 0.6, duration: 200, useNativeDriver: true }),
          Animated.timing(starScale, { toValue: 1.35, duration: 200, useNativeDriver: true }),
          Animated.timing(starScale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(1500),
          Animated.timing(starRotate, {
            toValue: 720,
            duration: 3000,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.delay(5000),
          Animated.timing(starRotate, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [isContentReady, starScale, starRotate]);

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

  // iOS 위젯에 이번달 소비 요약 데이터 동기화
  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return;
    }

    if (!isReady) {
      return;
    }

    // financialData는 현재 커스텀 월 기준 합산 데이터
    saveMonthlyExpenseToWidget(
      Number(financialData.expense),
      Number(financialData.income),
      Number(financialData.balance),
      Number(monthStartDay)
    ).catch((error) => {
      // 위젯 연동 실패는 앱 주요 플로우를 막지 않도록 조용히 로깅만 수행
      console.warn('[HomeScreen] Failed to sync monthly data to widget:', error);
    });
  }, [financialData, monthStartDay, isReady]);

  return (
    <View style={styles.screenWrapper}>
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
        <Animated.View style={[styles.monthViewContent, { opacity: isContentReady ? contentOpacity : 0 }]}>
            {/* 월 현황 (UI only 변경): 입금/소비/잔액 3개를 한 카드에 정렬 */}
            <View style={[styles.monthStatusWrap, { backgroundColor: colors.fill }]}>
              <View style={[styles.monthStatusCard, { backgroundColor: colors.staticWhite }]}>
                {/* 입금 */}
                <Pressable
                  style={styles.monthStatusItem}
                  onPress={() => {
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
                  <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>
                    입금
                  </Text>
                  <Text
                    style={[styles.monthStatusValue, { color: colors.text }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    + {financialData.income.toLocaleString()}원
                  </Text>
                </Pressable>

                <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

                {/* 소비 */}
                <Pressable
                  style={styles.monthStatusItem}
                  onPress={() => {
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
                  <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>
                    소비
                  </Text>
                  <Text
                    style={[styles.monthStatusValue, { color: colors.text }]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    - {financialData.expense.toLocaleString()}원
                  </Text>
                </Pressable>

                <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

                {/* 잔액 */}
                <Pressable
                  style={styles.monthStatusItem}
                  onPress={() => {
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
                  <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>
                    잔액
                  </Text>
                  <Text
                    style={[
                      styles.monthStatusValue,
                      {
                        color:
                          financialData.balance < 0
                            ? AtomicColors.red[500]
                            : AtomicColors.green[600],
                      },
                    ]}
                    adjustsFontSizeToFit
                    numberOfLines={1}
                    minimumFontScale={0.5}
                  >
                    {financialData.balance.toLocaleString()}원
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Calendar: flex 1로 남은 영역만 쓰고, 측정한 높이를 넘겨 FAB/간편입력과 겹치지 않게 함 */}
            <View
              style={styles.calendarContainer}
              onLayout={(e) => setCalendarContainerHeight(e.nativeEvent.layout.height)}
            >
              <CalendarMain
                containerHeight={calendarContainerHeight}
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
            </View>
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
      {/* 간편입력 버튼: 탭바 상단 중앙, 배경 블러 적용 (커스텀 키패드와 동일 패턴) */}
      {!isQuickInputVisible && (
        <QuickInputShort
          bottom={FAB_OFFSET_ABOVE_TABS}
          onPress={handleQuickInputPress}
          starScale={starScale}
          starRotate={starRotate}
        />
      )}

      {/* FAB: 홈에서만 노출, 기록/챌린지 선택 바텀시트 오픈 */}
      <Pressable
        style={[
          styles.fab,
          styles.fabShadow,
          {
            backgroundColor: colors.primary,
            // 탭 콘텐츠 영역 기준이므로 탭바 위 12px만 적용 (레이아웃에 둘 때와 동일한 시각 위치)
            bottom: FAB_OFFSET_ABOVE_TABS,
          },
        ]}
        onPress={() => createSheetEvent.emit()}
        accessibilityRole="button"
        accessibilityLabel="기록 또는 챌린지 선택"
      >
        <Icon name="addTaskFab" variant="line" size={24} color={iconWhite} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  monthViewContent: {
    flex: 1,
  },
  calendarContainer: {
    flex: 1,
  },
  monthStatusWrap: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  monthStatusCard: {
    height: 78,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
  monthStatusItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  monthStatusDivider: {
    width: 1,
    height: 16,
  },
  monthStatusLabel: {
    ...Typography.body2.r.medium,
    textAlign: 'center',
  },
  monthStatusValue: {
    ...Typography.body1.l.bold,
    textAlign: 'center',
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
  agentCardArrow: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

