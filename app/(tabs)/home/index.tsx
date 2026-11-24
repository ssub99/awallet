/**
 * Home Screen
 * 
 * Main home screen with monthly calendar and financial summary.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { CalendarMain, type CalendarExternalView } from '@/components/ui/calendar-main';
import { NoticeCard } from '@/components/ui/notice-card';
import { HomeListQuickInputDock } from '@/components/ui/home-list-quick-input-dock';
import { HomeListView } from '@/components/ui/home-list-view';
import { HomeMonthStatusCard } from '@/components/ui/home-month-status-card';
import { Icon } from '@/components/ui/icon';
import { QuickInputShort, type QuickInputShortHandle } from '@/components/ui/quick-input-short';
import { MonthData, YearView, YearViewRef } from '@/components/ui/year-view';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { type QuickInputChipAction, useQuickInputContext } from '@/contexts/quick-input-context';
import { HOME_STACK_PATHS } from '@/constants/navigation/route-ownership';
import {
  getHomeBottomContentInset,
  getQuickInputBottomAboveTabBar,
} from '@/constants/navigation/tab-bar-metrics';
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
import { useCategoryEmojiMap } from '@/hooks/use-category-emoji-map';
import { getHomeScreenName } from '@/utils/home-screen-name';
import {
  getResolvedHomeViewExperimentGroup,
  isHomeListViewEnabled,
  resolveHomeViewExperiment,
  trackHomeViewExposureOnce,
  type HomeViewExperimentGroup,
} from '@/utils/home-view-experiment';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { buildTimelineItemsFromCalendarData, type TimelineListItem } from '@/utils/timeline-from-calendar';
import { logEvent, logScreenView } from '@/utils/analytics';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import {
  buildCalendarMonthTotalsIndex,
  getCalendarMonthTotalsFromIndex,
} from '@/utils/calendar-month-totals';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { tabReselectEvent } from '@/utils/tab-reselect-event';
import {
  getCustomMonthInfo,
  getCustomMonthRange,
  isDateInCustomMonth,
  parseCalendarDateKeyLocal,
} from '@/utils/custom-month';
import {
  consumeHomePendingOpenRecordInbox,
  subscribeHomePendingOpenRecordInbox,
} from '@/utils/home-open-record-inbox-pending';
import { releaseFirstScreenSplash } from '@/utils/first-screen-splash';
import { saveMonthlyExpenseToWidget } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  useFocusEffect,
  useIsFocused,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from 'expo-router';
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
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const FAB_SIZE = 48;
const HOME_VIEW_TYPE_STORAGE_KEY = 'homeViewType';
/**
 * 마지막으로 쓴 홈 뷰 타입(세션 메모리). 기록 저장·삭제 뒤 `dismissAll → replace('/home')`로 홈이 다시 마운트돼도
 * 저장소(비동기)를 기다리지 않고 곧바로 같은 뷰로 시작해, 리스트뷰 사용자에게 캘린더뷰가 잠깐 보이지 않게 한다.
 */
let cachedHomeViewType: 'calendar' | 'list' | null = null;
/**
 * 리스트뷰는 A/B 플래그(ensure_simple_creation)로 연다 (utils/home-view-experiment).
 * - treatment: 리스트뷰가 있다. 저장된 선택이 없으면(처음) 리스트로 시작하고, 이후에는 사용자가 마지막으로 선택한 뷰
 *   (HOME_VIEW_TYPE_STORAGE_KEY)로 시작한다.
 * - control·실험 제외: 리스트뷰가 없다. 저장된 값과 상관없이 캘린더뷰로 고정하고 전환 아이콘도 숨긴다.
 */
const TREATMENT_DEFAULT_VIEW_TYPE: 'calendar' | 'list' = 'list';
/** 리스트뷰 하단 독 높이: 칩 40 + 간격 12 + 입력창 48 */
const LIST_DOCK_HEIGHT = 100;

function toDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export default function HomeScreen() {
  const initialPendingTarget = getLatestPendingCalendarTarget();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const navigation = useNavigation();
  const router = useRouter();
  const { calendarData, monthStartDay, refresh, isReady } = useAppData();
  const isHomeScreenFocused = useIsFocused();
  const { updateCalendarContext } = useCreateSheetContext();
  const { setLoading } = useLoading();
  const pendingOpsRef = useRef(0);

  // 온보딩 스킵·완료 후 진입 시 스플래시 안전 해제
  useEffect(() => {
    releaseFirstScreenSplash();
  }, []);
  const appState = useRef<AppStateStatus>(
    (AppState.currentState as AppStateStatus | null | undefined) ?? 'active',
  );
  const insets = useSafeAreaInsets();
  const quickInputBottom = getQuickInputBottomAboveTabBar(insets.bottom);
  const bottomContentInset = getHomeBottomContentInset(insets.bottom);

  const {
    isQuickInputContentVisible,
    isQuickInputShortVisible,
    showQuickInput,
    openQuickInputRecordInboxFromGuide,
    openQuickInputChipAction,
    isQuickInputHomeListPanelFlow,
    isQuickInputHomeListOverlay,
  } = useQuickInputContext();
  const openQuickInputRecordInboxFromGuideRef = useRef(openQuickInputRecordInboxFromGuide);
  useEffect(() => {
    openQuickInputRecordInboxFromGuideRef.current = openQuickInputRecordInboxFromGuide;
  }, [openQuickInputRecordInboxFromGuide]);
  const isHomeFocusedRef = useRef(false);
  const quickInputShortRef = useRef<QuickInputShortHandle>(null);

  // 리스트뷰 칩 → 패널 흐름(리스트뷰에서만 true)에서는 하단 독(칩·입력창)이 그 자리에 그대로 남는다 (딤 아래)
  const isQuickInputOverlayActive = isQuickInputContentVisible && !isQuickInputShortVisible;
  // 리스트뷰: 하단 독은 통째로 숨기지 않는다. 입력 UI가 올라오면 입력창만 숨기고 칩은 제자리에 둔다.
  const isQuickInputShortHidden = isQuickInputOverlayActive && !isQuickInputHomeListOverlay;
  // 리스트뷰에서 간편입력 입력 UI만 올라와 있는 상태 (패널 흐름은 제외)
  const isHomeListInputRaised =
    isQuickInputOverlayActive && isQuickInputHomeListOverlay && !isQuickInputHomeListPanelFlow;
  const beginLoad = useCallback(() => {
    pendingOpsRef.current += 1;
    setLoading(true);
  }, [setLoading]);
  const endLoad = useCallback(() => {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    if (pendingOpsRef.current === 0) setLoading(false);
  }, [setLoading]);
  const [isContentReady, setIsContentReady] = useState(false);
  const [contentOpacity] = useState(() => new Animated.Value(0));
  const hasAnimatedRef = useRef(false);
  const hasContentFadedInRef = useRef(false);

  // Star 아이콘 애니메이션 (포커스 중에만 — 블러 시 정지해 pop 제스처 부담 제거)
  const [starScale] = useState(() => new Animated.Value(1));
  const [starRotate] = useState(() => new Animated.Value(0));
  const starAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  /** flex 캘린더 영역 실측 → dayCellHeight. 자체 onLayout만 쓰면 inset 변경 후 높이가 굳을 수 있음 */
  const [calendarContainerHeight, setCalendarContainerHeight] = useState<number | undefined>(
    undefined,
  );

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
  // 홈 뷰타입: calendar(기존 캘린더) | list(월 요약 + 날짜 스트립 + 기록 리스트)
  const [viewType, setViewTypeState] = useState<'calendar' | 'list'>(cachedHomeViewType ?? 'calendar');
  /** 이 기기의 A/B 그룹. 다시 마운트될 때는 이미 정해진 값으로 바로 시작한다 */
  const [homeExperimentGroup, setHomeExperimentGroup] = useState<HomeViewExperimentGroup | null>(
    getResolvedHomeViewExperimentGroup(),
  );
  /** 리스트뷰가 열려 있는지(실험군). 아니면 캘린더뷰만 쓰고 전환 아이콘이 없다 */
  const isListViewEnabled = isHomeListViewEnabled(homeExperimentGroup);
  /**
   * 뷰 타입이 확정됐는지. 처음 한 번 저장소를 읽는 동안은 어느 뷰도 그리지 않고(기본값이 먼저 보이는 것 방지),
   * screen_view도 그 뒤에 보낸다. 다시 마운트될 때는 세션 메모리 값으로 바로 확정된다.
   */
  const [isViewTypeLoaded, setIsViewTypeLoaded] = useState(cachedHomeViewType !== null);
  /** 분석용 화면 이름: 연도 /home-year · 월 캘린더 /home-month-calendar · 월 리스트 /home-month-list */
  const homeScreenName = getHomeScreenName(viewType, periodType);
  const setViewType = useCallback(
    (next: 'calendar' | 'list') => {
      cachedHomeViewType = next;
      setViewTypeState(next);
      void logEvent('ui', {
        screen_name: homeScreenName, // 전환을 누른 시점의 화면
        target: 'view_type_toggle',
        view_type: next,
      });
      AsyncStorage.setItem(HOME_VIEW_TYPE_STORAGE_KEY, next).catch(() => {});
    },
    [homeScreenName],
  );
  useEffect(() => {
    if (cachedHomeViewType !== null) {
      return;
    }
    // A/B 그룹(부트스트랩에서 이미 정해 둠)과 저장된 뷰 선택을 함께 읽어 시작 뷰를 정한다
    Promise.all([resolveHomeViewExperiment(), AsyncStorage.getItem(HOME_VIEW_TYPE_STORAGE_KEY)])
      .then(([group, stored]) => {
        setHomeExperimentGroup(group);
        // 실험군이 아니면 리스트뷰가 없다 → 저장된 값과 상관없이 캘린더. 실험군은 저장된 선택, 없으면 리스트
        const restored: 'calendar' | 'list' = !isHomeListViewEnabled(group)
          ? 'calendar'
          : stored === 'calendar' || stored === 'list'
            ? stored
            : TREATMENT_DEFAULT_VIEW_TYPE;
        // 읽는 사이 사용자가 직접 전환했다면(cache가 채워짐) 그 값을 우선
        if (cachedHomeViewType === null) {
          cachedHomeViewType = restored;
          setViewTypeState(restored);
        }
      })
      .catch(() => {
        // 읽기 실패 → 실험 제외와 같이 캘린더뷰
        if (cachedHomeViewType === null) {
          cachedHomeViewType = 'calendar';
        }
      })
      .finally(() => setIsViewTypeLoaded(true));
  }, []);
  // 배정된 뷰가 처음 그려진 뒤 노출 기록 (control·treatment 모두, 실행당 한 번. 실험 제외는 기록하지 않음)
  useEffect(() => {
    if (!isHomeScreenFocused || !isViewTypeLoaded) {
      return;
    }
    trackHomeViewExposureOnce(homeExperimentGroup);
  }, [homeExperimentGroup, isHomeScreenFocused, isViewTypeLoaded]);
  // 홈이 포커스를 얻을 때·뷰(연도/월 캘린더/월 리스트)가 바뀔 때 뷰별 screen_view
  useEffect(() => {
    if (!isHomeScreenFocused || !isViewTypeLoaded) {
      return;
    }
    void logScreenView(homeScreenName);
  }, [homeScreenName, isHomeScreenFocused, isViewTypeLoaded]);
  const categoryEmojiMap = useCategoryEmojiMap();
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  // Shared year/month state for both TopNavigation and Calendar
  const [currentYear, setCurrentYear] = useState<number>(
    initialPendingTarget?.year ?? new Date().getFullYear(),
  );
  const [currentMonth, setCurrentMonth] = useState<number>(
    initialPendingTarget?.month ?? (new Date().getMonth() + 1),
  ); // 1-12
  /** CalendarMain 마운트 초기 월 — 스와이프마다 prop으로 넘기지 않음 */
  const [calendarBoot] = useState(() => ({
    year: initialPendingTarget?.year ?? new Date().getFullYear(),
    month: initialPendingTarget?.month ?? new Date().getMonth() + 1,
  }));
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
        pathname: '/(tabs)/report',
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
        selectedDate={selectedDate}
        onDayPress={handleCalendarDayPress}
        dayData={calendarData}
        showTitle={false}
        initialYear={calendarBoot.year}
        initialMonth={calendarBoot.month}
        externalView={calendarExternalView}
        onExternalViewApplied={handleCalendarExternalViewApplied}
        monthStartDay={monthStartDay}
        onMonthChange={handleCalendarMonthChange}
        containerHeight={calendarContainerHeight}
        style={styles.calendarFill}
      />
    ),
    [
      selectedDate,
      handleCalendarDayPress,
      calendarData,
      calendarExternalView,
      handleCalendarExternalViewApplied,
      monthStartDay,
      handleCalendarMonthChange,
      calendarContainerHeight,
      calendarBoot.year,
      calendarBoot.month,
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
    initialPendingTarget?.month,
    initialPendingTarget?.targetDate,
    initialPendingTarget?.year,
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
  
  // 홈 탭이 이미 선택된 상태에서 다시 탭 → 중첩 화면 닫고 오늘로 리셋 (NativeTabs 재선택)
  useEffect(() => {
    return tabReselectEvent.subscribe((tabName) => {
      if (tabName !== 'home') {
        return;
      }
      if (router.canDismiss()) {
        router.dismissTo(HOME_STACK_PATHS.index);
      }
      resetToToday().catch((error) => {
        console.error('Error resetting to today:', error);
      });
    });
  }, [resetToToday, router]);
  
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

  const [yearPanResponder] = useState(() =>
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
  );
  
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

  // 기록 저장 후 복귀(targetDate params 또는 pending) 시 초기 페이드 생략.
  // isContentReady는 false→true로만 바뀌는 래치이므로 effect가 아닌 렌더 중 상태 조정으로 처리한다.
  const skipInitialFade = !!params.targetDate || !!peekLatestPendingCalendarTarget();
  if (isReady && skipInitialFade && !isContentReady) {
    setIsContentReady(true);
  }

  useEffect(() => {
    if (!isReady) {
      return;
    }

    // 위 래치로 이미 준비된 경우: 초기 로직(날짜 보정·페이드 대기) 재실행 방지
    if (isContentReady) {
      hasAnimatedRef.current = true;
    }

    // hasAnimatedRef가 true면 isContentReady도 항상 true(모든 설정 지점이 함께 세팅) → 추가 전환 불필요
    if (hasAnimatedRef.current) {
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
          } catch {
            
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

  /** 캘린더뷰 간편입력 알약 → 간편입력 열기. 생성 이벤트의 entry_screen은 home_month_calendar */
  const handleQuickInputPress = useCallback(
    (shortBottomFromScreen: number) =>
      showQuickInput(starScale, starRotate, shortBottomFromScreen, {
        entryScreen: 'home_month_calendar',
      }),
    [showQuickInput, starScale, starRotate]
  );

  /** 리스트뷰 입력창 → 간편입력 입력 UI만 올린다. 생성 이벤트의 entry_screen은 home_month_list */
  const handleListInputPress = useCallback(
    (shortBottomFromScreen: number) =>
      showQuickInput(starScale, starRotate, shortBottomFromScreen, {
        homeList: true,
        entryScreen: 'home_month_list',
      }),
    [showQuickInput, starScale, starRotate],
  );

  /** 리스트뷰 하단 칩 → 해당 패널을 바로 열고, 닫으면 홈으로 복귀 */
  const handleListChipPress = useCallback(
    (action: QuickInputChipAction, shortBottomFromScreen: number) =>
      openQuickInputChipAction(starScale, starRotate, shortBottomFromScreen, action),
    [openQuickInputChipAction, starScale, starRotate],
  );

  /**
   * 기록 수신 안내 카드 → 홈 포커스 후에만 pending 소비.
   * (백그라운드 마운트 홈이 먼저 소비해 버리는 레이스 방지)
   */
  const tryConsumeOpenRecordInboxPending = useCallback(() => {
    if (!isContentReady || !isHomeFocusedRef.current) {
      return;
    }
    const openSource = consumeHomePendingOpenRecordInbox();
    if (!openSource) {
      return;
    }
    // 안내 카드/알림으로 들어와도 홈 dim 버튼을 누른 것과 같은 방식으로 간편입력을 연다.
    // (dim 버튼 위치 측정 → 긴 간편입력 영역 노출 → 키패드 올라오는 모션)
    openQuickInputRecordInboxFromGuideRef.current(
      starScale,
      starRotate,
      () => {
        if (quickInputShortRef.current) {
          quickInputShortRef.current.openWithoutLog();
        } else {
          // 뷰 설정을 읽기 전에 열리는 드문 경우: 현재 뷰 기준으로 entry_screen을 정한다
          showQuickInput(starScale, starRotate, undefined, {
            entryScreen: viewType === 'list' ? 'home_month_list' : 'home_month_calendar',
          });
        }
      },
      openSource,
      homeScreenName,
    );
  }, [homeScreenName, isContentReady, showQuickInput, starRotate, starScale, viewType]);

  useFocusEffect(
    useCallback(() => {
      isHomeFocusedRef.current = true;
      tryConsumeOpenRecordInboxPending();

      let startDelay: ReturnType<typeof setTimeout> | null = null;
      const stopStar = () => {
        if (startDelay != null) {
          clearTimeout(startDelay);
          startDelay = null;
        }
        starAnimRef.current?.stop();
        starAnimRef.current = null;
        starScale.setValue(1);
        starRotate.setValue(0);
      };

      if (isContentReady) {
        startDelay = setTimeout(() => {
          starAnimRef.current = Animated.sequence([
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
              ]),
            ),
          ]);
          starAnimRef.current.start();
        }, 2500);
      }

      return () => {
        isHomeFocusedRef.current = false;
        stopStar();
      };
    }, [tryConsumeOpenRecordInboxPending, isContentReady, starScale, starRotate]),
  );

  useEffect(() => {
    return subscribeHomePendingOpenRecordInbox(() => {
      tryConsumeOpenRecordInboxPending();
    });
  }, [tryConsumeOpenRecordInboxPending]);

  useEffect(() => {
    if (!isContentReady || !isHomeFocusedRef.current) {
      return;
    }
    tryConsumeOpenRecordInboxPending();
  }, [isContentReady, tryConsumeOpenRecordInboxPending]);

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
      screen_name: homeScreenName,
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
  }, [currentMonth, currentYear, effectiveSelectedDate, homeScreenName, router]);

  const handleMonthStatusExpensePress = useCallback(() => {
    void logEvent('ui', {
      screen_name: homeScreenName,
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
  }, [currentMonth, currentYear, effectiveSelectedDate, homeScreenName, router]);

  const handleMonthStatusBalancePress = useCallback(() => {
    void logEvent('ui', {
      screen_name: homeScreenName,
      target: 'report-present',
    });
    router.push({
      pathname: '/(tabs)/report',
      params: {
        year: currentYear.toString(),
        month: currentMonth.toString(),
        tab: 'status',
      },
    });
  }, [currentMonth, currentYear, homeScreenName, router]);

  // ===== 리스트뷰 데이터 =====
  const listMonthItems = useMemo(
    () =>
      viewType === 'list'
        ? buildTimelineItemsFromCalendarData(calendarData, currentYear, currentMonth, monthStartDay)
        : [],
    [viewType, calendarData, currentYear, currentMonth, monthStartDay],
  );

  const listDateKeys = useMemo(() => {
    if (viewType !== 'list') {
      return [];
    }
    const { startDate, endDate } = getCustomMonthRange(currentYear, currentMonth, monthStartDay);
    const keys: string[] = [];
    const cursor = new Date(startDate);
    while (cursor.getTime() <= endDate.getTime()) {
      keys.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return keys;
  }, [viewType, currentYear, currentMonth, monthStartDay]);

  /** 선택일이 현재 월 밖이면(또는 비어 있으면) 오늘 → 월 첫날 순으로 보정 */
  const listSelectedDate = useMemo(() => {
    if (listDateKeys.length === 0) {
      return effectiveSelectedDate;
    }
    if (selectedDate && listDateKeys.includes(selectedDate)) {
      return selectedDate;
    }
    const todayKey = toDateKey(new Date());
    return listDateKeys.includes(todayKey) ? todayKey : listDateKeys[0];
  }, [listDateKeys, selectedDate, effectiveSelectedDate]);

  const listSelectedItems = useMemo(
    () => listMonthItems.filter((item) => item.date === listSelectedDate),
    [listMonthItems, listSelectedDate],
  );

  const handleListSelectDate = useCallback(
    (dateKey: string) => {
      applyHomeCalendarSelection(currentYearRef.current, currentMonthRef.current, dateKey);
    },
    [applyHomeCalendarSelection],
  );

  /** 내역 → 리포트 탭의 소비 현황 서브탭 (tab: 'trend'. 'status'는 소비 리포트로 가는 기존 홈 잔액 카드 전용) */
  const handleListDetailPress = useCallback(() => {
    if (isNavigating.current) {
      return;
    }
    isNavigating.current = true;
    void logEvent('ui', {
      screen_name: homeScreenName,
      target: 'report-present',
      entry_point: 'home_list_detail',
    });
    router.push({
      pathname: '/(tabs)/report',
      params: {
        year: currentYear.toString(),
        month: currentMonth.toString(),
        tab: 'trend',
        ts: Date.now().toString(),
      },
    });
    setTimeout(() => {
      isNavigating.current = false;
    }, 500);
  }, [currentMonth, currentYear, homeScreenName, router]);

  const handleListItemPress = useCallback(
    (item: TimelineListItem) => {
      if (isNavigating.current) {
        return;
      }
      isNavigating.current = true;
      void logEvent('ui', {
        screen_name: homeScreenName,
        target: 'list_record',
        record_type: item.type,
      });
      router.push({
        pathname: item.type === 'income' ? '/income-edit' : '/expense-edit',
        params: {
          recordData: JSON.stringify(item),
          dateKey: item.date,
          recordIndex: String(item.actualRecordIndex ?? 0),
          calendarYear: currentYear.toString(),
          calendarMonth: currentMonth.toString(),
        },
      });
      setTimeout(() => {
        isNavigating.current = false;
      }, 500);
    },
    [currentMonth, currentYear, homeScreenName, router],
  );

  /**
   * 리스트뷰 좌우 스와이프 월 전환 (타임라인과 동일: 왼쪽 → 다음 달, 오른쪽 → 이전 달).
   * 월이 바뀌면 선택일을 새 달의 기록일로 맞춘다: 이전 달 → 마지막 기록일, 다음 달 → 첫 기록일
   * (기록이 없는 달이면 오늘 또는 첫날).
   * 선택일이 곧 기록 생성 날짜라서 화면과 어긋나지 않게 한다.
   */
  const handleListShiftMonth = useCallback(
    (delta: -1 | 1) => {
      const index = currentYearRef.current * 12 + (currentMonthRef.current - 1) + delta;
      const nextYear = Math.floor(index / 12);
      const nextMonth = (index % 12) + 1;
      if (nextYear < yearBounds.min || nextYear > yearBounds.max) {
        return;
      }
      // 이전 달로 가면 그 달의 마지막 기록일, 다음 달로 가면 첫 기록일.
      // (타임라인 목록은 최신 날짜 순이라 첫 항목이 마지막 날, 마지막 항목이 첫 날)
      const monthItems = buildTimelineItemsFromCalendarData(
        calendarData,
        nextYear,
        nextMonth,
        monthStartDay,
      );
      const recordDate = (delta < 0 ? monthItems[0] : monthItems[monthItems.length - 1])?.date;
      if (recordDate) {
        applyHomeCalendarSelection(nextYear, nextMonth, recordDate);
        return;
      }
      // 기록이 없는 달: 그 달에 오늘이 있으면 오늘, 아니면 첫날
      const { startDate, endDate } = getCustomMonthRange(nextYear, nextMonth, monthStartDay);
      const today = new Date();
      const target = today >= startDate && today <= endDate ? today : startDate;
      applyHomeCalendarSelection(nextYear, nextMonth, toDateKey(target));
    },
    [applyHomeCalendarSelection, calendarData, monthStartDay, yearBounds.max, yearBounds.min],
  );
  const handleListSwipeNextMonth = useCallback(() => handleListShiftMonth(1), [handleListShiftMonth]);
  const handleListSwipePrevMonth = useCallback(() => handleListShiftMonth(-1), [handleListShiftMonth]);

  /** 카드 영역 하단 = 하단 칩 위 12px (시안: 카드 끝 1656 ↔ 칩 시작 1668). 콘텐츠 영역은 탭바 inset만큼 이미 위로 올라와 있다 */
  const listCardBottomInset = Math.max(0, quickInputBottom + LIST_DOCK_HEIGHT + 12 - bottomContentInset);

  const homeListViewElement = useMemo(
    () => (
      <HomeListView
        dateKeys={listDateKeys}
        selectedDate={listSelectedDate}
        items={listSelectedItems}
        summaryLabel={`${currentMonth}월 잔액`}
        summaryAmount={Number(financialData.balance) || 0}
        countUpActive={isHomeScreenFocused && isReady}
        countUpResetKey={`${currentYear}-${currentMonth}`}
        onSwipeNextMonth={handleListSwipeNextMonth}
        onSwipePrevMonth={handleListSwipePrevMonth}
        categoryEmojiMap={categoryEmojiMap}
        bottomInset={listCardBottomInset}
        onSelectDate={handleListSelectDate}
        onDetailPress={handleListDetailPress}
        onItemPress={handleListItemPress}
      />
    ),
    [
      listDateKeys,
      listSelectedDate,
      listSelectedItems,
      currentMonth,
      financialData.balance,
      isHomeScreenFocused,
      isReady,
      categoryEmojiMap,
      listCardBottomInset,
      handleListSelectDate,
      handleListDetailPress,
      handleListItemPress,
      handleListSwipeNextMonth,
      handleListSwipePrevMonth,
      currentYear,
    ],
  );

  const homeMonthStatusElement = useMemo(
    () => (
      <HomeMonthStatusCard
        incomeText={monthlyIncomeText}
        expenseText={monthlyExpenseText}
        balanceText={monthlyBalanceText}
        incomeAmount={Number(financialData.income) || 0}
        expenseAmount={Number(financialData.expense) || 0}
        balanceAmount={Number(financialData.balance) || 0}
        countUpActive={isHomeScreenFocused && isReady}
        countUpResetKey={`${currentYear}-${currentMonth}`}
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
      financialData.income,
      financialData.expense,
      currentYear,
      currentMonth,
      isHomeScreenFocused,
      isReady,
      handleMonthStatusIncomePress,
      handleMonthStatusExpensePress,
      handleMonthStatusBalancePress,
    ],
  );

  // iOS/Android 위젯에 이번달 소비 요약 데이터 동기화
  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
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
          viewType={viewType}
          // 리스트뷰는 실험군에만 있다. 그 밖의 그룹은 전환 아이콘을 숨긴다 (TopNavigation은 핸들러가 있을 때만 아이콘을 그린다)
          onViewTypeChange={isListViewEnabled ? setViewType : undefined}
          periodToggleAnalyticsScreenName={homeScreenName}
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
        // inset은 Animated 바깥 — padding/opacity가 flex 높이를 삼키지 않게 분리
        <View
          style={[
            styles.monthViewContent,
            { paddingBottom: bottomContentInset },
            // 리스트뷰: 시안처럼 회색 배경이 하단 독 뒤(탭바 위)까지 이어진다
            viewType === 'list' && { backgroundColor: palette.fill },
          ]}
        >
          <Animated.View
            style={[styles.monthViewInner, { opacity: isContentReady ? contentOpacity : 0 }]}
          >
            {!isViewTypeLoaded ? null : viewType === 'list' ? (
              homeListViewElement
            ) : (
              <>
                {homeMonthStatusElement}

                {/* flex 남은 높이 측정 → containerHeight로 dayCell 확장 (숏·탭바와 겹치지 않게) */}
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
              </>
            )}
          </Animated.View>
        </View>
      ) : (
        <View
          style={[styles.yearViewContent, { paddingBottom: bottomContentInset }]}
          {...yearPanResponder.panHandlers}
        >
          <YearView
            ref={yearViewRef}
            year={currentYear}
            monthsData={yearData}
            onMonthPress={handleYearMonthPress}
            yearCardAnalyticsScreenName={homeScreenName}
          />
        </View>
      )}

      {periodType === 'month' &&
        isAtLeastVersion(Constants.expoConfig?.version, QUICK_INPUT_MIN_VERSION) && (
        <View
          collapsable={false}
          style={[
            styles.quickInputAnchor,
            isQuickInputShortHidden && styles.quickInputShortHidden,
          ]}
          pointerEvents={isQuickInputShortHidden ? 'none' : 'box-none'}
        >
          {!isViewTypeLoaded ? null : viewType === 'list' ? (
            <HomeListQuickInputDock
              controlRef={quickInputShortRef}
              bottom={quickInputBottom}
              onInputPress={handleListInputPress}
              onChipPress={handleListChipPress}
              starScale={starScale}
              starRotate={starRotate}
              fieldHidden={isHomeListInputRaised}
            />
          ) : (
            <QuickInputShort
              controlRef={quickInputShortRef}
              bottom={quickInputBottom}
              onPress={handleQuickInputPress}
              starScale={starScale}
              starRotate={starRotate}
            />
          )}
        </View>
      )}

      {/* FAB: 간편입력과 같은 SafeArea 오버레이, 앵커는 분리 */}
      <View collapsable={false} style={styles.fabAnchor} pointerEvents="box-none">
        <Pressable
          style={[
            styles.fab,
            styles.fabShadow,
            {
              backgroundColor: palette.primary,
              bottom: quickInputBottom,
            },
          ]}
          onPress={() => createSheetEvent.emit()}
          accessibilityRole="button"
          accessibilityLabel="기록 또는 챌린지 선택"
        >
          <Icon name="addTaskFab" variant="line" size={24} color={palette.staticWhite} />
        </Pressable>
      </View>

    </SafeAreaView>

      {/* 기록 수신 안내 카드는 root-layout-shell 전역 마운트 */}
      {isContentReady && <NoticeCard analyticsScreenName={homeScreenName} />}
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
  quickInputAnchor: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 10,
  },
  fabAnchor: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
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
    elevation: 21,
  },
  quickInputShortHidden: {
    opacity: 0,
  },
  monthViewContent: {
    flex: 1,
  },
  monthViewInner: {
    flex: 1,
  },
  yearViewContent: {
    flex: 1,
  },
  calendarContainer: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  calendarFill: {
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
