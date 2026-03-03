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
import { CONSUMPTION_REPORT_API_URL } from '@/constants/api';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useThemeColor } from '@/hooks/use-theme-color';
import { loadCategories } from '@/utils/categories';
import { getChallengesByDateRange } from '@/utils/challenges';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { getCustomMonthInfo, getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import {
  computeConsumptionIndex,
  type ConsumptionIndexResult,
  type CalendarData,
} from '@/utils/consumption-index';
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
  const [consumptionIndex, setConsumptionIndex] = useState<ConsumptionIndexResult | null>(null);
  const [isConsumptionIndexLoading, setIsConsumptionIndexLoading] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState<string | null>(null);
  const [aiChallengeText, setAiChallengeText] = useState<string | null>(null);
  const [aiSummaryTitleText, setAiSummaryTitleText] = useState<string | null>(null);
  const [scoreFeedbackText, setScoreFeedbackText] = useState<string | null>(null);
  const [aiNextWeekGoalText, setAiNextWeekGoalText] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [hasCheckedScore, setHasCheckedScore] = useState(false);
  const categoryEmojiMap = useCategoryEmojiMap();
  const { setLoading } = useLoading();
  const { showToast } = useToast();
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

  // 탭 진입 시 탑 네비 + 날짜 박스 페이드인용 (월 변경 시에는 사용 안 함, 1로 유지)
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const hasInitiallyFadedInRef = useRef(false);

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

  // 년·월 또는 데이터 버전이 바뀌면:
  // - 기본적으로 점수/AI 결과 상태를 초기화하고
  // - 해당 월에 대한 AI 리포트 캐시가 있으면 즉시 불러와서 복원
  useEffect(() => {
    let cancelled = false;

    const syncReportFromCache = async () => {
      // 기본 상태: 아직 점수 확인 전
      if (!cancelled) {
        setHasCheckedScore(false);
        setAiSummaryText(null);
        setAiChallengeText(null);
        setScoreFeedbackText(null);
        setAiSummaryTitleText(null);
      }

      const cacheKey = `consumptionReport_${year}_${month}_${monthStartDay}`;

      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (!cached || cancelled) return;

        const parsed = JSON.parse(cached) as {
          summary?: string;
          summaryTitle?: string;
          challenge?: string;
          scoreFeedback?: string;
          lastRecordUpdatedAt?: number;
        };

        if (typeof parsed.summary === 'string' && typeof parsed.challenge === 'string') {
          if (!cancelled) {
            setAiSummaryText(parsed.summary.trim());
            setAiChallengeText(parsed.challenge.trim());
            if (typeof parsed.summaryTitle === 'string') {
              setAiSummaryTitleText(parsed.summaryTitle.trim());
            }
            if (typeof parsed.scoreFeedback === 'string') {
              setScoreFeedbackText(parsed.scoreFeedback.trim());
            }
            setHasCheckedScore(true);
          }
        }
      } catch {
        // 캐시 파싱 오류는 무시하고 기본 상태를 유지
      }
    };

    void syncReportFromCache();

    return () => {
      cancelled = true;
    };
  }, [year, month, monthStartDay, dataVersion]);

  // 소비 리포트: 월별 소비 지수(FQ) 계산
  useEffect(() => {
    let cancelled = false;

    const loadConsumptionIndex = async () => {
      if (monthStartDay <= 0) return;
      if (activeTopTab !== 'report' || reportSubTab !== 'score') return;

      setIsConsumptionIndexLoading(true);
      try {
        const storedData = await AsyncStorage.getItem('calendarData');
        if (!storedData) {
          if (!cancelled) {
            setConsumptionIndex(null);
          }
          return;
        }

        const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
          if (key === 'recurringType' && value === null) return undefined;
          return value;
        }) as CalendarData;

        const result = computeConsumptionIndex({
          calendarData,
          year,
          month,
          monthStartDay,
        });

        if (!cancelled) {
          setConsumptionIndex(result);
        }
      } catch {
        if (!cancelled) {
          setConsumptionIndex(null);
        }
      } finally {
        if (!cancelled) {
          setIsConsumptionIndexLoading(false);
        }
      }
    };

    loadConsumptionIndex();

    return () => {
      cancelled = true;
    };
  }, [activeTopTab, reportSubTab, year, month, monthStartDay, dataVersion]);

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

  // 탭 진입 시: 탑 네비 + 날짜 박스 페이드인 (최초 1회만, 이후 screenOpacity는 1 유지)
  useEffect(() => {
    if (!isContentReady || hasInitiallyFadedInRef.current) return;
    hasInitiallyFadedInRef.current = true;
    screenOpacity.setValue(0);
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: MONTH_CHANGE_FADE_IN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isContentReady, screenOpacity]);

  // 챌린지 카드 리스트 페이드인 (탭 진입 시 + 월 변경 시)
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

  const isCollectingIndex = consumptionIndex?.status === 'collecting';
  const fqScore =
    consumptionIndex?.status === 'ready' && typeof consumptionIndex.fqScore === 'number'
      ? Math.round(consumptionIndex.fqScore)
      : null;

  // 소비 지수 계산에 필요한 최소 기록 건수(기획 기준 5건)를 기준으로,
  // 초기 상태에서 몇 건을 더 기록해야 하는지 노출하기 위한 값
  const remainingRecordsForIndex = useMemo(() => {
    if (!consumptionIndex || consumptionIndex.status !== 'collecting') {
      return null;
    }
    const remaining = 5 - consumptionIndex.stats.expenseCount;
    if (remaining <= 0) {
      return null;
    }
    return remaining;
  }, [consumptionIndex]);

  const topCategoryInfo = useMemo(() => {
    const stats = consumptionIndex?.stats;
    if (!stats || stats.totalExpense <= 0 || !stats.categoryTotals || stats.categoryTotals.length === 0) {
      return null;
    }
    const top = stats.categoryTotals[0]!;
    return {
      category: top.category,
      amount: top.amount,
      ratio: top.ratio,
      ratioPercent: top.ratio * 100,
    };
  }, [consumptionIndex]);

  const reportSummaryMessage = useMemo(() => {
    if (aiSummaryText) {
      return aiSummaryText;
    }

    if (!consumptionIndex) {
      return '아직 소비 데이터가 없습니다.\n이번 달부터 지출을 기록해 보세요.';
    }

    if (consumptionIndex.status === 'collecting' || fqScore == null) {
      return '기록은 시작되었지만 아직 소비 패턴을 판단하기에는 데이터가 부족합니다.\n며칠만 더 꾸준히 기록해 주시면 소비 리포트를 볼 수 있어요.';
    }

    if (!topCategoryInfo) {
      if (fqScore >= 80) {
        return '이번 달 소비 페이스는 전반적으로 안정적인 편입니다.\n특정 카테고리에 과도하게 쏠린 지출 없이 균형을 잘 유지하고 있어요.';
      }
      if (fqScore >= 50) {
        return '이번 달 소비 페이스는 다소 빠른 편입니다.\n어떤 요일·시간대에 소비가 몰리는지 한 번 확인해 보세요.';
      }
      return '이번 달에는 지출 속도가 꽤 빠른 편입니다.\n특히 불필요한 소액 지출이 반복되지 않는지 점검해 보시면 좋겠습니다.';
    }

    const categoryLabel = topCategoryInfo.category;
    const ratioText = `${topCategoryInfo.ratioPercent.toFixed(1)}%`;

    if (fqScore >= 80) {
      return `이번 달 소비 페이스는 안정적인 편입니다.\n다만 전체 지출의 ${ratioText}가 '${categoryLabel}'에서 발생하고 있어, 이 카테고리만 조금만 줄이면 더 높은 점수를 기대할 수 있어요.`;
    }
    if (fqScore >= 50) {
      return `이번 달 소비 페이스는 다소 빠른 편입니다.\n특히 '${categoryLabel}' 카테고리가 전체의 ${ratioText}를 차지하고 있어, 이 부분을 한 번 점검해 보시면 좋겠습니다.`;
    }
    return `이번 달에는 지출 속도가 꽤 빠른 편입니다.\n'${categoryLabel}' 카테고리가 전체의 ${ratioText}를 차지해 소비 패턴을 끌어올리고 있어요.\n이 카테고리부터 작게 줄이는 챌린지를 시작해 보세요.`;
  }, [aiSummaryText, consumptionIndex, fqScore, topCategoryInfo]);

  const reportNextGoalMessage = useMemo(() => {
    // 1순위: AI가 생성한 nextWeekGoal이 있으면 그대로 사용
    if (aiNextWeekGoalText && aiNextWeekGoalText.trim().length > 0) {
      return aiNextWeekGoalText.trim();
    }

    // 2순위: 기존 로직 기반 템플릿 (AI 응답이 없거나 형식이 맞지 않을 때만 사용)
    if (!consumptionIndex || fqScore == null) {
      return '다가오는 한 주에는 지출을 기록하는 습관을 먼저 만드는 것을 목표로 해보세요.\n특히 자주 쓰는 카테고리 한두 개만 의식하면서 적어 보는 것만으로도 충분합니다.';
    }

    if (!topCategoryInfo) {
      if (fqScore >= 80) {
        return '다음 주에는 지금과 같은 소비 페이스를 유지하는 것을 목표로 해보세요.\n특별한 소비 계획이 없다면, 이미 잘 하고 계신 패턴을 그대로 이어가셔도 좋습니다.';
      }
      if (fqScore >= 50) {
        return '다음 주에는 평소보다 하루에 한 번 정도만 소비를 줄여 보는 것을 목표로 해보세요.\n특히 큰 의미 없이 나가는 소액 지출이 있다면 한두 번만 덜 쓰는 것부터 시도해보면 좋습니다.';
      }
      return '다가오는 한 주 동안은 지출을 한 번 더 생각해 보고 사용하는 것을 목표로 해보세요.\n꼭 필요하지 않은 소비를 하루에 한 번만 덜 하는 것부터 시작해도 충분합니다.';
    }

    const categoryLabel = topCategoryInfo.category;
    const ratioText = `${topCategoryInfo.ratioPercent.toFixed(1)}%`;

    if (fqScore >= 80) {
      return `다음 주에는 '${categoryLabel}' 지출을 이번 주보다 조금만 줄여 보는 것을 목표로 해보세요.\n현재 전체 지출의 ${ratioText}를 차지하고 있어, 이 부분만 가볍게 조절해도 좋은 흐름을 유지하는 데 도움이 됩니다.`;
    }
    if (fqScore >= 50) {
      return `다음 주에는 '${categoryLabel}' 지출을 한두 번만 덜 쓰는 것을 목표로 해보세요.\n이 카테고리가 전체 지출의 ${ratioText}를 차지하고 있어서, 작은 조정만으로도 전체 소비 페이스를 낮추는 데 도움이 됩니다.`;
    }
    return `다가오는 한 주에는 '${categoryLabel}' 지출을 특히 의식하면서 사용해보세요.\n전체 지출의 ${ratioText}를 차지하고 있어, 이 카테고리에서 한두 번만 줄여도 이번 달 소비 흐름을 바꾸는 데 큰 도움이 됩니다.`;
  }, [aiNextWeekGoalText, consumptionIndex, fqScore, topCategoryInfo]);

  const shouldShowChallengeCard = useMemo(() => {
    if (!consumptionIndex || fqScore == null || !aiChallengeText || !topCategoryInfo) return false;
    // 점수가 충분히 높으면 별도의 챌린지 제안은 하지 않음
    if (fqScore >= 80) return false;
    // 상위 카테고리 비중이 너무 낮으면 챌린지 제안하지 않음
    if (topCategoryInfo.ratioPercent < 15) return false;
    // 이미 해당 카테고리로 생성된 챌린지가 있다면 중복 제안하지 않음
    const hasExistingChallengeForCategory = challenges.some(
      (c) => c.category === topCategoryInfo.category,
    );
    if (hasExistingChallengeForCategory) return false;
    return true;
  }, [consumptionIndex, fqScore, aiChallengeText, topCategoryInfo, challenges]);

  const scoreMessage = useMemo(() => {
    const collectingMessage = (() => {
      const n = remainingRecordsForIndex;
      const countText = typeof n === 'number' ? `${n}건을` : '몇건을';
      return `이번 달 소비 기록이 아직 충분하지 않습니다.\n${countText} 더 기록하시면 소비 진단을 시작할 수 있어요.`;
    })();

    // 아직 점수 확인 전: 초기 안내 문구
    if (!hasCheckedScore) {
      if (isCollectingIndex || fqScore == null) {
        return collectingMessage;
      }
      return '이번 달 소비 점수 계산이 가능합니다.\n아래 버튼을 눌러 점수를 확인해 보세요.';
    }

    // 점수를 확인했지만, 여전히 데이터가 부족한 상태라면 동일한 안내 유지
    if (isCollectingIndex || fqScore == null) {
      return collectingMessage;
    }

    // 점수 확인 후: 우선 AI가 제공한 점수 피드백이 있다면 사용
    if (scoreFeedbackText && scoreFeedbackText.trim().length > 0) {
      return scoreFeedbackText.trim();
    }

    // scoreFeedback이 없을 때는, 점수에 대한 해석을 강하게 고정하지 않고
    // 간단한 중립 문구만 보여준다. (실제 피드백은 summary/summaryTitle에서 제공)
    return '이번 달 소비 패턴을 기준으로 계산된 점수입니다.\n아래 리포트를 함께 보면서 이번 달 소비를 한 번 정리해 보셔도 좋겠습니다.';
  }, [hasCheckedScore, isCollectingIndex, fqScore, remainingRecordsForIndex, scoreFeedbackText]);

  const scoreEmoji = useMemo(() => {
    if (!hasCheckedScore || fqScore == null) {
      return '';
    }

    // 점수 구간별 이모지 후보 (각 10개)
    const topTier = ['🌟', '💎', '🎉', '🏆', '🥇', '✨', '💖', '🙌', '👏', '😎'];
    const goodTier = ['😄', '🙂', '👍', '😊', '🤗', '🌈', '🍀', '💪', '🧡', '😌'];
    const midTier = ['😐', '🤔', '📊', '📈', '📝', '🔍', '📘', '🧠', '💬', '📌'];
    const lowTier = ['😟', '🙁', '💸', '🕳️', '🤯', '😮‍💨', '💭', '🪙', '📉', '😬'];
    const badTier = ['🚨', '⚠️', '🧨', '💣', '🥵', '😵', '🛑', '🔥', '❗️', '🤕'];

    let pool = midTier;
    if (fqScore >= 90) {
      pool = topTier;
    } else if (fqScore >= 75) {
      pool = goodTier;
    } else if (fqScore >= 50) {
      pool = midTier;
    } else if (fqScore >= 30) {
      pool = lowTier;
    } else {
      pool = badTier;
    }

    // 점수를 기준으로 "랜덤하지만 재현 가능한" 인덱스 선택
    const seed = fqScore * 13;
    const idx = Math.abs(seed) % pool.length;
    return pool[idx] ?? '';
  }, [hasCheckedScore, fqScore]);

  const runReportContentRefreshAnimation = useCallback(
    (onAfterFadeOut?: () => void) => {
      if (activeTopTab !== 'report' || reportSubTab !== 'score') {
        // 탭이 다른 경우에는 그냥 콜백만 실행
        if (onAfterFadeOut) {
          onAfterFadeOut();
        }
        return;
      }
      Animated.timing(reportContentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished) return;
        if (onAfterFadeOut) {
          onAfterFadeOut();
        }
        reportContentOpacity.setValue(0);
        Animated.timing(reportContentOpacity, {
          toValue: 1,
          duration: MONTH_CHANGE_FADE_IN_DURATION,
          useNativeDriver: true,
        }).start();
      });
    },
    [activeTopTab, reportSubTab, reportContentOpacity],
  );

  const handleCheckScore = useCallback(async () => {
    if (!consumptionIndex || consumptionIndex.status !== 'ready' || fqScore == null) {
      showToast('소비 지수는 기록이 조금 더 쌓인 후 확인할 수 있습니다.');
      return;
    }

    if (monthStartDay <= 0) {
      showToast('월 시작일 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    let didUpdate = false;
    let nextSummary: string | null = null;
    let nextSummaryTitle: string | null = null;
    let nextChallenge: string | null = null;
    let nextScoreFeedback: string | null = null;
    let nextNextWeekGoal: string | null = null;

    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData) {
        showToast('기록 데이터가 없습니다. 먼저 소비를 기록해 주세요.');
        return;
      }

      const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
        if (key === 'recurringType' && value === null) return undefined;
        return value;
      }) as CalendarData;

      const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      let lastRecordUpdatedAt = 0;

      Object.entries(calendarData).forEach(([dateKey, dayData]) => {
        if (!dayData || !dayData.records || dayData.records.length === 0) {
          return;
        }
        const date = new Date(dateKey);
        const time = date.getTime();
        if (time < start.getTime() || time > end.getTime()) {
          return;
        }
        dayData.records.forEach((record) => {
          if (record.type !== 'expense' || record.isDeleted) return;
          const ts =
            typeof record.timestamp === 'number' && !Number.isNaN(record.timestamp)
              ? record.timestamp
              : time;
          if (ts > lastRecordUpdatedAt) {
            lastRecordUpdatedAt = ts;
          }
        });
      });

      if (lastRecordUpdatedAt === 0) {
        showToast('이번 달에는 아직 소비 기록이 없습니다.');
        return;
      }

      const cacheKey = `consumptionReport_${year}_${month}_${monthStartDay}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as {
            summary: string;
            summaryTitle?: string;
            challenge: string;
            scoreFeedback?: string;
            nextWeekGoal?: string;
            lastRecordUpdatedAt: number;
          };

          // (1) 이미 이 월에서 한 번 이상 분석했고, 데이터도 그대로라면 → 분석 중단
          if (parsed.lastRecordUpdatedAt === lastRecordUpdatedAt && hasCheckedScore) {
            showToast('변경내역이 없어 분석을 중단합니다.');
            return;
          }

          // (2) 분석 이력은 있지만, 이번 세션에서 아직 점수를 확인하지 않은 경우 → 캐시 재사용
          if (parsed.lastRecordUpdatedAt === lastRecordUpdatedAt && !hasCheckedScore) {
            nextSummary = parsed.summary.trim();
            nextChallenge = parsed.challenge.trim();

            runReportContentRefreshAnimation(() => {
              if (nextSummary && nextChallenge) {
                setAiSummaryText(nextSummary);
                setAiChallengeText(nextChallenge);
                if (typeof parsed.summaryTitle === 'string') {
                  setAiSummaryTitleText(parsed.summaryTitle.trim());
                }
                if (typeof parsed.scoreFeedback === 'string') {
                  setScoreFeedbackText(parsed.scoreFeedback.trim());
                }
                if (typeof parsed.nextWeekGoal === 'string') {
                  setAiNextWeekGoalText(parsed.nextWeekGoal.trim());
                }
                setHasCheckedScore(true);
              }
            });
            return;
          }
        } catch {
          // ignore cache parse error
        }
      }

      // (3) 여기까지 왔다면: 캐시가 없거나, 데이터가 변경된 상태 → 새로 분석 수행
      setIsAiLoading(true);

      const res = await fetch(CONSUMPTION_REPORT_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fqScore,
          stats: {
            year,
            month,
            totalExpense: consumptionIndex.stats.totalExpense,
            noSpendDays: consumptionIndex.stats.noSpendDays,
            totalDays: consumptionIndex.stats.totalDays,
            highAmountRatio: consumptionIndex.stats.highAmountRatio,
            categoryTotals: consumptionIndex.stats.categoryTotals,
            expenseCount: consumptionIndex.stats.expenseCount,
            activeDays: Object.keys(consumptionIndex.stats.dailyExpenseCounts).length,
          },
        }),
      });

      if (!res.ok) {
        showToast('AI 리포트를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }

      const data = (await res.json()) as {
        summary?: string;
        summaryTitle?: string;
        challenge?: string;
        scoreFeedback?: string;
        nextWeekGoal?: string;
      };
      const dataObj = data as {
        scoreFeedback?: string;
        summaryTitle?: string;
        summary?: string;
        challenge?: string;
        nextWeekGoal?: string;
      };
      const summary = typeof dataObj.summary === 'string' ? dataObj.summary.trim() : '';
      const summaryTitle =
        typeof dataObj.summaryTitle === 'string' ? dataObj.summaryTitle.trim() : '';
      const challenge = typeof dataObj.challenge === 'string' ? dataObj.challenge.trim() : '';
      const scoreFeedback =
        typeof dataObj.scoreFeedback === 'string' ? dataObj.scoreFeedback.trim() : '';
      const nextWeekGoal =
        typeof dataObj.nextWeekGoal === 'string' ? dataObj.nextWeekGoal.trim() : '';

      if (!summary || !challenge) {
        showToast('AI 리포트 형식이 올바르지 않습니다.');
        return;
      }

      nextSummary = summary;
      nextChallenge = challenge;
      if (summaryTitle) {
        nextSummaryTitle = summaryTitle;
      }
      if (scoreFeedback) {
        nextScoreFeedback = scoreFeedback;
      }
      if (nextWeekGoal) {
        nextNextWeekGoal = nextWeekGoal;
      }
      didUpdate = true;

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({
          summary,
          summaryTitle: summaryTitle || undefined,
          challenge,
          scoreFeedback: scoreFeedback || undefined,
          nextWeekGoal: nextWeekGoal || undefined,
          lastRecordUpdatedAt,
        }),
      );
    } catch {
      showToast('AI 리포트 생성 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsAiLoading(false);
      if (didUpdate && nextSummary && nextChallenge) {
        runReportContentRefreshAnimation(() => {
          setAiSummaryText(nextSummary!);
          setAiChallengeText(nextChallenge!);
          if (nextSummaryTitle) {
            setAiSummaryTitleText(nextSummaryTitle);
          }
          if (nextScoreFeedback) {
            setScoreFeedbackText(nextScoreFeedback);
          }
          if (nextNextWeekGoal) {
            setAiNextWeekGoalText(nextNextWeekGoal);
          }
          setHasCheckedScore(true);
        });
      }
    }
  }, [
    consumptionIndex,
    fqScore,
    monthStartDay,
    year,
    month,
    hasCheckedScore,
    showToast,
    runReportContentRefreshAnimation,
  ]);

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
        {/* 탭 진입 시: 데이터 로드 완료 후 탑 네비 + 날짜 박스 페이드인 (월 변경 시에는 애니메이션 없음) */}
        <Animated.View style={{ opacity: screenOpacity }}>
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
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            { backgroundColor: colors.fill, opacity: screenOpacity },
          ]}
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

                  {/* 점수 카드 + AI 리포트 (Frame 226/227/228) - 월 변경 시 페이드 아웃/인 */}
                  <Animated.View style={{ opacity: reportContentOpacity }}>
                    <View
                      style={[
                        styles.reportScoreCard,
                        {
                          backgroundColor: colors.staticWhite,
                          // 버튼을 눌러 점수를 확인하기 전까지는 피그마 시안처럼 큰 높이 유지
                          // 한 번 점수를 확인하면 콘텐츠 높이에 맞게 축소
                          minHeight: hasCheckedScore && fqScore != null ? undefined : reportScoreCardHeight,
                        },
                      ]}
                    >
                      <Text style={[styles.reportScoreLabel, { color: colors.textAssistive }]}>
                        이번달 소비 점수는?
                      </Text>
                      <View style={styles.reportScoreValueRow}>
                        <Text style={[styles.reportScoreEmoji, { color: colors.text }]}>
                          {hasCheckedScore && fqScore != null ? scoreEmoji : ''}
                        </Text>
                        <Text style={[styles.reportScoreValue, { color: colors.text }]}>
                          {hasCheckedScore && fqScore != null ? fqScore : '?'}
                        </Text>
                        <Text style={[styles.reportScoreUnit, { color: colors.text }]}>점</Text>
                      </View>
                      <Text style={[styles.reportScoreMessage, { color: colors.textNeutral }]}>
                        {scoreMessage}
                      </Text>
                      <Button
                        variant="primary"
                        type="solid"
                        size="large"
                        onPress={handleCheckScore}
                        loading={isAiLoading}
                      >
                        점수 확인하기
                      </Button>
                    </View>

                    {aiSummaryText && (
                      <View
                        style={[
                          styles.reportSummaryCard,
                          { backgroundColor: colors.staticWhite },
                        ]}
                      >
                        <Text style={[styles.reportSummaryTitle, { color: colors.text }]}>
                          📊 이번 달 리포트
                        </Text>
                        <View style={styles.reportSummaryRows}>
                          <View style={styles.reportSummaryRow}>
                            <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                              월간 지출
                            </Text>
                            <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                              {consumptionIndex
                                ? `${consumptionIndex.stats.totalExpense.toLocaleString()}원`
                                : '0원'}
                            </Text>
                          </View>
                          <View style={styles.reportSummaryRow}>
                            <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                              무지출일
                            </Text>
                            <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                              {consumptionIndex
                                ? `${consumptionIndex.stats.noSpendDays}일 / ${consumptionIndex.stats.totalDays}일`
                                : '-'}
                            </Text>
                          </View>
                        </View>
                        {aiSummaryTitleText && (
                          <Text style={[styles.reportSummaryHeadline, { color: colors.text }]}>
                            {aiSummaryTitleText}
                          </Text>
                        )}
                        <Text style={[styles.reportSummaryBody, { color: colors.textNeutral }]}>
                          {reportSummaryMessage}
                        </Text>
                        <View style={styles.reportNextGoal}>
                          <Text style={[styles.reportNextGoalTitle, { color: colors.text }]}>
                            📌 다음 주 목표
                          </Text>
                          <Text style={[styles.reportNextGoalBody, { color: colors.textNeutral }]}>
                            {reportNextGoalMessage}
                          </Text>
                        </View>
                      </View>
                    )}

                    {shouldShowChallengeCard && (
                      <View
                        style={[
                          styles.reportChallengeCard,
                          { backgroundColor: colors.staticWhite },
                        ]}
                      >
                        <Text style={[styles.reportChallengeTitle, { color: colors.text }]}>
                          🎯 챌린지 제안
                        </Text>
                        {topCategoryInfo && consumptionIndex && (
                          <View style={styles.reportSummaryRows}>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                                카테고리
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                                {topCategoryInfo.category}
                              </Text>
                            </View>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                                총 소비금액
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                                {`${topCategoryInfo.amount.toLocaleString()}원`}
                              </Text>
                            </View>
                          </View>
                        )}
                        <Text style={[styles.reportChallengeBody, { color: colors.textNeutral }]}>
                          {aiChallengeText}
                        </Text>
                      </View>
                    )}
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
        </Animated.View>

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
    paddingHorizontal: 0,
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
  reportScoreEmoji: {
    ...Typography.headline1.xl.bold,
    fontSize: 28,
    lineHeight: 40,
    marginRight: 4,
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
  reportSummaryCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 16,
  },
  reportSummaryTitle: {
    ...Typography.body2.r.bold,
    marginBottom: 8,
  },
  reportSummaryHeadline: {
    ...Typography.body2.r.bold,
    marginBottom: 8,
  },
  reportSummaryRows: {
    marginBottom: 12,
  },
  reportSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingVertical: 2,
  },
  reportSummaryLabel: {
    ...Typography.body2.r.regular,
    width: 72,
  },
  reportSummaryValue: {
    ...Typography.body2.r.bold,
    flexShrink: 1,
  },
  reportSummaryBody: {
    ...Typography.body2.r.regular,
    marginTop: 0,
  },
  reportNextGoal: {
    marginTop: 12,
  },
  reportNextGoalTitle: {
    ...Typography.body2.r.bold,
    marginBottom: 4,
  },
  reportNextGoalBody: {
    ...Typography.body2.r.regular,
  },
  reportChallengeCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 16,
  },
  reportChallengeTitle: {
    ...Typography.body2.r.bold,
    marginBottom: 8,
  },
  reportChallengeBody: {
    ...Typography.body2.r.regular,
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
