/**
 * Challenge Tab Screen
 *
 * 챌린지 탭: 월 소비 현황의 '챌린지 현황' 탭과 동일한 UI·로직을 단독 화면으로 표시.
 * 공통 컴포넌트 없이 이 파일에만 구현되어 있으며, 월 소비 현황 챌린지 탭 로직은 변경하지 않음.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useThemeColor } from '@/hooks/use-theme-color';
import { loadCategories } from '@/utils/categories';
import { getChallengesByDateRange } from '@/utils/challenges';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { getCustomMonthInfo, getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    GestureResponderEvent,
    InteractionManager,
    PanResponder,
    PanResponderGestureState,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FAB_SIZE = 48;
const FAB_OFFSET_ABOVE_TABS = 16;

/** 월 변경 시 페이드 아웃/인 애니메이션 (챌린지·리포트·타임라인 동일) */
const MONTH_CHANGE_FADE_OUT_DURATION = 150;
const MONTH_CHANGE_FADE_IN_DURATION = 200;

/** 소비 현황(이번달 지출 순위/정기 지출)용 타임라인 아이템 - monthly-expense-timeline과 동일 */
interface TrendTimelineItem {
  date: string;
  type: 'income' | 'expense';
  category: string;
  memo?: string;
  amount: number;
  isRecurring?: boolean;
}

interface ChallengeData {
  id: string;
  category: string;
  startDate: string;
  endDate: string;
  targetAmount: number;
  createdAt: number;
  recurringId: string;
}

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
      .catch(() => {});
  }, []);

  return map;
};

interface MonthSwitcherProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  textColor: string;
  fillColor: string;
  assistiveColor: string;
  /** 년/월 텍스트 탭 시 호출 (타임라인 탑 네비와 동일한 년월 피커 열기) */
  onDatePress?: () => void;
}

const MonthSwitcher: React.FC<MonthSwitcherProps> = ({
  year,
  month,
  onPrev,
  onNext,
  textColor,
  fillColor,
  assistiveColor,
  onDatePress,
}) => {
  const dateLabel = `${year}년 ${String(month).padStart(2, '0')}월`;
  return (
    <View style={styles.periodRow}>
      <Pressable
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel="이전 달"
      >
        <View style={[styles.monthArrowButton, { backgroundColor: fillColor }]}>
          <Icon name="arrowLeft" variant="solid" size={24} color={assistiveColor} />
        </View>
      </Pressable>

      {onDatePress != null ? (
        <Pressable
          onPress={onDatePress}
          style={styles.periodTextWithArrow}
          accessibilityRole="button"
          accessibilityLabel="년월 선택"
        >
          <Text style={[styles.periodText, { color: textColor }]}>{dateLabel}</Text>
        </Pressable>
      ) : (
        <Text style={[styles.periodText, { color: textColor }]}>{dateLabel}</Text>
      )}

      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="다음 달"
      >
        <View style={[styles.monthArrowButton, { backgroundColor: fillColor }]}>
          <Icon name="arrowRight" variant="solid" size={24} color={assistiveColor} />
        </View>
      </Pressable>
    </View>
  );
};

type TopTabId = 'challenge' | 'report';
type ReportSubTabId = 'score' | 'trend';

const REPORT_SCORE_CARD_MIN = 280;
const REPORT_SCORE_CARD_MAX = 454;

export default function ChallengeTabScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const iconWhite = useThemeColor({}, 'staticWhite');
  const [activeTopTab, setActiveTopTab] = useState<TopTabId>('challenge');
  const [reportSubTab, setReportSubTab] = useState<ReportSubTabId>('score');
  const [trendTimelineData, setTrendTimelineData] = useState<TrendTimelineItem[]>([]);
  const [trendCategoryFilter, setTrendCategoryFilter] = useState<'all' | 'recurring'>('all');
  const categoryEmojiMap = useCategoryEmojiMap();
  const { setLoading } = useLoading();
  const { updateCalendarContext } = useCreateSheetContext();
  const pendingOpsRef = useRef(0);
  const beginLoad = useCallback(() => {
    pendingOpsRef.current += 1;
    setLoading(true);
  }, [setLoading]);
  const endLoad = useCallback(() => {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    if (pendingOpsRef.current === 0) setLoading(false);
  }, [setLoading]);
  const router = useRouter();
  const navigation = useNavigation();
  const isNavigating = useRef(false);

  const params = useLocalSearchParams<{ year?: string; month?: string; tab?: string }>();

  const [monthStartDay, setMonthStartDay] = useState(1);
  const now = new Date();
  const initialYear = params.year ? parseInt(params.year, 10) || now.getFullYear() : now.getFullYear();
  const initialMonth = params.month ? parseInt(params.month, 10) || now.getMonth() + 1 : now.getMonth() + 1;
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  const year = currentYear;
  const month = currentMonth;

  // 년/월 피커 옵션 (타임라인 탑 네비와 100% 동일: ±10년, 1~12월)
  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 21 }, (_, i) => {
      const y = cy - 10 + i;
      return { label: `${y}년`, value: y };
    });
  }, []);
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { label: `${m}월`, value: m };
    });
  }, []);

  // 홈 잔액/년도 월 카드 탭 시 리포트 > 소비 리포트로 열기 + 해당 년/월로 동기화
  const appliedStatusParam = useRef(false);
  useEffect(() => {
    if (params.tab === 'status' && !appliedStatusParam.current) {
      setActiveTopTab('report');
      setReportSubTab('score');
      appliedStatusParam.current = true;
    }
  }, [params.tab]);

  // 홈에서 넘긴 year/month가 있으면 해당 연·월로 표시 (탭 재진입 시에도 동기화)
  useEffect(() => {
    const paramYear = params.year ? parseInt(params.year, 10) : undefined;
    const paramMonth = params.month ? parseInt(params.month, 10) : undefined;
    if (paramYear != null && !Number.isNaN(paramYear)) {
      setCurrentYear(paramYear);
    }
    if (paramMonth != null && !Number.isNaN(paramMonth) && paramMonth >= 1 && paramMonth <= 12) {
      setCurrentMonth(paramMonth);
    }
  }, [params.year, params.month]);

  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [challengeAmounts, setChallengeAmounts] = useState<Record<string, number>>({});
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  // 리포트 탭 월 변경 시 페이드 아웃/인 (타임라인과 동일) - 점수 박스는 항상 표시, 애니메이션만 적용
  const reportContentOpacity = useRef(new Animated.Value(1)).current;
  const [reportTrendContentReady, setReportTrendContentReady] = useState(false);
  const prevReportMonthRef = useRef<{ year: number; month: number } | null>(null);
  const reportNeedsFadeInRef = useRef(false);

  // 챌린지 탭 월 변경 시 페이드 아웃/인 (리포트·타임라인과 동일)
  const prevChallengeMonthRef = useRef<{ year: number; month: number } | null>(null);
  const challengeRefreshedForRef = useRef<{ year: number; month: number } | null>(null);
  const challengeMonthChangeInProgressRef = useRef(false);
  const challengeDidFadeInRef = useRef(false);

  const refreshData = useCallback(async () => {
    beginLoad();
    try {
      if (!hasAnimatedRef.current) {
        setIsContentReady(false);
      }

      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);

      const { startDate: customStart, endDate: customEnd } = getCustomMonthRange(year, month, monthStart);
      const formatChallengeDate = (dateObj: Date) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}`;
      };

      const challengeRecords = await getChallengesByDateRange(
        formatChallengeDate(customStart),
        formatChallengeDate(customEnd)
      );
      const activeChallenges = challengeRecords.filter((challenge) => {
        const [startY, startM, startD] = challenge.startDate.split('.').map(Number);
        const startDate = new Date(startY, startM - 1, startD);
        return isDateInCustomMonth(startDate, year, month, monthStart);
      });
      setChallenges(activeChallenges);

      setIsContentReady(true);
      hasAnimatedRef.current = true;
      challengeRefreshedForRef.current = { year, month };
      if (challengeMonthChangeInProgressRef.current) {
        challengeMonthChangeInProgressRef.current = false;
        challengeDidFadeInRef.current = true;
        contentOpacity.setValue(0);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: MONTH_CHANGE_FADE_IN_DURATION,
          useNativeDriver: true,
        }).start();
      }
    } catch (err) {
      console.error('[challenge-tab] Failed to load challenges:', err);
      setChallenges([]);
      setIsContentReady(true);
      hasAnimatedRef.current = true;
      challengeRefreshedForRef.current = { year, month };
      if (challengeMonthChangeInProgressRef.current) {
        challengeMonthChangeInProgressRef.current = false;
        challengeDidFadeInRef.current = true;
        contentOpacity.setValue(0);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: MONTH_CHANGE_FADE_IN_DURATION,
          useNativeDriver: true,
        }).start();
      }
    } finally {
      endLoad();
    }
  }, [year, month, beginLoad, endLoad, contentOpacity]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const { dataVersion } = useAppData();
  useEffect(() => {
    refreshData();
  }, [dataVersion, year, month, refreshData]);

  // 소비 현황(이번달 지출 순위/정기 지출)용 타임라인 데이터 - 월 상세현황과 동일 로직
  useEffect(() => {
    let cancelled = false;
    setReportTrendContentReady(false);
    const load = async () => {
      const monthStart = await loadMonthStartDay();
      if (cancelled) return;
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData || cancelled) return;
      const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
        if (key === 'recurringType' && value === null) return undefined;
        return value;
      }) as Record<string, { records?: Array<{ type?: string; category?: string; amount?: number; memo?: string; isRecurring?: boolean; isDeleted?: boolean }> }>;
      const items: TrendTimelineItem[] = [];
      Object.entries(calendarData).forEach(([dateString, data]) => {
        const [y, m, d] = dateString.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        if (!isDateInCustomMonth(date, year, month, monthStart) || !data?.records) return;
        data.records.forEach((record) => {
          if (record.isDeleted || record.type !== 'expense') return;
          items.push({
            date: dateString,
            type: 'expense',
            category: record.category || '기타',
            amount: record.amount || 0,
            memo: record.memo,
            isRecurring: record.isRecurring,
          });
        });
      });
      if (!cancelled) {
        setTrendTimelineData(items);
        setReportTrendContentReady(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [year, month, dataVersion]);

  // 이번달 지출 순위 / 정기 지출 집계 (monthly-expense-timeline과 동일)
  const trendCategoryExpenses = useMemo(() => {
    const categoryMap = new Map<string, { count: number; amount: number; memo?: string }>();
    trendTimelineData.forEach((item) => {
      if (trendCategoryFilter === 'recurring' && !item.isRecurring) return;
      if (trendCategoryFilter === 'all' && item.isRecurring) return;
      const category = item.category || '기타';
      const amount = item.amount || 0;
      if (categoryMap.has(category)) {
        const existing = categoryMap.get(category)!;
        existing.count += 1;
        existing.amount += amount;
        if (item.memo && !existing.memo) existing.memo = item.memo;
      } else {
        categoryMap.set(category, { count: 1, amount, memo: item.memo });
      }
    });
    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, count: data.count, amount: data.amount, memo: data.memo }))
      .sort((a, b) => b.amount - a.amount);
  }, [trendTimelineData, trendCategoryFilter]);

  // 챌린지 탭에서 FAB를 열 때도, 홈과 동일하게 현재 보고 있는 년/월 정보를 공유
  useEffect(() => {
    const paddedMonth = String(currentMonth).padStart(2, '0');
    const syntheticDate = `${currentYear}-${paddedMonth}-01`;

    updateCalendarContext({
      selectedDate: syntheticDate,
      calendarYear: currentYear,
      calendarMonth: currentMonth,
    });
  }, [currentYear, currentMonth, updateCalendarContext]);

  // 페이드인 애니메이션 (챌린지 월 변경 시에는 refreshData에서 페이드인 처리)
  useEffect(() => {
    if (isContentReady) {
      if (challengeDidFadeInRef.current) {
        challengeDidFadeInRef.current = false;
        return;
      }
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: MONTH_CHANGE_FADE_IN_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);

  // 챌린지 탭: 월 변경 감지 → 페이드아웃, 로딩 완료 시 페이드인 (리포트·타임라인과 동일)
  useEffect(() => {
    if (activeTopTab !== 'challenge') return;
    const prev = prevChallengeMonthRef.current;
    if (prev === null) {
      prevChallengeMonthRef.current = { year, month };
      return;
    }
    if (prev.year !== year || prev.month !== month) {
      prevChallengeMonthRef.current = { year, month };
      challengeRefreshedForRef.current = null;
      challengeMonthChangeInProgressRef.current = true;
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && (challengeRefreshedForRef.current?.year !== year || challengeRefreshedForRef.current?.month !== month)) {
          setIsContentReady(false);
        }
      });
    }
  }, [activeTopTab, year, month, contentOpacity]);

  // 리포트 탭: 월 변경 감지 → 페이드아웃, 로딩 완료 시 페이드인 (타임라인과 동일)
  useEffect(() => {
    if (activeTopTab !== 'report') return;
    const prev = prevReportMonthRef.current;
    if (prev === null) {
      prevReportMonthRef.current = { year, month };
      return;
    }
    if (prev.year !== year || prev.month !== month) {
      prevReportMonthRef.current = { year, month };
      reportNeedsFadeInRef.current = true;
      setReportTrendContentReady(false);
      Animated.timing(reportContentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          // 소비 리포트: 점수 박스는 데이터 없어도 항상 표시 → 페이드아웃 직후 페이드인
          // 소비 현황: 트렌드 로딩 완료 시 별도 effect에서 페이드인
          if (reportSubTab === 'score') {
            reportContentOpacity.setValue(0);
            Animated.timing(reportContentOpacity, {
              toValue: 1,
              duration: MONTH_CHANGE_FADE_IN_DURATION,
              useNativeDriver: true,
            }).start();
          }
        }
      });
    }
  }, [activeTopTab, year, month, reportSubTab, reportContentOpacity]);

  // 리포트 탭(소비 현황): 트렌드 로딩 완료 시 페이드인
  // 소비 리포트(점수 박스)는 월 변경 시 페이드아웃 콜백에서 바로 페이드인
  useEffect(() => {
    if (activeTopTab !== 'report' || reportSubTab !== 'trend') return;
    if (!reportTrendContentReady) {
      reportContentOpacity.setValue(0);
      return;
    }
    reportNeedsFadeInRef.current = false;
    reportContentOpacity.setValue(0);
    Animated.timing(reportContentOpacity, {
      toValue: 1,
      duration: MONTH_CHANGE_FADE_IN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [activeTopTab, reportSubTab, reportTrendContentReady, reportContentOpacity]);

  // 리포트 탭 진입 시 prevReportMonthRef 초기화 (첫 진입 시 페이드아웃 방지)
  useEffect(() => {
    if (activeTopTab === 'report' && prevReportMonthRef.current === null) {
      prevReportMonthRef.current = { year, month };
    }
    if (activeTopTab !== 'report') {
      prevReportMonthRef.current = null;
    }
  }, [activeTopTab, year, month]);

  // 챌린지 탭 진입 시 prevChallengeMonthRef 초기화 (첫 진입 시 페이드아웃 방지)
  useEffect(() => {
    if (activeTopTab === 'challenge' && prevChallengeMonthRef.current === null) {
      prevChallengeMonthRef.current = { year, month };
    }
    if (activeTopTab !== 'challenge') {
      prevChallengeMonthRef.current = null;
    }
  }, [activeTopTab, year, month]);

  // 소비 리포트: 점수 박스는 데이터 없어도 항상 표시 → 트렌드→스코어 전환 시 opacity 1 (월 변경 애니메이션과 충돌 방지)
  const prevReportSubTabRef = useRef<ReportSubTabId | null>(null);
  useEffect(() => {
    if (activeTopTab === 'report' && prevReportSubTabRef.current === 'trend' && reportSubTab === 'score') {
      reportContentOpacity.setValue(1);
    }
    if (activeTopTab === 'report') prevReportSubTabRef.current = reportSubTab;
    else prevReportSubTabRef.current = null;
  }, [activeTopTab, reportSubTab, reportContentOpacity]);

  // reset() 직후 언마운트·마운트가 겹치지 않도록 무거운 계산을 인터랙션 종료 후로 지연
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const calculateChallengeAmounts = async () => {
        const amounts: Record<string, number> = {};
        for (const challenge of challenges) {
          let totalAmount = 0;
          const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
          const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
          const storedData = await AsyncStorage.getItem('calendarData');
          if (storedData) {
            const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
              if (key === 'recurringType' && value === null) return undefined;
              return value;
            });
            Object.entries(calendarData).forEach(([dateString, data]: [string, unknown]) => {
              const itemDate = new Date(dateString);
              if (itemDate >= startDate && itemDate <= endDate && data && typeof data === 'object' && 'records' in data) {
                const records = (data as { records?: unknown[] }).records;
                if (Array.isArray(records)) {
                  records.forEach((record: { isDeleted?: boolean; isRefunded?: boolean; type?: string; category?: string; amount?: number }) => {
                    if (record.isDeleted || record.isRefunded) return;
                    if (record.type === 'expense' && record.category === challenge.category) {
                      totalAmount += record.amount || 0;
                    }
                  });
                }
              }
            });
          }
          amounts[challenge.id] = totalAmount;
        }
        setChallengeAmounts(amounts);
      };
      calculateChallengeAmounts();
    });
    return () => task.cancel();
  }, [challenges]);

  // 오늘 날짜 기준으로, 커스텀 월 시작일을 반영한 년/월로 이동
  const resetToCurrentMonth = useCallback(async () => {
    const today = new Date();
    const monthStart = await loadMonthStartDay();
    const customMonthInfo = getCustomMonthInfo(today, monthStart);

    setCurrentYear(customMonthInfo.year);
    setCurrentMonth(customMonthInfo.month);
  }, []);

  // Handle double-tap on challenge tab: reset to today's custom month
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabDoubleTap' as any, (e: any) => {
      if (e.data?.routeName === 'challenge') {
        resetToCurrentMonth().catch((error) => {
          console.error('[challenge-tab] Failed to reset to today:', error);
        });
      }
    });

    return unsubscribe;
  }, [navigation, resetToCurrentMonth]);

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

  // 점수 박스 높이: 디바이스 높이의 52% 기준, min/max로 범위 제한
  const reportScoreCardHeight = useMemo(() => {
    const height = windowHeight * 0.52;
    return Math.round(Math.max(REPORT_SCORE_CARD_MIN, Math.min(REPORT_SCORE_CARD_MAX, height)));
  }, [windowHeight]);

  // Horizontal swipe to change month (left: prev, right: next)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;
        // 가로 스와이프가 세로보다 크고, 일정 거리 이상일 때만 처리
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const SWIPE_THRESHOLD = 50;
        const { dx } = gestureState;

        if (dx <= -SWIPE_THRESHOLD) {
          // 왼쪽으로 스와이프 → 다음 달
          handleNextMonth();
        } else if (dx >= SWIPE_THRESHOLD) {
          // 오른쪽으로 스와이프 → 이전 달
          handlePrevMonth();
        }
      },
    })
  ).current;

  return (
    <View style={styles.screenWrapper}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View>
          <TopNavigation
            type="main"
            title="챌린지"
            tabs={[
              { id: 'challenge', label: '챌린지' },
              { id: 'report', label: '리포트' },
            ]}
            activeTabId={activeTopTab}
            onTabChange={(id) => setActiveTopTab(id as TopTabId)}
          />
        </View>

        <View
          style={[styles.content, { backgroundColor: colors.fill }]}
          {...panResponder.panHandlers}
        >
          {activeTopTab === 'report' ? (
            <View style={[styles.reportContent, { backgroundColor: colors.backgroundAlt }]}>
              {/* 서브 탭: 소비 리포트 | 소비 현황 (Figma tab) */}
              <View style={[styles.reportSubTabBar, { backgroundColor: colors.staticWhite }]}>
                <Pressable
                  style={styles.reportSubTab}
                  onPress={() => setReportSubTab('score')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: reportSubTab === 'score' }}
                  accessibilityLabel="소비 리포트"
                >
                  <Text
                    style={[
                      reportSubTab === 'score' ? styles.reportSubTabTextActive : styles.reportSubTabTextInactive,
                      { color: reportSubTab === 'score' ? colors.text : colors.textAssistive },
                    ]}
                  >
                    소비 리포트
                  </Text>
                  {reportSubTab === 'score' && (
                    <View style={[styles.reportSubTabIndicator, { backgroundColor: colors.primary }]} />
                  )}
                </Pressable>
                <Pressable
                  style={styles.reportSubTab}
                  onPress={() => setReportSubTab('trend')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: reportSubTab === 'trend' }}
                  accessibilityLabel="소비 현황"
                >
                  <Text
                    style={[
                      reportSubTab === 'trend' ? styles.reportSubTabTextActive : styles.reportSubTabTextInactive,
                      { color: reportSubTab === 'trend' ? colors.text : colors.textAssistive },
                    ]}
                  >
                    소비 현황
                  </Text>
                  {reportSubTab === 'trend' && (
                    <View style={[styles.reportSubTabIndicator, { backgroundColor: colors.primary }]} />
                  )}
                </Pressable>
              </View>
              <View style={[styles.reportSubTabDivider, { backgroundColor: colors.border }]} />

              {reportSubTab === 'score' ? (
                <ScrollView
                  style={[styles.reportScroll, { backgroundColor: colors.fill }]}
                  contentContainerStyle={styles.reportScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                >
                  {/* 월 스위처 카드 (Frame 208) - 고정, 년/월 탭 시 타임라인과 동일한 피커 */}
                  <View style={[styles.reportMonthCard, { backgroundColor: colors.staticWhite }]}>
                    <Pressable
                      onPress={handlePrevMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="이전 달"
                    >
                      <Icon name="arrowLeft" variant="solid" size={24} color={colors.textAssistive} />
                    </Pressable>
                    <Pressable
                      onPress={() => setShowYearMonthPicker(true)}
                      style={styles.reportMonthTextWrap}
                      accessibilityRole="button"
                      accessibilityLabel="년월 선택"
                    >
                      <Text style={[styles.reportMonthText, { color: colors.text }]}>
                        {year}년 {String(month).padStart(2, '0')}월
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleNextMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="다음 달"
                    >
                      <Icon name="arrowRight" variant="solid" size={24} color={colors.textAssistive} />
                    </Pressable>
                  </View>

                  {/* 점수 카드 (Frame 226) - 본문: 로딩 완료 시 페이드인 */}
                  <Animated.View style={{ opacity: reportContentOpacity }}>
                  <View
                    style={[
                      styles.reportScoreCard,
                      { backgroundColor: colors.staticWhite, minHeight: reportScoreCardHeight },
                    ]}
                  >
                    <Text style={[styles.reportScoreLabel, { color: colors.textAssistive }]}>
                      이번달 소비 점수는?
                    </Text>
                    <View style={styles.reportScoreValueRow}>
                      <Text style={[styles.reportScoreValue, { color: colors.text }]}>?</Text>
                      <Text style={[styles.reportScoreUnit, { color: colors.text }]}>점</Text>
                    </View>
                    <Text style={[styles.reportScoreMessage, { color: colors.textNeutral }]}>
                      오늘 벌써 2건의 기록이 쌓였어요.{'\n'}한 건만 더 적으면{'\n'}소비 진단을 진행할 수 있어요.
                    </Text>
                    <Button
                      variant="primary"
                      type="solid"
                      size="large"
                      onPress={() => {}}
                    >
                      점수 확인하기
                    </Button>
                  </View>
                  </Animated.View>
                </ScrollView>
              ) : (
                <ScrollView
                  style={[styles.reportScroll, { backgroundColor: colors.fill }]}
                  contentContainerStyle={styles.reportScrollContent}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                >
                  {/* 년월 박스 - 소비 현황 탭, 년/월 탭 시 타임라인과 동일한 피커 */}
                  <View style={[styles.reportMonthCard, { backgroundColor: colors.staticWhite }]}>
                    <Pressable
                      onPress={handlePrevMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="이전 달"
                    >
                      <Icon name="arrowLeft" variant="solid" size={24} color={colors.textAssistive} />
                    </Pressable>
                    <Pressable
                      onPress={() => setShowYearMonthPicker(true)}
                      style={styles.reportMonthTextWrap}
                      accessibilityRole="button"
                      accessibilityLabel="년월 선택"
                    >
                      <Text style={[styles.reportMonthText, { color: colors.text }]}>
                        {year}년 {String(month).padStart(2, '0')}월
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleNextMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="다음 달"
                    >
                      <Icon name="arrowRight" variant="solid" size={24} color={colors.textAssistive} />
                    </Pressable>
                  </View>
                  {/* 이번달 지출 순위 / 정기 지출 칩 - 고정 */}
                  <View style={styles.trendFilterContainer}>
                    <Chip
                      label="이번달 지출 순위"
                      active={trendCategoryFilter === 'all'}
                      onPress={() => setTrendCategoryFilter('all')}
                    />
                    <Chip
                      label="정기 지출"
                      active={trendCategoryFilter === 'recurring'}
                      onPress={() => setTrendCategoryFilter('recurring')}
                    />
                  </View>
                  {/* 순위 리스트 - 로딩 완료 시 페이드인 */}
                  <Animated.View style={{ opacity: reportContentOpacity }}>
                  {trendCategoryExpenses.length === 0 ? (
                    <View style={styles.placeholderContainer}>
                      <Text style={[styles.placeholderText, { color: colors.textAssistive }]}>
                        {trendCategoryFilter === 'all' ? '이번달 지출 내역이 없습니다.' : '정기 지출 내역이 없습니다.'}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.trendCategoryList}>
                      {trendCategoryExpenses.map((item) => (
                        <Pressable
                          key={item.category}
                          style={[styles.trendCategoryItem, { backgroundColor: colors.staticWhite }]}
                          onPress={() => {
                            router.push({
                              pathname: '/expense-category-detail',
                              params: {
                                category: item.category,
                                year: year.toString(),
                                month: month.toString(),
                              },
                            });
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${item.category} 상세`}
                        >
                          <View style={styles.trendCategorySection}>
                            <Text style={[styles.trendCategoryName, { color: colors.text }]}>
                              {categoryEmojiMap[item.category] || '📝'} {item.category}
                            </Text>
                            <Text style={[styles.trendCategoryStats, { color: colors.text }]}>
                              {`${item.count}건 · ${item.amount.toLocaleString()}원`}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  </Animated.View>
                </ScrollView>
              )}
            </View>
          ) : (
            <>
          {/* 날짜 박스 - 고정 */}
          <MonthSwitcher
            year={year}
            month={month}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            textColor={colors.text}
            fillColor={colors.fill}
            assistiveColor={colors.textAssistive}
            onDatePress={() => setShowYearMonthPicker(true)}
          />

          {/* 챌린지 카드 리스트 - 로딩 완료 시 페이드인 */}
          <Animated.View style={{ flex: 1, opacity: isContentReady ? contentOpacity : 0 }}>
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            overScrollMode="never"
          >
            {challenges.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textAssistive }]}>
                  생성된 챌린지가 없습니다.
                </Text>
              </View>
            ) : (
              <View style={styles.challengeList}>
                {challenges.map((challenge) => {
              const categoryEmoji = categoryEmojiMap[challenge.category];
              let targetAmount = 0;
              if (challenge.targetAmount != null) {
                if (typeof challenge.targetAmount === 'string') {
                  targetAmount = parseInt((challenge.targetAmount as string).replace(/,/g, ''), 10) || 0;
                } else {
                  targetAmount = Number(challenge.targetAmount);
                }
              }
              const currentAmount = challengeAmounts[challenge.id] ?? 0;
              const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
              const isOverBudget = currentAmount > targetAmount;

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
              startDate.setHours(0, 0, 0, 0);
              const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
              endDate.setHours(0, 0, 0, 0);
              const isChallengeStarted = startDate <= today;
              const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

              let status: {
                text: string;
                color: string;
                bgColor: string;
                showProgressComplete: boolean;
                isBeforeStart: boolean;
                rightLabel: string;
              };
              if (!isChallengeStarted) {
                status = {
                  text: '진행 전',
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: true,
                  rightLabel: '진행 전',
                };
              } else if (daysLeft < 0) {
                status = {
                  text: isOverBudget ? 'Failed' : 'Success',
                  color: isOverBudget ? '#ef5252' : '#07b63b',
                  bgColor: isOverBudget ? '#ef5252' : '#07b63b',
                  showProgressComplete: true,
                  isBeforeStart: false,
                  rightLabel: '진행완료',
                };
              } else if (daysLeft === 0) {
                status = {
                  text: 'D-0',
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: false,
                  rightLabel: 'D-0',
                };
              } else {
                status = {
                  text: `D-${daysLeft}`,
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: false,
                  rightLabel: `D-${daysLeft}`,
                };
              }

              return (
                <Pressable
                  key={challenge.id}
                  style={[styles.challengeCard, { backgroundColor: colors.staticWhite }]}
                  onPress={() => {
                    if (isNavigating.current) return;
                    isNavigating.current = true;
                    router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id } });
                    setTimeout(() => { isNavigating.current = false; }, 500);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${challenge.category} 챌린지`}
                >
                  <View style={styles.challengeHeader}>
                    <View style={styles.challengeCategory}>
                      <Text style={[styles.challengeCategoryName, { color: colors.text }]}>
                        {categoryEmoji || '📝'} {challenge.category}
                      </Text>
                      {status.showProgressComplete && status.bgColor !== 'transparent' && (
                        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                          <Text style={[styles.statusText, { color: '#ffffff' }]}>{status.text}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.statusLabel, { color: colors.text }]}>{status.rightLabel}</Text>
                  </View>

                  <View style={[styles.progressContainer, { backgroundColor: '#E3E3E3' }]}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${status.isBeforeStart ? 5 : Math.max(progress, 1)}%`,
                          backgroundColor: status.isBeforeStart ? '#9e9e9e' : isOverBudget ? '#F66262' : '#1AC673',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.challengeAmounts}>
                    <View style={styles.amountLeft}>
                      <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>현재 소비금액</Text>
                      <Text style={[styles.amountValue, { color: colors.textNeutral }]}>
                        {status.isBeforeStart ? '0원' : `${currentAmount.toLocaleString()}원`}
                      </Text>
                    </View>
                    <View style={styles.amountRight}>
                      <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>목표 소비금액</Text>
                      <Text style={[styles.amountValue, { color: colors.textNeutral }]}>
                        {targetAmount.toLocaleString()}원
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            </View>
          )}
          </ScrollView>
          </Animated.View>
            </>
          )}
        </View>

        {/* 년/월 피커 (타임라인 탑 네비와 100% 동일한 DatePicker) */}
        <DatePicker
          visible={showYearMonthPicker}
          onClose={() => setShowYearMonthPicker(false)}
          title="년/월 선택"
          yearOptions={yearOptions}
          selectedYear={year}
          onYearChange={(newYear) => {
            const minY = yearOptions[0]?.value ?? newYear;
            const maxY = yearOptions[yearOptions.length - 1]?.value ?? newYear;
            setCurrentYear(Math.min(maxY, Math.max(minY, newYear)));
          }}
          monthOptions={monthOptions}
          selectedMonth={month}
          onMonthChange={setCurrentMonth}
        />
      </SafeAreaView>

      <Pressable
        style={[
          styles.fab,
          styles.fabShadow,
          {
            backgroundColor: colors.primary,
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
  content: {
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
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.light.staticWhite,
  },
  periodTextWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodText: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  monthArrowButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    ...Typography.body1.l.regular,
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 320,
  },
  placeholderText: {
    ...Typography.body1.l.regular,
    fontSize: 16,
  },
  reportContent: {
    flex: 1,
    backgroundColor: Colors.light.backgroundAlt,
  },
  reportSubTabBar: {
    flexDirection: 'row',
    height: 56,
    paddingHorizontal: 16,
  },
  reportSubTab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportSubTabTextActive: {
    ...Typography.body1.l.bold,
  },
  reportSubTabTextInactive: {
    ...Typography.body1.l.medium,
  },
  reportSubTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  reportSubTabDivider: {
    height: 1,
    width: '100%',
  },
  reportScroll: {
    flex: 1,
  },
  reportScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  reportMonthCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  reportMonthArrow: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportMonthTextWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportMonthText: {
    ...Typography.body1.l.bold,
  },
  reportScoreCard: {
    width: '100%',
    // minHeight는 디바이스 높이에 따라 동적으로 적용 (reportScoreCardHeight)
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportScoreLabel: {
    ...Typography.body2.r.medium,
    marginBottom: 16,
  },
  reportScoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  reportScoreValue: {
    ...Typography.headline1.xl.bold,
    fontSize: 32,
    lineHeight: 48,
  },
  reportScoreUnit: {
    ...Typography.body1.l.bold,
    marginLeft: 4,
  },
  reportScoreMessage: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    marginBottom: 24,
  },
  trendFilterContainer: {
    flexDirection: 'row',
    paddingTop: 0,
    paddingBottom: 16,
    gap: 8,
  },
  trendCategoryList: {
    paddingBottom: 20,
  },
  trendCategoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
  },
  trendCategorySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    flex: 1,
  },
  trendCategoryName: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 24,
    flex: 1,
  },
  trendCategoryStats: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 24,
  },
  challengeList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    gap: 8,
  },
  challengeCategoryName: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    ...Typography.tiny.r.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  statusLabel: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
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
    ...Typography.tiny.r.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  amountValue: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
});
