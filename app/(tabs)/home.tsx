/**
 * Home Screen
 * 
 * Main home screen with monthly calendar and financial summary.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { CalendarMain, type CalendarExternalView } from '@/components/ui/calendar-main';
import { HomeMonthStatusCard } from '@/components/ui/home-month-status-card';
import { Icon } from '@/components/ui/icon';
import { QuickInputShort } from '@/components/ui/quick-input-short';
import { MonthData, YearView, YearViewRef } from '@/components/ui/year-view';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { FAB_OFFSET_ABOVE_TABS, useQuickInputContext } from '@/contexts/quick-input-context';
import {
    applyPendingCalendarTargetEvent,
    calendarRefreshEvent,
    consumeLatestPendingCalendarTarget,
    getLatestPendingCalendarTarget,
    peekLatestPendingCalendarTarget,
    persistPendingCalendarTarget,
    setLatestPendingCalendarTarget,
} from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useThemeColor } from '@/hooks/use-theme-color';
import { logEvent } from '@/utils/analytics';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import { createSheetEvent } from '@/utils/create-sheet-event';
import {
  buildCalendarMonthTotalsIndex,
  getCalendarMonthTotalsFromIndex,
} from '@/utils/calendar-month-totals';
import {
  getCustomMonthInfo,
  getCustomMonthRange,
  isDateInCustomMonth,
  parseCalendarDateKeyLocal,
} from '@/utils/custom-month';
import { saveMonthlyExpenseToWidget } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Easing,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const FAB_SIZE = 48;

export default function HomeScreen() {
  const initialPendingTarget = getLatestPendingCalendarTarget();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const iconWhite = useThemeColor({}, 'staticWhite');
  const navigation = useNavigation();
  const router = useRouter();
  const { calendarData, monthStartDay, refresh, isReady } = useAppData();
  const { updateCalendarContext } = useCreateSheetContext();
  const { setLoading } = useLoading();
  const pendingOpsRef = useRef(0);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const insets = useSafeAreaInsets();
  
  const { isQuickInputContentVisible, isQuickInputShortVisible, showQuickInput } =
    useQuickInputContext();

  const isQuickInputShortHidden = isQuickInputContentVisible && !isQuickInputShortVisible;
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
  const hasContentFadedInRef = useRef(false);

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
  
  // Shared year/month state for both TopNavigation and Calendar
  const [currentYear, setCurrentYear] = useState<number>(
    initialPendingTarget?.year ?? new Date().getFullYear(),
  );
  const [currentMonth, setCurrentMonth] = useState<number>(
    initialPendingTarget?.month ?? (new Date().getMonth() + 1),
  ); // 1-12
  /** CalendarMain 마운트 초기 월 — 스와이프마다 prop으로 넘기지 않음 */
  const calendarBootRef = useRef({
    year: initialPendingTarget?.year ?? new Date().getFullYear(),
    month: initialPendingTarget?.month ?? new Date().getMonth() + 1,
  });
  const [calendarExternalView, setCalendarExternalView] = useState<CalendarExternalView | null>(
    null,
  );
  const syncCalendarExternalView = useCallback((year: number, month: number) => {
    setCalendarExternalView((prev) => {
      if (prev?.year === year && prev?.month === month) {
        return prev;
      }
      return { year, month };
    });
  }, []);
  const handleYearMonthPress = useCallback(
    (month: number) => {
      if (isNavigating.current) {
        return;
      }

      isNavigating.current = true;

      router.push({
        pathname: '/(tabs)/challenge',
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
  const [selectedDate, setSelectedDate] = useState<string>(initialPendingTarget?.targetDate ?? '');
  const selectedDateRef = useRef(selectedDate);
  const currentYearRef = useRef(currentYear);
  const currentMonthRef = useRef(currentMonth);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    currentYearRef.current = currentYear;
  }, [currentYear]);

  useEffect(() => {
    currentMonthRef.current = currentMonth;
  }, [currentMonth]);

  const applyHomeCalendarSelection = useCallback(
    (year: number, month: number, targetDate: string) => {
      selectedDateRef.current = targetDate;
      currentYearRef.current = year;
      currentMonthRef.current = month;
      setCurrentYear(year);
      setCurrentMonth(month);
      setSelectedDate(targetDate);
      setPeriodType('month');
      syncCalendarExternalView(year, month);
    },
    [syncCalendarExternalView],
  );

  const handleCalendarMonthChange = useCallback((year: number, month: number) => {
    currentYearRef.current = year;
    currentMonthRef.current = month;
    setCurrentYear(year);
    setCurrentMonth(month);
  }, []);

  const handleCalendarDayPress = useCallback(
    (dateString: string) => {
      const currentSelection = selectedDateRef.current;
      if (currentSelection === dateString) {
        if (isNavigating.current) {
          return;
        }

        isNavigating.current = true;

        void persistPendingCalendarTarget({
          year: currentYearRef.current,
          month: currentMonthRef.current,
          targetDate: dateString,
        });

        void logEvent('ui', {
          screen_name: '/monthly-expense-timeline',
          target: 'timeline_entry',
          entry_point: 'home_calendar_day_retap',
          selected_date: dateString,
          year: currentYearRef.current,
          month: currentMonthRef.current,
        });

        router.push({
          pathname: '/monthly-expense-timeline',
          params: {
            year: currentYearRef.current.toString(),
            month: currentMonthRef.current.toString(),
            selectedDate: dateString,
          },
        });

        setTimeout(() => {
          isNavigating.current = false;
        }, 500);
        return;
      }

      applyHomeCalendarSelection(
        currentYearRef.current,
        currentMonthRef.current,
        dateString,
      );
      void persistPendingCalendarTarget({
        year: currentYearRef.current,
        month: currentMonthRef.current,
        targetDate: dateString,
      });
    },
    [applyHomeCalendarSelection, router],
  );

  const handleCalendarExternalViewApplied = useCallback(() => {
    setCalendarExternalView(null);
  }, []);

  const homeCalendarElement = useMemo(
    () => (
      <CalendarMain
        containerHeight={calendarContainerHeight}
        selectedDate={selectedDate}
        onDayPress={handleCalendarDayPress}
        dayData={calendarData}
        showTitle={false}
        initialYear={calendarBootRef.current.year}
        initialMonth={calendarBootRef.current.month}
        externalView={calendarExternalView}
        onExternalViewApplied={handleCalendarExternalViewApplied}
        monthStartDay={monthStartDay}
        onMonthChange={handleCalendarMonthChange}
      />
    ),
    [
      calendarContainerHeight,
      selectedDate,
      handleCalendarDayPress,
      calendarData,
      calendarExternalView,
      handleCalendarExternalViewApplied,
      monthStartDay,
      handleCalendarMonthChange,
    ],
  );

  const applyPendingCalendarTarget = useCallback(async () => {
    try {
      let target = peekLatestPendingCalendarTarget();

      if (target?.year == null || target?.month == null || !target?.targetDate) {
        const raw = await AsyncStorage.getItem('pendingCalendarTarget');
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw) as { year?: number; month?: number; targetDate?: string };
        if (parsed?.year == null || parsed?.month == null || !parsed?.targetDate) {
          return;
        }
        target = { year: parsed.year, month: parsed.month, targetDate: parsed.targetDate };
        setLatestPendingCalendarTarget(target);
      }

      const { year, month, targetDate } = target;
      const matches =
        year === currentYearRef.current &&
        month === currentMonthRef.current &&
        targetDate === selectedDateRef.current;

      if (!matches) {
        applyHomeCalendarSelection(year, month, targetDate);
      }

      consumeLatestPendingCalendarTarget();
      await AsyncStorage.removeItem('pendingCalendarTarget');
    } catch {
      // ignore
    }
  }, [applyHomeCalendarSelection]);

  // 앱 시작 시 저장된 설정 불러오기 및 params 처리
  useEffect(() => {
    const loadSettings = async () => {
      try {
        beginLoad();
        // 0) 메모리 pending 타겟이 있으면 최우선 적용 후 종료
        if (
          initialPendingTarget?.year != null &&
          initialPendingTarget?.month != null &&
          initialPendingTarget?.targetDate
        ) {
          setCurrentYear(initialPendingTarget.year);
          setCurrentMonth(initialPendingTarget.month);
          setSelectedDate(initialPendingTarget.targetDate);
          setPeriodType('month');
          syncCalendarExternalView(initialPendingTarget.year, initialPendingTarget.month);
          return;
        }

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
              syncCalendarExternalView(parsed.year, parsed.month);
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
          syncCalendarExternalView(targetYear, targetMonth);
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
  }, [
    params.targetYear,
    params.targetMonth,
    params.targetDate,
    beginLoad,
    endLoad,
    refresh,
    syncCalendarExternalView,
  ]); // params가 변경될 때마다 실행
  
  // periodType 변경 시 저장
  useEffect(() => {
    if (!isLoadingSettings) {
      AsyncStorage.setItem('lastViewType', periodType).catch((error) => {

      });
    }
  }, [periodType, isLoadingSettings]);
  
  /** 오늘 날짜·커스텀 월로 이동 (년/월 뷰 모드는 유지) */
  const syncCalendarDatesToToday = useCallback(async () => {
    const today = new Date();
    const monthStart = await loadMonthStartDay();
    const customMonthInfo = getCustomMonthInfo(today, monthStart);

    setCurrentYear(customMonthInfo.year);
    setCurrentMonth(customMonthInfo.month);
    syncCalendarExternalView(customMonthInfo.year, customMonthInfo.month);

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  }, [syncCalendarExternalView]);

  // 홈 탭 더블탭·날짜 변경 시: 오늘로 이동 + 년도 뷰면 월 뷰로 전환
  const resetToToday = useCallback(async () => {
    await syncCalendarDatesToToday();
    if (periodType === 'year') {
      setPeriodType('month');
    }
  }, [periodType, syncCalendarDatesToToday, setPeriodType]);
  
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

  // publishCalendarTarget 수신: UI 즉시 반영(persist는 발행 쪽). target 없으면 포커스 시 storage 정리.
  useEffect(() => {
    const unsub = applyPendingCalendarTargetEvent.subscribe(async (target) => {
      if (target?.year != null && target?.month != null && target?.targetDate) {
        const { year, month, targetDate } = target;
        const matches =
          year === currentYearRef.current &&
          month === currentMonthRef.current &&
          targetDate === selectedDateRef.current;
        if (!matches) {
          applyHomeCalendarSelection(year, month, targetDate);
        }
        return;
      }
      if (!navigation.isFocused()) {
        return;
      }
      await applyPendingCalendarTarget();
    });
    return unsub;
  }, [applyHomeCalendarSelection, applyPendingCalendarTarget, navigation]);

  // emit으로 이미 맞춘 경우 no-op. pending 스토리지 consume·간편입력용.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void applyPendingCalendarTarget();
    });
    return unsubscribe;
  }, [navigation, applyPendingCalendarTarget]);

  // 기록 저장 후 pop 복귀: 초기 페이드·opacity 0 재진입 방지 (Android 깜빡임)
  useFocusEffect(
    useCallback(() => {
      if (!peekLatestPendingCalendarTarget()) {
        return;
      }
      hasAnimatedRef.current = true;
      hasContentFadedInRef.current = true;
      contentOpacity.setValue(1);
      setIsContentReady(true);
    }, [contentOpacity]),
  );

  // 월 → 년도 화면 전환 시에만 현재 월 위치로 스크롤 (년도 스와이프 시에는 유지)
  useEffect(() => {
    if (periodType !== 'year') {
      return;
    }
    const timer = setTimeout(() => {
      yearViewRef.current?.scrollToMonth(currentMonthRef.current, true);
    }, 150);
    return () => clearTimeout(timer);
  }, [periodType]);
  
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

  const yearBounds = useMemo(
    () => ({
      min: yearOptions[0]?.value ?? new Date().getFullYear() - 10,
      max: yearOptions[yearOptions.length - 1]?.value ?? new Date().getFullYear() + 10,
    }),
    [yearOptions],
  );

  const handlePrevYear = useCallback(() => {
    setCurrentYear((year) => (year <= yearBounds.min ? year : year - 1));
  }, [yearBounds.min]);

  const handleNextYear = useCallback(() => {
    setCurrentYear((year) => (year >= yearBounds.max ? year : year + 1));
  }, [yearBounds.max]);

  const yearPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onMoveShouldSetPanResponderCapture: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const SWIPE_THRESHOLD = 50;
        const { dx } = gestureState;

        if (dx <= -SWIPE_THRESHOLD) {
          handleNextYear();
        } else if (dx >= SWIPE_THRESHOLD) {
          handlePrevYear();
        }
      },
    }),
  ).current;
  
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

    // 기록 저장 후 복귀(targetDate params 또는 pending) 시 초기 페이드 생략
    if (params.targetDate || peekLatestPendingCalendarTarget()) {
      hasAnimatedRef.current = true;
      setIsContentReady(true);
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
        // selectedDate가 비어 있고 pending/params도 없을 때만 날짜를 오늘로 (뷰 모드는 lastViewType 유지)
        if (!params.targetDate && !selectedDateRef.current) {
          const raw = await AsyncStorage.getItem('pendingCalendarTarget');
          if (!raw) {
            await syncCalendarDatesToToday();
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
  }, [isReady, syncCalendarDatesToToday]);

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
    if (!isContentReady) {
      contentOpacity.setValue(0);
      return;
    }
    if (hasContentFadedInRef.current) {
      contentOpacity.setValue(1);
      return;
    }
    hasContentFadedInRef.current = true;
    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
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

  // 년 뷰에서만 집계 (월 뷰·피커 확인 시 O(n×12) 스캔 방지)
  const yearData: MonthData[] = useMemo(() => {
    if (periodType !== 'year') {
      return [];
    }

    const monthlyTotals: Record<number, { income: number; expense: number }> = {};
    for (let m = 1; m <= 12; m++) {
      monthlyTotals[m] = { income: 0, expense: 0 };
    }

    Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
      const date = parseCalendarDateKeyLocal(dateString);
      if (!date) {
        return;
      }

      for (let m = 1; m <= 12; m++) {
        if (isDateInCustomMonth(date, currentYear, m, monthStartDay)) {
          monthlyTotals[m].income += data.totalIncome || 0;
          monthlyTotals[m].expense += data.totalExpense || 0;
          break;
        }
      }
    });

    return Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        month,
        income: monthlyTotals[month].income,
        expense: monthlyTotals[month].expense,
      };
    });
  }, [currentYear, calendarData, monthStartDay, periodType]);

  const calendarMonthTotalsIndex = useMemo(
    () => (monthStartDay === 1 ? buildCalendarMonthTotalsIndex(calendarData) : null),
    [calendarData, monthStartDay],
  );

  // 현재 커스텀 월 합산 (reload 없음 — 이미 로드된 calendarData 필터만)
  const financialData = useMemo(() => {
    if (monthStartDay === 1 && calendarMonthTotalsIndex) {
      return getCalendarMonthTotalsFromIndex(
        calendarMonthTotalsIndex,
        currentYear,
        currentMonth,
      );
    }

    let totalIncome = 0;
    let totalExpense = 0;

    const { startDate, endDate } = getCustomMonthRange(
      currentYear,
      currentMonth,
      monthStartDay,
    );
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    for (const [dateString, data] of Object.entries(calendarData)) {
      const date = parseCalendarDateKeyLocal(dateString);
      if (!date) {
        continue;
      }
      const time = date.getTime();
      if (time < startTime || time > endTime) {
        continue;
      }
      totalIncome += data.totalIncome || 0;
      totalExpense += data.totalExpense || 0;
    }

    return {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    };
  }, [currentYear, currentMonth, calendarData, calendarMonthTotalsIndex, monthStartDay]);

  const monthlyIncomeText = useMemo(() => {
    const amount = Number(financialData.income) || 0;
    return amount > 0 ? `+ ${amount.toLocaleString()}원` : '0원';
  }, [financialData.income]);

  const monthlyExpenseText = useMemo(() => {
    const amount = Number(financialData.expense) || 0;
    return amount > 0 ? `- ${amount.toLocaleString()}원` : '0원';
  }, [financialData.expense]);

  const monthlyBalanceText = useMemo(() => {
    const amount = Number(financialData.balance) || 0;
    if (amount === 0) return '0원';
    if (amount < 0) return `- ${Math.abs(amount).toLocaleString()}원`;
    return `${amount.toLocaleString()}원`;
  }, [financialData.balance]);

  const handleMonthStatusIncomePress = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/home',
      target: 'income-present',
    });
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
  }, [currentMonth, currentYear, effectiveSelectedDate, router]);

  const handleMonthStatusExpensePress = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/home',
      target: 'expense-present',
    });
    const targetDate = effectiveSelectedDate;
    router.push({
      pathname: '/expense-category',
      params: {
        selectedDate: targetDate,
        calendarYear: currentYear.toString(),
        calendarMonth: currentMonth.toString(),
      },
    });
  }, [currentMonth, currentYear, effectiveSelectedDate, router]);

  const handleMonthStatusBalancePress = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/home',
      target: 'report-present',
    });
    router.push({
      pathname: '/(tabs)/challenge',
      params: {
        year: currentYear.toString(),
        month: currentMonth.toString(),
        tab: 'status',
      },
    });
  }, [currentMonth, currentYear, router]);

  const homeMonthStatusElement = useMemo(
    () => (
      <HomeMonthStatusCard
        incomeText={monthlyIncomeText}
        expenseText={monthlyExpenseText}
        balanceText={monthlyBalanceText}
        balanceNegative={financialData.balance < 0}
        onIncomePress={handleMonthStatusIncomePress}
        onExpensePress={handleMonthStatusExpensePress}
        onBalancePress={handleMonthStatusBalancePress}
      />
    ),
    [
      monthlyIncomeText,
      monthlyExpenseText,
      monthlyBalanceText,
      financialData.balance,
      handleMonthStatusIncomePress,
      handleMonthStatusExpensePress,
      handleMonthStatusBalancePress,
    ],
  );

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
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
      
      {/* Top Navigation */}
      <Animated.View style={{ opacity: isContentReady ? contentOpacity : 0 }}>
        <TopNavigation
          type="main"
          title=""
          showDay
          dateText={dateText}
          periodType={periodType}
          onPeriodChange={setPeriodType}
          periodToggleAnalyticsScreenName="/home"
          showDropdownArrow
          yearOptions={yearOptions}
          selectedYear={currentYear}
          onYearMonthChange={(year, month) => {
            const minYear = yearOptions[0]?.value ?? year;
            const maxYear = yearOptions[yearOptions.length - 1]?.value ?? year;
            const clampedYear = Math.min(maxYear, Math.max(minYear, year));
            if (clampedYear !== currentYearRef.current) {
              setCurrentYear(clampedYear);
            }
            if (
              month !== undefined &&
              periodType === 'month' &&
              month !== currentMonthRef.current
            ) {
              setCurrentMonth(month);
            }
            if (periodType === 'month') {
              const nextMonth = month ?? currentMonthRef.current;
              syncCalendarExternalView(clampedYear, nextMonth);
            }
          }}
          monthOptions={periodType === 'month' ? monthOptions : undefined}
          selectedMonth={periodType === 'month' ? currentMonth : undefined}
        />
      </Animated.View>

      {/* Conditional Content: Month View or Year View */}
      {periodType === 'month' ? (
        <Animated.View style={[styles.monthViewContent, { opacity: isContentReady ? contentOpacity : 0 }]}>
            {homeMonthStatusElement}

            {/* Calendar: flex 1로 남은 영역만 쓰고, 측정한 높이를 넘겨 FAB/간편입력과 겹치지 않게 함 */}
            <View
              style={styles.calendarContainer}
              onLayout={(e) => {
                const height = e.nativeEvent.layout.height;
                setCalendarContainerHeight((prev) =>
                  prev != null && Math.abs(prev - height) < 2 ? prev : height,
                );
              }}
            >
              {homeCalendarElement}
            </View>
        </Animated.View>
      ) : (
        <View style={styles.yearViewContent} {...yearPanResponder.panHandlers}>
          <YearView
            ref={yearViewRef}
            year={currentYear}
            monthsData={yearData}
            onMonthPress={handleYearMonthPress}
            yearCardAnalyticsScreenName="/home"
          />
        </View>
      )}

      {/* 간편입력: SafeAreaView 안에 두어 홈 레이아웃과 겹침 처리 */}
      {periodType === 'month' && isAtLeastVersion(Constants.expoConfig?.version, QUICK_INPUT_MIN_VERSION) && (
        <View
          collapsable={false}
          style={[
            styles.quickInputAnchor,
            isQuickInputShortHidden && styles.quickInputShortHidden,
          ]}
          pointerEvents={isQuickInputShortHidden ? 'none' : 'box-none'}
        >
          <QuickInputShort
            bottom={FAB_OFFSET_ABOVE_TABS}
            onPress={handleQuickInputPress}
            starScale={starScale}
            starRotate={starRotate}
          />
        </View>
      )}

    </SafeAreaView>

      {/* FAB: 홈에서만 노출, 기록/챌린지 선택 바텀시트 오픈 */}
      <Pressable
        style={[
          styles.fab,
          styles.fabShadow,
          {
            backgroundColor: palette.primary,
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
  quickInputAnchor: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  quickInputShortHidden: {
    opacity: 0,
  },
  monthViewContent: {
    flex: 1,
  },
  yearViewContent: {
    flex: 1,
  },
  calendarContainer: {
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
    ...typography.body02.medium,
    flexShrink: 0, // Prevent label from shrinking
  },
  cardAmount: {
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

