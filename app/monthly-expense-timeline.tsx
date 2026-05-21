/**
 * Monthly Expense Timeline Screen
 * 
 * Shows timeline of expenses and income for a selected month.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { Tag } from '@/components/ui/tag';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { persistPendingCalendarTarget } from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';

import { buildTimelineItemsFromCalendarData, type TimelineListItem } from '@/utils/timeline-from-calendar';
import { logEvent } from '@/utils/analytics';
import { getRouteParamNumber, getRouteParamString } from '@/utils/route-params';
import { loadCategories } from '@/utils/categories';
import { getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import { initializePaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GlassSurface } from '@/components/ui/glass-surface';
import { BlurRuntime } from '@/constants/blur-runtime';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  InteractionManager,
  Platform,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** dateStripContent paddingHorizontal과 동일 — 스크롤 오프셋·레이아웃 일치 */
const DATE_STRIP_PADDING_HORIZONTAL = 8;

// 카테고리별 이모지 매핑 (통합 카테고리 로드)
const useCategoryEmojiMap = () => {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([loadCategories('expense'), loadCategories('income')])
      .then(([expense, income]) => {
        const next: Record<string, string> = {};
        [...expense, ...income].forEach((c) => {
          next[c.label] = c.emoji;
        });
        setMap(next);
      })
      .catch(() => {
        // 로드 실패 시 빈 맵 유지
      });
  }, []);

  return map;
};

type TimelineItem = TimelineListItem;

interface ChallengeData {
  id: string;
  category: string;
  startDate: string; // YYYY.MM.DD
  endDate: string; // YYYY.MM.DD
  targetAmount: number;
  createdAt: number;
  recurringId: string; // 반복 챌린지의 그룹 ID
}

const TIMELINE_PAYMENT_FILTER_STORAGE_KEY = 'monthlyTimelinePaymentFilter';
const STANDARD_PAYMENT_FILTER_KEYS = ['cash', 'income'] as const;

function buildAllPaymentFilterKeyIds(subtypes: PaymentSubtype[]): string[] {
  return [...subtypes.map((item) => item.id), ...STANDARD_PAYMENT_FILTER_KEYS];
}

function mergePaymentFilterKeys(current: string[], idsToAdd: string[]): string[] {
  const next = [...current];
  for (const id of idsToAdd) {
    if (!next.includes(id)) {
      next.push(id);
    }
  }
  return next;
}

export default function MonthlyExpenseTimelineScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const categoryEmojiMap = useCategoryEmojiMap();
  const { calendarData, monthStartDay, isReady, dataVersion } = useAppData();
  const router = useRouter();
  const navigation = useNavigation();
  const [showPaymentFilterSheet, setShowPaymentFilterSheet] = useState(false);
  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>([]);
  const [paymentFilterKeys, setPaymentFilterKeys] = useState<string[]>([]);
  const [draftPaymentFilterKeys, setDraftPaymentFilterKeys] = useState<string[]>([]);
  const [shouldInitPaymentFilterDefaults, setShouldInitPaymentFilterDefaults] = useState(false);
  const [shouldBackfillMissingFilterOptions, setShouldBackfillMissingFilterOptions] = useState(false);
  const [isPaymentFilterLoaded, setIsPaymentFilterLoaded] = useState(false);
  const prevPaymentSubtypeIdsRef = useRef<string[] | null>(null);
  const handleFilterPress = useCallback(() => {
    void logEvent('ui', {
      screen_name: '/monthly-expense-timeline',
      target: 'filter',
    });
    void logEvent('sheet_view', {
      screen_name: '/monthly-expense-timeline',
      target: 'filter',
    });
    setDraftPaymentFilterKeys(paymentFilterKeys);
    setShowPaymentFilterSheet(true);
  }, [paymentFilterKeys]);

  useEffect(() => {
    let active = true;
    const loadFilterState = async () => {
      try {
        let stored = await AsyncStorage.getItem(TIMELINE_PAYMENT_FILTER_STORAGE_KEY);
        if (!stored) {
          const outdatedStored = await AsyncStorage.getItem('monthlyTimelinePaymentFilter_v1');
          if (outdatedStored) {
            stored = outdatedStored;
            await AsyncStorage.setItem(TIMELINE_PAYMENT_FILTER_STORAGE_KEY, outdatedStored);
            await AsyncStorage.removeItem('monthlyTimelinePaymentFilter_v1');
          }
        }
        if (!active) return;
        if (!stored) {
          setShouldInitPaymentFilterDefaults(true);
          return;
        }
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed) && parsed.every((key) => typeof key === 'string')) {
          const storedKeys = parsed as string[];
          if (storedKeys.length === 0) {
            setPaymentFilterKeys([]);
            setShouldInitPaymentFilterDefaults(false);
          } else {
            setPaymentFilterKeys(storedKeys);
            setShouldInitPaymentFilterDefaults(false);
            setShouldBackfillMissingFilterOptions(true);
          }
          return;
        }
        // legacy 단일 선택 포맷 → 전체 선택 기본값
        setShouldInitPaymentFilterDefaults(true);
      } catch {
        if (active) {
          setShouldInitPaymentFilterDefaults(true);
        }
      } finally {
        if (active) {
          setIsPaymentFilterLoaded(true);
        }
      }
    };
    void loadFilterState();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isPaymentFilterLoaded) return;
    if (shouldInitPaymentFilterDefaults) return;
    void AsyncStorage.setItem(TIMELINE_PAYMENT_FILTER_STORAGE_KEY, JSON.stringify(paymentFilterKeys)).catch(() => {
      // ignore
    });
  }, [isPaymentFilterLoaded, paymentFilterKeys, shouldInitPaymentFilterDefaults]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const loadSubtypes = async () => {
        try {
          const subtypes = await initializePaymentSubtypes();
          if (!active) return;
          setPaymentSubtypes(subtypes);
        } catch {
          // ignore
        }
      };
      void loadSubtypes();
      return () => {
        active = false;
      };
    }, [])
  );

  const creditSubtypes = useMemo(
    () => paymentSubtypes.filter((item) => item.type === 'credit'),
    [paymentSubtypes]
  );
  const debitSubtypes = useMemo(
    () => paymentSubtypes.filter((item) => item.type === 'debit'),
    [paymentSubtypes]
  );
  const paymentFilterOptions = useMemo(
    () => [
      ...creditSubtypes.map((item) => ({
        type: 'subtype' as const,
        id: item.id,
        label: item.label,
        description: item.description,
        color: item.color,
      })),
      ...debitSubtypes.map((item) => ({
        type: 'subtype' as const,
        id: item.id,
        label: item.label,
        description: item.description,
        color: item.color,
      })),
      { type: 'cash' as const, id: 'cash', label: '현금', description: '' },
      { type: 'income' as const, id: 'income', label: '수입', description: '' },
    ],
    [creditSubtypes, debitSubtypes]
  );

  const allPaymentFilterKeyIds = useMemo(
    () => buildAllPaymentFilterKeyIds(paymentSubtypes),
    [paymentSubtypes],
  );

  const paymentFilterValidKeySet = useMemo(() => new Set(allPaymentFilterKeyIds), [allPaymentFilterKeyIds]);

  useEffect(() => {
    if (!shouldInitPaymentFilterDefaults) return;
    if (paymentSubtypes.length === 0) return;

    const allKeys = buildAllPaymentFilterKeyIds(paymentSubtypes);
    setPaymentFilterKeys(allKeys);
    setDraftPaymentFilterKeys(allKeys);
    setShouldInitPaymentFilterDefaults(false);
    setShouldBackfillMissingFilterOptions(false);
    prevPaymentSubtypeIdsRef.current = paymentSubtypes.map((item) => item.id);
  }, [paymentSubtypes, shouldInitPaymentFilterDefaults]);

  useEffect(() => {
    if (!isPaymentFilterLoaded || shouldInitPaymentFilterDefaults) return;
    if (!shouldBackfillMissingFilterOptions) return;
    if (paymentSubtypes.length === 0) return;

    const allKeys = buildAllPaymentFilterKeyIds(paymentSubtypes);
    setPaymentFilterKeys((prev) => {
      const missingIds = allKeys.filter((id) => !prev.includes(id));
      return missingIds.length > 0 ? mergePaymentFilterKeys(prev, missingIds) : prev;
    });
    setDraftPaymentFilterKeys((prev) => {
      const missingIds = allKeys.filter((id) => !prev.includes(id));
      return missingIds.length > 0 ? mergePaymentFilterKeys(prev, missingIds) : prev;
    });
    setShouldBackfillMissingFilterOptions(false);
    prevPaymentSubtypeIdsRef.current = paymentSubtypes.map((item) => item.id);
  }, [
    isPaymentFilterLoaded,
    paymentSubtypes,
    shouldBackfillMissingFilterOptions,
    shouldInitPaymentFilterDefaults,
  ]);

  useEffect(() => {
    if (!isPaymentFilterLoaded) return;
    if (paymentSubtypes.length === 0) return;

    setPaymentFilterKeys((prev) => prev.filter((key) => paymentFilterValidKeySet.has(key)));
    setDraftPaymentFilterKeys((prev) => prev.filter((key) => paymentFilterValidKeySet.has(key)));
  }, [isPaymentFilterLoaded, paymentFilterValidKeySet, paymentSubtypes.length]);

  useEffect(() => {
    if (!isPaymentFilterLoaded || shouldInitPaymentFilterDefaults) return;

    const subtypeIds = paymentSubtypes.map((item) => item.id);
    const prevSubtypeIds = prevPaymentSubtypeIdsRef.current;
    prevPaymentSubtypeIdsRef.current = subtypeIds;

    if (prevSubtypeIds === null) return;

    const addedSubtypeIds = subtypeIds.filter((id) => !prevSubtypeIds.includes(id));
    if (addedSubtypeIds.length === 0) return;

    setPaymentFilterKeys((prev) => mergePaymentFilterKeys(prev, addedSubtypeIds));
    setDraftPaymentFilterKeys((prev) => mergePaymentFilterKeys(prev, addedSubtypeIds));
  }, [isPaymentFilterLoaded, paymentSubtypes, shouldInitPaymentFilterDefaults]);

  // Year/Month options for picker (홈 화면과 동일하게 ±10년)
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

  const monthOptions = useMemo(() => {
    const months = [];
    for (let i = 1; i <= 12; i++) {
      months.push({ label: `${i}월`, value: i });
    }
    return months;
  }, []);
  
  // Params from home screen
  const params = useLocalSearchParams<{
    year?: string;
    month?: string;
    selectedDate?: string;
    tab?: string;
  }>();
  
  // 실제 현재 날짜 (개발자 모드 오버라이드와 분리)
  const realCurrentDate = {
    getFullYear: () => 2025,
    getMonth: () => 9, // 10월 (0부터 시작)
    getDate: () => 21
  };
  
  const routeYear = getRouteParamNumber(params.year);
  const routeMonth = getRouteParamNumber(params.month);
  const routeSelectedDate = getRouteParamString(params.selectedDate);

  const [currentYear, setCurrentYear] = useState(routeYear ?? realCurrentDate.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(routeMonth ?? realCurrentDate.getMonth() + 1);
  
  const year = currentYear;
  const month = currentMonth;
  const initialYearParam = routeYear;
  const initialMonthParam = routeMonth;

  const defaultTargetDate = useMemo(
    () => `${year}-${String(month).padStart(2, '0')}-01`,
    [year, month]
  );
  const targetDateFromSelection = useMemo(() => {
    const hasValidSelectedDate =
      routeSelectedDate != null && /^\d{4}-\d{2}-\d{2}$/.test(routeSelectedDate);

    // 홈에서 전달받은 최초 선택 날짜는 최초 진입 월에서만 유지하고,
    // 타임라인 내부에서 월을 바꾼 경우에는 현재 월 1일 기준으로 복귀 컨텍스트를 맞춘다.
    if (
      hasValidSelectedDate &&
      initialYearParam === year &&
      initialMonthParam === month
    ) {
      return routeSelectedDate;
    }

    return defaultTargetDate;
  }, [defaultTargetDate, initialMonthParam, initialYearParam, month, routeSelectedDate, year]);

  // 날짜 선택 UI에서 선택한 날짜 — 탭 시 갱신, 최초 진입 시 params와 동기화
  const [pickedDateForWeek, setPickedDateForWeek] = useState(targetDateFromSelection);
  const prevMonthRef = useRef<{ year: number; month: number } | null>(null);
  /** 월 변경 직후 refreshData가 포커스를 설정할 때까지 1일 보정 effect가 개입하지 않도록 */
  const pendingMonthFocusRef = useRef(false);
  /** 진입/월 전환 시 false(애니메이션 없음), 날짜 탭 시 true(애니메이션) */
  const scrollAnimatedRef = useRef(false);

  // 월 변경 감지: 반드시 targetDateFromSelection effect보다 먼저 실행되어야 함
  // (targetDateFromSelection이 1일로 덮어쓰는 것을 막기 위해 pendingMonthFocusRef를 선설정)
  useEffect(() => {
    const prev = prevMonthRef.current;
    if (prev === null) {
      prevMonthRef.current = { year, month };
      return;
    }
    if (prev.year !== year || prev.month !== month) {
      prevMonthRef.current = { year, month };
      pendingMonthFocusRef.current = true;
      // 스와이프/월 변경 시 페이드아웃
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [year, month]);

  // 최초 진입 시 params와 동기화. 월 변경 직후는 refreshData가 마지막 기록일로 설정하므로 건너뜀
  useEffect(() => {
    if (pendingMonthFocusRef.current) return;
    scrollAnimatedRef.current = false;
    shouldScrollTimelineToDateRef.current = true; // 홈에서 진입 시 선택 날짜로 타임라인 스크롤
    setPickedDateForWeek(targetDateFromSelection);
  }, [targetDateFromSelection]);

  // 해당 월(커스텀 월 시작일 기준) 시작일~마지막일 전체 날짜 배열
  const monthDates = useMemo(() => {
    const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
    const out: string[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      out.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [year, month, monthStartDay]);

  const weekDayLabels = ['일', '월', '화', '수', '목', '금', '토'];

  const dateStripScrollRef = useRef<ScrollView>(null);
  const timelineScrollRef = useRef<ScrollView>(null);
  const DATE_CELL_WIDTH = 42;
  /** 날짜 스트립 선택 원형 (calendar-day-select와 동일한 Android 클리핑 패턴) */
  const WEEK_DAY_CIRCLE_SIZE = 36;
  const WEEK_DAY_CIRCLE_RADIUS = WEEK_DAY_CIRCLE_SIZE / 2;
  /** 날짜 스트립 스크롤 애니메이션 duration (ms) - 타임라인 스크롤 완료 후 포커스 이동 시 사용 */
  const DATE_STRIP_SCROLL_DURATION_MS = 400;
  const dateStripScrollXRef = useRef(0);
  /** 타임라인 날짜 섹션별 레이아웃 (스크롤 기반 포커스용) */
  const dateSectionLayoutsRef = useRef<Map<string, { top: number; height: number }>>(new Map());
  /** 날짜 탭/초기 진입 시 타임라인 스크롤 필요 */
  const shouldScrollTimelineToDateRef = useRef(false);

  // 선택일이 해당 월 범위에 없으면 첫날로 보정 (월 변경 직후는 refreshData에서 한 번만 설정하므로 제외)
  useEffect(() => {
    if (monthDates.length === 0 || monthDates.includes(pickedDateForWeek) || pendingMonthFocusRef.current) return;
    scrollAnimatedRef.current = false;
    setPickedDateForWeek(monthDates[0]);
  }, [monthDates, pickedDateForWeek]);

  // 선택일 변경 시 해당 날짜가 가운데로 오도록 가로 스크롤
  const dateStripScrollAnimRef = useRef(new Animated.Value(0)).current;
  const scrollDateStripToPicked = useCallback(() => {
    const idx = monthDates.indexOf(pickedDateForWeek);
    if (idx < 0 || !dateStripScrollRef.current) {
      return false;
    }
    const viewportWidth = Dimensions.get('window').width;
    const cellCenterInContent =
      DATE_STRIP_PADDING_HORIZONTAL + idx * DATE_CELL_WIDTH + DATE_CELL_WIDTH / 2;
    const contentWidth =
      DATE_STRIP_PADDING_HORIZONTAL * 2 + monthDates.length * DATE_CELL_WIDTH;
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    const x = Math.max(0, Math.min(cellCenterInContent - viewportWidth / 2, maxScroll));
    const animated = scrollAnimatedRef.current;
    scrollAnimatedRef.current = true;

    if (animated) {
      const fromX = dateStripScrollXRef.current;
      if (Math.abs(fromX - x) < 1) {
        return true;
      }
      dateStripScrollAnimRef.setValue(0);
      const listenerId = dateStripScrollAnimRef.addListener(({ value }) => {
        const currentX = fromX + (x - fromX) * value;
        dateStripScrollRef.current?.scrollTo({ x: currentX, animated: false });
        dateStripScrollXRef.current = currentX;
      });
      Animated.timing(dateStripScrollAnimRef, {
        toValue: 1,
        duration: DATE_STRIP_SCROLL_DURATION_MS,
        useNativeDriver: false,
      }).start(({ finished }) => {
        dateStripScrollAnimRef.removeListener(listenerId);
        if (finished) {
          dateStripScrollXRef.current = x;
        }
      });
    } else {
      dateStripScrollRef.current.scrollTo({ x, animated: false });
      dateStripScrollXRef.current = x;
    }
    return true;
  }, [dateStripScrollAnimRef, monthDates, pickedDateForWeek]);

  // 날짜 스트립 스크롤: Android는 전환·레이아웃 안정 후 1회 (onLayout 연쇄 스크롤로 상단 들썩임 방지)
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const runScroll = () => {
      if (cancelled) {
        return;
      }
      if (!scrollDateStripToPicked()) {
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            scrollDateStripToPicked();
          }
        }, Platform.OS === 'android' ? 80 : 50);
      }
    };

    if (Platform.OS === 'android') {
      const interaction = InteractionManager.runAfterInteractions(runScroll);
      return () => {
        cancelled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        interaction.cancel();
      };
    }

    runScroll();
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [monthDates.length, pickedDateForWeek, scrollDateStripToPicked]);

  // 홈 focus보다 먼저 blur/beforeRemove에서 pending 저장 (Android 제스처 뒤로가기 대응)
  const persistPendingForHome = useCallback(() => {
    const targetDate = pickedDateForWeek;
    void persistPendingCalendarTarget({ year, month, targetDate });
  }, [month, pickedDateForWeek, year]);

  useEffect(() => {
    const unsubBlur = navigation.addListener('blur', persistPendingForHome);
    const unsubBeforeRemove = navigation.addListener('beforeRemove', persistPendingForHome);
    return () => {
      unsubBlur();
      unsubBeforeRemove();
    };
  }, [navigation, persistPendingForHome]);
  
  const timelineItems = useMemo(
    () => buildTimelineItemsFromCalendarData(calendarData, year, month, monthStartDay),
    [calendarData, dataVersion, month, monthStartDay, year],
  );

  const paymentFilterSheetHeight = useMemo(() => windowHeight * 0.8, [windowHeight]);
  const paymentFilterSheetContentHeight = useMemo(() => paymentFilterSheetHeight - 56, [paymentFilterSheetHeight]);

  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  // 월 변경 직후: 마지막 기록일 포커스 + 페이드인 (AsyncStorage 재로드 없음)
  useEffect(() => {
    if (!pendingMonthFocusRef.current) {
      return;
    }

    const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
    const datesThisMonth: string[] = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const y = cur.getFullYear();
      const m = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      datesThisMonth.push(`${y}-${m}-${d}`);
      cur.setDate(cur.getDate() + 1);
    }
    const datesWithRecord = [...new Set(timelineItems.map((i) => i.date))].sort();
    const lastWithRecord = datesWithRecord.length > 0 ? datesWithRecord[datesWithRecord.length - 1]! : null;
    const focusDate = lastWithRecord ?? datesThisMonth[0]!;
    scrollAnimatedRef.current = false;
    setPickedDateForWeek(focusDate);
    pendingMonthFocusRef.current = false;

    requestAnimationFrame(() => {
      setIsContentReady(true);
      hasAnimatedRef.current = true;
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [contentOpacity, month, monthStartDay, timelineItems, year]);

  // 최초 진입 페이드인 — 재방문 시 전역 로딩/페이드아웃 없음
  useEffect(() => {
    if (!isReady || pendingMonthFocusRef.current) {
      return;
    }
    if (hasAnimatedRef.current) {
      setIsContentReady(true);
      contentOpacity.setValue(1);
      return;
    }
    setIsContentReady(true);
    hasAnimatedRef.current = true;
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity, isReady]);

  const defaultCreditSubtypeId = useMemo(
    () => creditSubtypes[0]?.id,
    [creditSubtypes]
  );
  const defaultDebitSubtypeId = useMemo(
    () => debitSubtypes[0]?.id,
    [debitSubtypes]
  );

  const filteredTimelineData = useMemo(() => {
    if (paymentFilterKeys.length === 0) return [];
    const selectedKeySet = new Set(paymentFilterKeys);

    return timelineItems.filter((item) => {
      if (item.type === 'income') return selectedKeySet.has('income');
      if (item.paymentMethod === 'cash') return selectedKeySet.has('cash');
      const resolvedSubtypeId =
        item.paymentSubtypeId ??
        (item.paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId);
      return typeof resolvedSubtypeId === 'string' ? selectedKeySet.has(resolvedSubtypeId) : false;
    });
  }, [defaultCreditSubtypeId, defaultDebitSubtypeId, paymentFilterKeys, timelineItems]);

  // Calculate monthly totals
  const monthlyTotals = useMemo(() => {
    let income = 0;
    let expense = 0;
    
    filteredTimelineData.forEach((item) => {
      if (item.type === 'income') {
        income += item.amount;
      } else {
        expense += item.amount;
      }
    });
    
    return { income, expense };
  }, [filteredTimelineData]);

  
  // Group timeline items by date
  const groupedTimeline = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    
    filteredTimelineData.forEach((item) => {
      if (!groups[item.date]) {
        groups[item.date] = [];
      }
      groups[item.date].push(item);
    });
    
    return groups;
  }, [filteredTimelineData]);

  // 월/데이터 변경 시 레이아웃 캐시 초기화 (이전 월 레이아웃으로 잘못 매칭되는 것 방지)
  const timelineDateKeysRef = useRef<string>('');
  useEffect(() => {
    const keys = Object.keys(groupedTimeline).join(',');
    if (timelineDateKeysRef.current !== keys) {
      timelineDateKeysRef.current = keys;
      dateSectionLayoutsRef.current.clear();
    }
  }, [groupedTimeline]);

  const scrollTimelineToPickedDate = useCallback(
    (animated: boolean) => {
      if (!shouldScrollTimelineToDateRef.current) {
        return false;
      }
      if (!(pickedDateForWeek in groupedTimeline)) {
        return false;
      }
      const layout = dateSectionLayoutsRef.current.get(pickedDateForWeek);
      if (!layout || !timelineScrollRef.current) {
        return false;
      }
      timelineScrollRef.current.scrollTo({ y: layout.top, animated });
      shouldScrollTimelineToDateRef.current = false;
      return true;
    },
    [groupedTimeline, pickedDateForWeek],
  );

  // 날짜 탭/초기 진입 시: 해당 날짜 섹션이 뷰포트 최상단에 오도록 타임라인 스크롤 (기록이 있는 날짜만)
  useEffect(() => {
    if (!isContentReady) {
      return;
    }
    if (!shouldScrollTimelineToDateRef.current) {
      return;
    }
    if (!(pickedDateForWeek in groupedTimeline)) {
      return;
    }

    const animated = scrollAnimatedRef.current;
    const delays = Platform.OS === 'android' ? [0, 120, 280] : [0, 200];
    const timeouts = delays.map((ms) =>
      setTimeout(() => {
        scrollTimelineToPickedDate(animated);
      }, ms),
    );
    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [groupedTimeline, isContentReady, pickedDateForWeek, scrollTimelineToPickedDate]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 1) {
        setCurrentYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 12) {
        setCurrentYear((prevYear) => prevYear + 1);
        return 1;
      }
      return prevMonth + 1;
    });
  }, []);

  const timelinePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const SWIPE_THRESHOLD = 50;
        const { dx } = gestureState;
        if (dx <= -SWIPE_THRESHOLD || dx >= SWIPE_THRESHOLD) {
          if (dx <= -SWIPE_THRESHOLD) handleNextMonth();
          else handlePrevMonth();
        }
      },
    })
  ).current;

  const handleBackPress = useCallback(() => {
    void (async () => {
      const targetDate = pickedDateForWeek;
      await persistPendingCalendarTarget({ year, month, targetDate });

      if (router.canGoBack()) {
        router.back();
        return;
      }
      // 스택이 없는 진입에서도 홈 월 컨텍스트를 유지하도록 파라미터 전달
      router.replace({
        pathname: '/(tabs)/home',
        params: {
          targetYear: year.toString(),
          targetMonth: month.toString(),
          targetDate,
        },
      });
    })();
  }, [month, router, pickedDateForWeek, year]);
  
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {/* Top Navigation + 날짜 스트립: Android 진입 시 SafeAreaView 지연 보정으로 들썩이지 않도록 고정 영역 */}
      <View style={styles.timelineHeader} collapsable={false}>
        <TopNavigation
          type="sub"
          title=""
          showDay
          dateText={`${year}년 ${String(month).padStart(2, '0')}월`}
          showLeftIcon
          onLeftIconPress={handleBackPress}
          showDropdownArrow
          yearOptions={yearOptions}
          selectedYear={year}
          onYearChange={(newYear) => {
            const minYear = yearOptions[0]?.value ?? newYear;
            const maxYear = yearOptions[yearOptions.length - 1]?.value ?? newYear;
            const clampedYear = Math.min(maxYear, Math.max(minYear, newYear));
            setCurrentYear(clampedYear);
          }}
          monthOptions={monthOptions}
          selectedMonth={month}
          onMonthChange={(newMonth) => {
            // 홈 화면과 동일하게 단순화 - 년도/월을 독립적으로 변경
            setCurrentMonth(newMonth);
          }}
        />

      {/* 날짜 선택: 해당 월 시작일~마지막일만 스크롤 - 고정 (애니메이션 제외) */}
      <View style={styles.weekRowWrap}>
        <View style={[styles.weekRow, { backgroundColor: colors.fill }]}>
          <ScrollView
            ref={dateStripScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateStripContent}
            bounces={false}
            overScrollMode="never"
            onScroll={(e) => {
              dateStripScrollXRef.current = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={16}
          >
            {monthDates.map((dateStr) => {
              const isSelected = dateStr === pickedDateForWeek;
              const hasRecord = dateStr in groupedTimeline;
              const d = new Date(dateStr + 'T12:00:00');
              const dayNum = d.getDate();
              const dayLabel = weekDayLabels[d.getDay()];

              const handleDateStripPress = () => {
                void logEvent('ui', {
                  screen_name: '/monthly-expense-timeline',
                  target: 'timeline_day_strip',
                  selected_date: dateStr,
                });
                scrollAnimatedRef.current = true;
                shouldScrollTimelineToDateRef.current = true;
                setPickedDateForWeek(dateStr);
              };

              return (
                <View key={dateStr} style={[styles.weekDayCell, { width: DATE_CELL_WIDTH }]}>
                  <Text style={[styles.weekDayLabel, { color: colors.textAssistive }]}>
                    {dayLabel}
                  </Text>
                  <Pressable
                    onPress={handleDateStripPress}
                    style={styles.weekDayCirclePressable}
                    hitSlop={{ top: 28, bottom: 12, left: 3, right: 3 }}
                    android_ripple={
                      Platform.OS === 'android'
                        ? {
                            color: isSelected
                              ? 'rgba(255, 255, 255, 0.35)'
                              : 'rgba(54, 100, 206, 0.2)',
                            radius: WEEK_DAY_CIRCLE_RADIUS,
                            borderless: false,
                          }
                        : undefined
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`${dayNum}일 선택`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.weekDayCircle,
                        {
                          backgroundColor: isSelected ? colors.primary : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.weekDayNumber,
                          {
                            color: isSelected ? colors.staticWhite : colors.textAssistive,
                          },
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
                  </Pressable>
                  <View
                    style={[
                      styles.weekDayDot,
                      {
                        backgroundColor: hasRecord
                          ? isSelected
                            ? colors.primary
                            : colors.textAssistive
                          : 'transparent',
                      },
                    ]}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
      </View>

      {/* 본문 */}
      <View style={styles.timelineBodyWrap}>
      {/* 월 소비합계 + 타임라인: 좌우 스와이프로 월 변경 */}
      <View style={styles.timelineSwipeArea} {...timelinePanResponder.panHandlers}>
      {/* Month Summary - 고정 (애니메이션 제외) */}
      <View>
        <View style={[styles.summaryContainer, { backgroundColor: colors.background }]}>
          <Text style={[styles.summaryMonth, { color: colors.staticBlack }]}>
            {(() => {
              const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
              const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
              const startDay = String(startDate.getDate()).padStart(2, '0');
              const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
              const endDay = String(endDate.getDate()).padStart(2, '0');
              return `${startMonth}.${startDay} - ${endMonth}.${endDay}`;
            })()}
          </Text>
          
          <View style={styles.summaryAmounts}>
            <View style={styles.summaryIncomeContainer}>
              <Text 
                style={[styles.summaryIncome, { color: colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.7}
              >
                + {monthlyTotals.income.toLocaleString()}원
              </Text>
            </View>
            
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            
            <View style={styles.summaryExpenseContainer}>
              <Text 
                style={[styles.summaryExpense, { color: colors.text }]}
                adjustsFontSizeToFit
                numberOfLines={1}
                minimumFontScale={0.7}
              >
                - {monthlyTotals.expense.toLocaleString()}원
              </Text>
            </View>
          </View>
        </View>
        {/* Figma: 월 소비 합계 영역 하단 라인 디바이더 (Line/Normal, rgba(144,146,158,0.16)) */}
        <View style={[styles.summaryBottomDivider, { backgroundColor: colors.border }]} />
        <View style={styles.headerDivider} />
      </View>
      
      {/* Timeline Content - 로딩 완료 시 페이드인 (박스 디바이더 + 리스트) */}
      <Animated.View style={[styles.timelineListArea, { opacity: contentOpacity }]}>
        <ScrollView
          ref={timelineScrollRef}
          style={styles.scrollContainer}
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          contentContainerStyle={[
            styles.scrollContent,
            Object.keys(groupedTimeline).length === 0 && styles.scrollContentEmpty,
          ]}
        >
        {Object.keys(groupedTimeline).length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="info" variant="line" size={24} color={colors.textAssistive} />
            <Text style={[styles.emptyText, { color: colors.textAssistive }]}>
              이 달의 기록이 없습니다.
            </Text>
          </View>
        ) : (
          Object.entries(groupedTimeline).map(([date, items], groupIndex) => {
            const totalGroups = Object.keys(groupedTimeline).length;
            const isLastGroup = groupIndex === totalGroups - 1;
            
            return (
              <View
                key={date}
                style={styles.dateGroup}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  dateSectionLayoutsRef.current.set(date, { top: y, height });
                  if (
                    date === pickedDateForWeek &&
                    shouldScrollTimelineToDateRef.current &&
                    isContentReady
                  ) {
                    scrollTimelineToPickedDate(scrollAnimatedRef.current);
                  }
                }}
              >
                {items.map((item, itemIndex) => {
                  const isFirstInGroup = itemIndex === 0;
                  const isLastInGroup = itemIndex === items.length - 1;
                  
                  return (
                    <View key={`${date}-${itemIndex}`}>
                      <Pressable 
                        style={styles.timelineItem}
                        onPress={async () => {
                          const recurrenceKind = item.isInstallment
                            ? 'installment_expense'
                            : item.isRecurring
                              ? 'recurring_expense'
                              : 'none';
                          const recurrencePeriod = item.isInstallment
                            ? (typeof item.totalMonths === 'number' ? `${item.totalMonths}개월` : 'none')
                            : (item.recurringType ?? 'none');
                          const memoValue =
                            typeof item.memo === 'string' && item.memo.trim().length > 0
                              ? item.memo
                              : 'null';
                          void logEvent('list', {
                            target: 'timeline_item',
                            screen_name: '/monthly-expense-timeline',
                            record_type: item.type,
                            category: item.category,
                            date: date,
                            payment_method: item.paymentMethod ?? null,
                            amount: item.amount,
                            recurrence_kind: recurrenceKind,
                            recurrence_period: recurrencePeriod,
                            weekend_option: item.weekendOption ?? null,
                            memo: memoValue,
                          });
                          
                          if (item.type === 'expense') {
                            
                            // 실제 데이터에서 정확한 recordIndex 찾기
                            let correctRecordIndex = item.actualRecordIndex || 0;
                            
                            try {
                              const storedData = await AsyncStorage.getItem('calendarData');
                              if (storedData) {
                                // recurringType이 null인 경우 undefined로 변환 (JSON.parse reviver)
                                const calendarData = JSON.parse(storedData, (key, value) => {
                                  if (key === 'recurringType' && value === null) {
                                    return undefined;
                                  }
                                  return value;
                                });
                                const dateRecords = calendarData[date]?.records || [];

                                // timestamp와 category, amount로 정확한 인덱스 찾기
                                const foundIndex = dateRecords.findIndex((record: any) => 
                                  record.timestamp === item.timestamp &&
                                  record.category === item.category &&
                                  record.amount === item.amount
                                );

                                if (foundIndex !== -1) {
                                  correctRecordIndex = foundIndex;

                                } else {

                                  // 대안: category와 amount만으로 찾기
                                  const fallbackIndex = dateRecords.findIndex((record: any) => 
                                    record.category === item.category &&
                                    record.amount === item.amount
                                  );
                                  
                                  if (fallbackIndex !== -1) {
                                    correctRecordIndex = fallbackIndex;

                                  }
                                }
                              }
                            } catch {

                            }

                            // 소비 기록인 경우 수정화면으로 이동
                            router.push({
                              pathname: '/expense-edit',
                              params: {
                                recordData: JSON.stringify(item),
                                dateKey: date,
                                recordIndex: correctRecordIndex.toString(),
                                calendarYear: year.toString(),
                                calendarMonth: month.toString(),
                              },
                            });

                          } else if (item.type === 'income') {

                            // 실제 데이터에서 정확한 recordIndex 찾기
                            let correctRecordIndex = item.actualRecordIndex || 0;
                            
                            try {
                              const storedData = await AsyncStorage.getItem('calendarData');
                              if (storedData) {
                                // recurringType이 null인 경우 undefined로 변환 (JSON.parse reviver)
                                const calendarData = JSON.parse(storedData, (key, value) => {
                                  if (key === 'recurringType' && value === null) {
                                    return undefined;
                                  }
                                  return value;
                                });
                                const dateRecords = calendarData[date]?.records || [];

                                // timestamp와 category, amount로 정확한 인덱스 찾기
                                const foundIndex = dateRecords.findIndex((record: any) => 
                                  record.timestamp === item.timestamp &&
                                  record.category === item.category &&
                                  record.amount === item.amount
                                );
                                
                                if (foundIndex !== -1) {
                                  correctRecordIndex = foundIndex;

                                } else {

                                  // 대안: category와 amount만으로 찾기
                                  const fallbackIndex = dateRecords.findIndex((record: any) => 
                                    record.category === item.category &&
                                    record.amount === item.amount
                                  );
                                  
                                  if (fallbackIndex !== -1) {
                                    correctRecordIndex = fallbackIndex;

                                  }
                                }
                              }
                            } catch {

                            }

                            // 수입 기록인 경우 수정화면으로 이동
                            router.push({
                              pathname: '/income-edit',
                              params: {
                                recordData: JSON.stringify(item),
                                dateKey: date,
                                recordIndex: correctRecordIndex.toString(),
                                calendarYear: year.toString(),
                                calendarMonth: month.toString(),
                              },
                            });

                          }
                        }}
                      >
                        {/* Date Column */}
                        <View style={styles.dateColumn}>
                          {isFirstInGroup && (
                            <Text style={[styles.dateText, { color: colors.textAssistive }]}>
                              {formatDate(date)}
                            </Text>
                          )}
                        </View>
                        
                        {/* Content: Category/Amount + Memo */}
                        <View style={styles.itemContent}>
                          {/* Category and Amount */}
                          <View style={styles.itemRow1}>
                            <View style={styles.categoryContainer}>
                              <Text 
                                style={[styles.categoryText, { color: colors.text }]}
                              >
                                {(() => {
                                  const label = item.category || '수입';
                                  const emoji = categoryEmojiMap[label];
                                  if (emoji) {
                                    return `${emoji} ${label}`;
                                  }
                                  if (item.type === 'income') {
                                    if (label === '수입' || label === '입금' || !label) {
                                      return '💰 수입';
                                    }
                                    return label;
                                  }
                                  return label;
                                })()}
                              </Text>
                            </View>
                            <View style={styles.amountContainer}>
                              <Text 
                                style={[styles.amountText, { color: colors.text }]}
                                adjustsFontSizeToFit
                                numberOfLines={1}
                                minimumFontScale={0.7}
                              >
                                {item.type === 'expense'
                                  ? (
                                    // 결산/할부 환불 기록은 부호 없이 표기
                                    item.isSettled || (item.isInstallment && item.isRefunded)
                                      ? `${item.amount.toLocaleString()}원`
                                      : `- ${item.amount.toLocaleString()}원`
                                    )
                                  : `+ ${item.amount.toLocaleString()}원`
                                }
                              </Text>
                            </View>
                          </View>
                          
                          {/* Memo */}
                          <View style={styles.itemRow2}>
                            <View style={styles.memoContainer}>
                              <Text
                                style={[styles.memoText, { color: colors.textAssistive }]}
                              >
                                {item.memo ? item.memo.replace(/\n/g, ' ') : ' '}
                              </Text>
                              {/* 태그 표시 */}
                              {item.isInstallment && item.isSettled && (
                                <Tag
                                  label="할부·결산"
                                  status="negative"
                                />
                              )}
                              {item.isInstallment && item.isPrepaid && !item.isSettled && (
                                <Tag 
                                  label="할부·선결제" 
                                  status="positive" 
                                />
                              )}
                              {item.isInstallment && !item.isPrepaid && !item.isSettled && (
                                <Tag 
                                  label={item.isRefunded ? "할부·환불" : "할부"} 
                                  status="negative" 
                                />
                              )}
                              {!item.isInstallment && item.isSettled && (
                                <Tag
                                  label={item.isRecurring ? "정기·결산" : "일반·결산"}
                                  status="normal"
                                />
                              )}
                              {!item.isInstallment && item.isPrepaid && !item.isSettled && (
                                <Tag label="선납" status="positive" />
                              )}
                              {!item.isInstallment && item.isRefunded && !item.isSettled && (
                                <Tag
                                  label={item.isRecurring ? "정기·환불" : "일반·환불"}
                                  status="normal"
                                />
                              )}
                              {!item.isInstallment && item.isRecurring && !item.isPrepaid && !item.isRefunded && !item.isSettled && (
                                <Tag label="정기" status="normal" />
                              )}
                            </View>
                          </View>
                        </View>
                      </Pressable>
                      
                      {/* Item Divider - 자식 리스트 하단 */}
                      {!isLastInGroup && (
                        <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />
                      )}
                    </View>
                  );
                })}
                
                {/* Date Group Divider */}
                {!isLastGroup && (
                  <View style={[styles.dateGroupDivider, { backgroundColor: colors.border }]} />
                )}
              </View>
            );
          })
        )}
        </ScrollView>

        <Pressable
          style={styles.floatingFilterButton}
          onPress={handleFilterPress}
          accessibilityRole="button"
          accessibilityLabel="결제 유형 필터"
        >
          <GlassSurface
            intensity={BlurRuntime.timelineFilterIntensity}
            tint="light"
            overlayColor={BlurRuntime.timelineFilterOverlay}
            androidFallbackBackground={BlurRuntime.timelineFilterAndroidFallback}
            borderRadius={24}
            style={styles.floatingFilterBlur}
          >
            <View style={styles.floatingFilterContent}>
              <Text style={[styles.floatingFilterText, { color: colors.textNeutral }]}>필터</Text>
              <Icon name="arrowDown" variant="line" size={16} color={colors.textNeutral} />
            </View>
          </GlassSurface>
        </Pressable>
      </Animated.View>
      </View>
      </View>

      {showPaymentFilterSheet ? (
        <ModalBottomsheet
          visible={true}
          title="필터"
          onClose={() => {
            void logEvent('btn', {
              screen_name: '/monthly-expense-timeline',
              target: 'filter-close',
            });
            setDraftPaymentFilterKeys(paymentFilterKeys);
            setShowPaymentFilterSheet(false);
          }}
          onConfirm={() => {
            void logEvent('btn', {
              screen_name: '/monthly-expense-timeline',
              target: 'filter-confirm',
            });
            setPaymentFilterKeys(draftPaymentFilterKeys);
            setShowPaymentFilterSheet(false);
          }}
          confirmText="확인"
          closeOnBackdrop={true}
          style={{ height: paymentFilterSheetHeight }}
          contentStyle={styles.paymentFilterSheetContent}
          noPaddingBottom={true}
        >
          <View
            style={[
              styles.paymentFilterSheetBody,
              { backgroundColor: colors.fill, height: paymentFilterSheetContentHeight },
            ]}
          >
            <View style={[styles.paymentFilterListCard, { backgroundColor: colors.staticWhite }]}>
              <ScrollView
                style={styles.paymentFilterListScroll}
                contentContainerStyle={styles.paymentFilterListScrollContent}
                showsVerticalScrollIndicator={true}
                bounces={false}
                overScrollMode="never"
              >
                {paymentFilterOptions.map((item, index, arr) => (
                  <View key={item.id}>
                    {(() => {
                      const isSelected = draftPaymentFilterKeys.includes(item.id);
                      return (
                    <Pressable
                      style={styles.paymentFilterItem}
                      onPress={() => {
                        void logEvent('list', {
                          screen_name: '/monthly-expense-timeline',
                          target: 'filter',
                        });
                        setDraftPaymentFilterKeys((prev) =>
                          prev.includes(item.id) ? prev.filter((key) => key !== item.id) : [...prev, item.id]
                        );
                      }}
                    >
                      {item.type === 'cash' ? (
                        <View style={styles.paymentFilterEmojiWrap}>
                          <Text style={styles.paymentFilterCashEmoji}>💰</Text>
                        </View>
                      ) : item.type === 'income' ? (
                        <View style={styles.paymentFilterEmojiWrap}>
                          <Text style={styles.paymentFilterCashEmoji}>💵</Text>
                        </View>
                      ) : (
                        <View style={[styles.paymentFilterIndicator, { backgroundColor: item.color, borderColor: colors.border }]} />
                      )}
                      <View style={[styles.paymentFilterTextBlock, !item.description.trim() && styles.paymentFilterTextBlockSingleLine]}>
                        <Text style={[styles.paymentFilterTitle, { color: colors.text }]} numberOfLines={1}>
                          {item.label}
                        </Text>
                        {item.description.trim() ? (
                          <Text style={[styles.paymentFilterSubtitle, { color: colors.textAssistive }]} numberOfLines={1}>
                            {item.description}
                          </Text>
                        ) : null}
                      </View>
                      {isSelected ? (
                        <View style={styles.paymentFilterCheckWrap}>
                          <Icon name="check" variant="line" size={24} color={colors.primary} />
                        </View>
                      ) : null}
                    </Pressable>
                      );
                    })()}
                    {index < arr.length - 1 ? (
                      <View style={[styles.paymentFilterDivider, { backgroundColor: colors.border }]} />
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </View>
            <View style={[styles.paymentFilterBottomSpacer, { backgroundColor: colors.staticWhite }]} />
          </View>
        </ModalBottomsheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  timelineHeader: {
    flexShrink: 0,
  },
  timelineBodyWrap: {
    flex: 1,
  },
  timelineSwipeArea: {
    flex: 1,
  },
  weekRowWrap: {
    width: '100%',
  },
  weekRow: {
    height: 110,
    justifyContent: 'center',
  },
  dateStripContent: {
    paddingHorizontal: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekDayCell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  weekDayCirclePressable: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 8,
  },
  weekDayLabel: {
    ...Typography.body2.r.medium,
    marginBottom: 8,
  },
  weekDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDayNumber: {
    ...Typography.headline4.r.bold,
  },
  weekDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  summaryContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  summaryMonth: {
    ...Typography.body1.l.bold,
  },
  summaryAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    justifyContent: 'flex-end',
  },
  summaryIncomeContainer: {
    flexShrink: 1,
    alignItems: 'center',
  },
  summaryIncome: {
    ...Typography.body1.l.bold,
  },
  summaryDivider: {
    width: 1,
    height: 8,
  },
  summaryExpenseContainer: {
    flexShrink: 1,
    alignItems: 'center',
  },
  summaryExpense: {
    ...Typography.body1.l.bold,
  },
  summaryBottomDivider: {
    height: 1,
    width: '100%',
  },
  headerDivider: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(144, 146, 158, 0.1)',
  },
  timelineListArea: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 0, // 내용물 크기만큼만, 늘어나지 않음
    /** 필터(하단 16 + 높이 40) 아래 리스트가 가리지 않도록 */
    paddingBottom: 72,
  },
  scrollContentEmpty: {
    flexGrow: 1, // 빈 상태일 때 타임라인 영역 전체를 채워 세로 중앙 정렬
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...Typography.body1.l.regular,
    marginTop: 12,
  },
  dateGroup: {
    // No padding - handled by individual items
  },
  timelineItem: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16, // 상하 패딩 16px
    // height 제거 - 내용에 따라 자동 조정
  },
  timelineItemWithDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'transparent', // 기본값, 동적으로 설정됨
    marginHorizontal: 16, // 좌우 여백 추가
  },
  dateColumn: {
    width: 94,
  },
  dateText: {
    ...Typography.body1.l.medium,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  itemRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  itemRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  categoryContainer: {
    flex: 6,
  },
  categoryText: {
    ...Typography.body1.l.bold,
  },
  amountContainer: {
    flex: 4,
    alignItems: 'flex-end',
  },
  amountText: {
    ...Typography.body1.l.bold,
    textAlign: 'right',
  },
  memoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memoText: {
    ...Typography.body2.r.regular,
    flex: 1,
  },
  itemDivider: {
    height: 1,
    marginLeft: 110, // 16 + 94 = padding + date column width
    marginTop: 0,    // 상단 여백 0
    marginBottom: 0, // 하단 여백 0
  },
  dateGroupDivider: {
    height: 1,
    width: '100%',        // 가로값 100%
    marginTop: 0,         // 상단 여백 제거
    marginBottom: 0,      // 하단 여백 제거
    marginHorizontal: 16, // 양옆 여백 유지
  },
  // Category expense styles
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  categoryList: {
    paddingBottom: 20,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  categorySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryName: {
    ...Typography.body1.l.bold,
    flex: 1,
  },
  categoryStatsText: {
    ...Typography.body1.l.bold,
  },
  categorySeparator: {
    height: 1,
    marginHorizontal: 16,
  },
  // 소비현황 탭 전용 스타일
  categoryItemStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  // 챌린지 현황 탭 전용 스타일 - 피그마 디자인에 맞게
  challengeList: {
    padding: 16,
  },
  challengeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeCategory: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  challengeStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  challengeCategoryName: {
    ...Typography.body1.l.bold,
  },
  challengeStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  statusText: {
    ...Typography.detail.r.bold,
  },
  statusLabel: {
    ...Typography.body1.l.bold,
  },
  progressContainer: {
    height: 10,
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 8,
  },
  challengeAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  amountLeft: {
    alignItems: 'flex-start',
  },
  amountRight: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    ...Typography.detail.r.regular,
    marginBottom: 2,
  },
  amountValue: {
    ...Typography.body1.l.bold,
  },
  paymentFilterSheetContent: {
    padding: 0,
  },
  paymentFilterSheetBody: {
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  paymentFilterListCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  paymentFilterListScroll: {
    flex: 1,
  },
  paymentFilterListScrollContent: {
    flexGrow: 1,
  },
  paymentFilterItem: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  paymentFilterIndicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  paymentFilterCashEmoji: {
    ...Typography.body1.l.regular,
  },
  paymentFilterEmojiWrap: {
    width: 16,
    alignItems: 'center',
  },
  paymentFilterTextBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  paymentFilterTextBlockSingleLine: {
    gap: 0,
  },
  paymentFilterCheckWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentFilterTitle: {
    ...Typography.body1.l.regular,
  },
  paymentFilterSubtitle: {
    ...Typography.body2.r.regular,
  },
  paymentFilterDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  paymentFilterBottomSpacer: {
    height: 34,
    marginHorizontal: -16,
  },
  floatingFilterButton: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    width: 81,
    height: 40,
    borderRadius: 24,
    overflow: 'hidden',
    zIndex: 2,
  },
  floatingFilterBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingFilterContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 16,
  },
  floatingFilterText: {
    ...Typography.body2.r.medium,
  },
});

