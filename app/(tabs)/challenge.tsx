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
import { getApiSecurityHeaders } from '@/utils/api-security-headers';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { getChallengesByDateRange } from '@/utils/challenges';
import {
    computeConsumptionIndex,
    type CalendarData,
    type ConsumptionIndexResult,
} from '@/utils/consumption-index';
import { createSheetEvent } from '@/utils/create-sheet-event';
import {
  getCustomMonthInfo,
  getCustomMonthRange,
  isDateInCustomMonth,
  parseCalendarDateKeyLocal,
} from '@/utils/custom-month';
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
const REPORT_CACHE_PREFIX = 'consumptionReportCtx';
const CONSUMPTION_REPORT_RESET_AT_KEY = 'consumptionReportResetAt';
const CONSUMPTION_REPORT_RESET_HANDLED_AT_KEY = 'consumptionReportResetHandledAt';
const CONSUMPTION_REPORT_API_TIMEOUT_MS = 15000;
/** 이 문자열을 바꾸면 `REPORT_POLICY_FINGERPRINT`가 달라지고, 저장된 소비 리포트 캐시는 복구 시 지문 불일치로 제외될 수 있음 */
const REPORT_POLICY_FINGERPRINT_SOURCE = [
  'summary_metric_autoinject=false',
  'metric_order=category,amount(ratio,count)',
  'confirmed_report_meta_snapshot=true',
  'reset_signal_key=consumptionReportResetAt',
].join('|');
const REPORT_POLICY_FINGERPRINT = `pf_${hashString(REPORT_POLICY_FINGERPRINT_SOURCE)}`;

function getConsumptionReportErrorMessage(
  status: number,
  retryAfterSec?: number,
): string {
  if (status === 408 || status === 504) {
    return '응답이 지연되고 있습니다. 다시 시도해 주세요.';
  }
  if (status === 403) {
    return '인증 정보 확인이 필요합니다. 잠시 후 다시 시도해 주세요.';
  }
  if (status === 429) {
    if (typeof retryAfterSec === 'number' && Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
      return `현재 요청이 많습니다. ${Math.ceil(retryAfterSec)}초 후 다시 시도해 주세요.`;
    }
    return '현재 요청이 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (status === 500) {
    return '서버 설정 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (status === 502 || status === 503) {
    return '현재 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.';
  }
  return '오류가 발생했습니다. 다시 시도해 주세요.';
}

function getRetryPolicy(status: number): 'no_retry' | 'manual_retry' {
  // 인증/레이트리밋/업스트림 오류는 자동 재시도하지 않는다.
  if (status === 403 || status === 429 || status === 502) {
    return 'no_retry';
  }
  return 'manual_retry';
}

interface ReportContext {
  year: number;
  month: number;
  monthStartDay: number;
  monthStartUpdatedAt: number;
  asOfDate: string;
  isMonthClosed: boolean;
  elapsedDaysInMonth: number;
  timezone: string;
  policyFingerprint: string;
}

interface ReportSnapshot {
  /** 해당 월·as-of 범위 내 지출 기록의 최신 갱신 시각(ms). API 본문·캐시 메타 등 */
  lastRecordUpdatedAt: number;
  /** 커스텀 월 내 지출 레코드 집합 지문(해시) — 추가·수정·삭제(및 삭제 표시) 시 변함. `handleCheckScore` 변경 없음 스킵 판정에 사용 */
  dataRevision: string;
  toDateTotalExpense: number;
  toDateExpenseCount: number;
  toDateActiveDays: number;
  noSpendDaysToDate: number;
  toDateCategoryTotals: Array<{ category: string; amount: number; ratio: number }>;
  toDateCategoryUsage: Array<{ category: string; count: number; projectedMonthlyCount: number }>;
}

interface ConfirmedTopCategoryInfo {
  category: string;
  amount: number;
  ratioPercent: number;
}

interface ConfirmedReportMeta {
  fqScore: number;
  totalExpense: number;
  noSpendDays: number;
  totalDays: number;
  topCategoryInfo: ConfirmedTopCategoryInfo | null;
}

function formatDateToYmd(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function getLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function buildReportContext(year: number, month: number, monthStartDay: number): ReportContext | null {
  if (monthStartDay <= 0) return null;
  const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const now = new Date();
  const isMonthNotStarted = now.getTime() < start.getTime();
  const isMonthClosed = now.getTime() > end.getTime();
  const asOf = isMonthClosed ? new Date(end) : isMonthNotStarted ? new Date(start) : new Date(now);
  asOf.setHours(23, 59, 59, 999);
  const elapsedDaysInMonth = isMonthNotStarted
    ? 0
    : Math.max(1, Math.floor((asOf.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  return {
    year,
    month,
    monthStartDay,
    monthStartUpdatedAt: 0,
    asOfDate: formatDateToYmd(asOf),
    isMonthClosed,
    elapsedDaysInMonth,
    timezone: getLocalTimezone(),
    policyFingerprint: REPORT_POLICY_FINGERPRINT,
  };
}

function buildReportCacheKey(context: ReportContext): string {
  const source = [
    context.year,
    context.month,
    context.monthStartDay,
    context.monthStartUpdatedAt,
    context.asOfDate,
    context.isMonthClosed ? '1' : '0',
    context.elapsedDaysInMonth,
    context.timezone,
    context.policyFingerprint,
  ].join('|');
  return `${REPORT_CACHE_PREFIX}_${hashString(source)}`;
}

/**
 * 커스텀 월에 속한 지출 레코드(삭제 표시 포함) 상태를 문자열로 정규화해 해시합니다.
 * 금액·카테고리·메모·정기/할부·timestamp·삭제 여부가 바뀌면 값이 달라집니다.
 */
function computeMonthExpenseDataRevision(
  calendarData: CalendarData,
  context: ReportContext,
): string {
  const { startDate, endDate } = getCustomMonthRange(context.year, context.month, context.monthStartDay);
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);

  const parts: string[] = [];
  Object.entries(calendarData).forEach(([dateKey, dayData]) => {
    if (!dayData?.records?.length) return;
    const date = parseCalendarDateKeyLocal(dateKey);
    if (date == null) return;
    const dayTime = date.getTime();
    if (dayTime < rangeStart.getTime() || dayTime > rangeEnd.getTime()) return;

    dayData.records.forEach((record) => {
      if (record.type !== 'expense') return;
      const id = record.id ?? '';
      const amount = typeof record.amount === 'number' ? record.amount : 0;
      const ts =
        typeof record.timestamp === 'number' && !Number.isNaN(record.timestamp)
          ? record.timestamp
          : dayTime;
      const del = record.isDeleted === true ? 1 : 0;
      const rec = record.isRecurring === true ? 1 : 0;
      const inst = record.isInstallment === true ? 1 : 0;
      const ref = (record as { isRefunded?: boolean }).isRefunded === true ? 1 : 0;
      const cat = String(record.category ?? '');
      const memo = String((record as { memo?: string }).memo ?? '');
      parts.push(`${dateKey}\t${id}\t${amount}\t${ts}\t${del}\t${ref}\t${rec}\t${inst}\t${cat}\t${memo}`);
    });
  });
  parts.sort();
  return hashString(parts.join('\n'));
}

/** API 요청 본문·변경 감지용 스냅샷. 캐시 화면 복구는 `syncReportFromCache`에서 별도 조건 */
function computeReportSnapshot(
  calendarData: CalendarData,
  context: ReportContext,
): ReportSnapshot {
  const { startDate, endDate } = getCustomMonthRange(context.year, context.month, context.monthStartDay);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  const asOfDate = new Date(`${context.asOfDate}T23:59:59`);
  const asOfTime = asOfDate.getTime();

  let lastRecordUpdatedAt = 0;
  let toDateTotalExpense = 0;
  let toDateExpenseCount = 0;
  const toDateDailyExpenseCounts: Record<string, number> = {};
  const toDateCategoryMap = new Map<string, number>();
  const toDateCategoryUsageMap = new Map<string, number>();

  Object.entries(calendarData).forEach(([dateKey, dayData]) => {
    if (!dayData?.records || dayData.records.length === 0) return;
    const date = parseCalendarDateKeyLocal(dateKey);
    if (date == null) return;
    const time = date.getTime();
    if (time < start.getTime() || time > end.getTime()) return;

    dayData.records.forEach((record) => {
      if (record.type !== 'expense' || record.isDeleted) return;
      const amount = typeof record.amount === 'number' ? record.amount : 0;
      const ts =
        typeof record.timestamp === 'number' && !Number.isNaN(record.timestamp)
          ? record.timestamp
          : time;
      if (ts > lastRecordUpdatedAt) lastRecordUpdatedAt = ts;

      if (context.elapsedDaysInMonth > 0 && time <= asOfTime) {
        toDateTotalExpense += amount;
        toDateExpenseCount += 1;
        toDateDailyExpenseCounts[dateKey] = (toDateDailyExpenseCounts[dateKey] ?? 0) + 1;
        const isRecurring = record.isRecurring === true;
        const isInstallment = record.isInstallment === true;
        if (!isRecurring && !isInstallment) {
          const categoryKey = record.category ?? '기타';
          const prevAmount = toDateCategoryMap.get(categoryKey) ?? 0;
          toDateCategoryMap.set(categoryKey, prevAmount + amount);
          const prevCount = toDateCategoryUsageMap.get(categoryKey) ?? 0;
          toDateCategoryUsageMap.set(categoryKey, prevCount + 1);
        }
      }
    });
  });

  const toDateActiveDays = Object.keys(toDateDailyExpenseCounts).length;
  const noSpendDaysToDate = Math.max(0, context.elapsedDaysInMonth - toDateActiveDays);
  const toDateCategoryTotals = Array.from(toDateCategoryMap.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      ratio: toDateTotalExpense > 0 ? amount / toDateTotalExpense : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const elapsedDays = Math.max(1, context.elapsedDaysInMonth);
  const monthLength = Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
  );
  const projectedMultiplier = monthLength / elapsedDays;
  const toDateCategoryUsage = Array.from(toDateCategoryUsageMap.entries())
    .map(([category, count]) => ({
      category,
      count,
      projectedMonthlyCount: Math.max(0, Math.round(count * projectedMultiplier)),
    }))
    .sort((a, b) => b.count - a.count);

  const dataRevision = computeMonthExpenseDataRevision(calendarData, context);

  return {
    lastRecordUpdatedAt,
    dataRevision,
    toDateTotalExpense,
    toDateExpenseCount,
    toDateActiveDays,
    noSpendDaysToDate,
    toDateCategoryTotals,
    toDateCategoryUsage,
  };
}

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
  const [aiSummaryText, setAiSummaryText] = useState<string[] | null>(null);
  const [aiChallengeText, setAiChallengeText] = useState<string[] | null>(null);
  const [aiSummaryTitleText, setAiSummaryTitleText] = useState<string | null>(null);
  const [scoreFeedbackText, setScoreFeedbackText] = useState<string[] | null>(null);
  const [aiNextWeekGoalText, setAiNextWeekGoalText] = useState<string[] | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [hasCheckedScore, setHasCheckedScore] = useState(false);
  const [confirmedReportMeta, setConfirmedReportMeta] = useState<ConfirmedReportMeta | null>(null);
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
  const activeTopTabRef = useRef<TopTabId>('challenge');
  const reportSubTabRef = useRef<ReportSubTabId>('score');
  useEffect(() => {
    activeTopTabRef.current = activeTopTab;
  }, [activeTopTab]);
  useEffect(() => {
    reportSubTabRef.current = reportSubTab;
  }, [reportSubTab]);

  const params = useLocalSearchParams<{ year?: string; month?: string; tab?: string }>();

  const [monthStartDay, setMonthStartDay] = useState(1);
  const [monthStartUpdatedAt, setMonthStartUpdatedAt] = useState(0);
  const now = new Date();
  const initialYear = params.year ? parseInt(params.year, 10) || now.getFullYear() : now.getFullYear();
  const initialMonth = params.month ? parseInt(params.month, 10) || now.getMonth() + 1 : now.getMonth() + 1;
  const [challengeYear, setChallengeYear] = useState(initialYear);
  const [challengeMonth, setChallengeMonth] = useState(initialMonth);
  const [reportScoreYear, setReportScoreYear] = useState(initialYear);
  const [reportScoreMonth, setReportScoreMonth] = useState(initialMonth);
  const [reportTrendYear, setReportTrendYear] = useState(initialYear);
  const [reportTrendMonth, setReportTrendMonth] = useState(initialMonth);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  const activeReportYear = reportSubTab === 'score' ? reportScoreYear : reportTrendYear;
  const activeReportMonth = reportSubTab === 'score' ? reportScoreMonth : reportTrendMonth;
  const activeYear = activeTopTab === 'report' ? activeReportYear : challengeYear;
  const activeMonth = activeTopTab === 'report' ? activeReportMonth : challengeMonth;
  const reportScoreContext = useMemo(
    () => {
      const base = buildReportContext(reportScoreYear, reportScoreMonth, monthStartDay);
      if (base == null) return null;
      return {
        ...base,
        monthStartUpdatedAt,
      };
    },
    [reportScoreYear, reportScoreMonth, monthStartDay, monthStartUpdatedAt],
  );
  const reportScoreCacheKey = useMemo(
    () => (reportScoreContext ? buildReportCacheKey(reportScoreContext) : null),
    [reportScoreContext],
  );

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
      if (params.tab === 'status') {
        setReportScoreYear(paramYear);
      } else {
        setChallengeYear(paramYear);
      }
    }
    if (paramMonth != null && !Number.isNaN(paramMonth) && paramMonth >= 1 && paramMonth <= 12) {
      if (params.tab === 'status') {
        setReportScoreMonth(paramMonth);
      } else {
        setChallengeMonth(paramMonth);
      }
    }
  }, [params.year, params.month, params.tab]);

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
  const prevReportScoreMonthRef = useRef<{ year: number; month: number } | null>(null);
  const prevReportTrendMonthRef = useRef<{ year: number; month: number } | null>(null);
  const prevReportSyncKeyRef = useRef<string | null>(null);
  const handledReportResetAtRef = useRef<number>(0);
  const reportNeedsFadeInRef = useRef(false);
  const reportFadeOutInProgressRef = useRef(false);
  const reportPendingTrendFadeInRef = useRef(false);

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
      const monthStartUpdatedAtRaw = await AsyncStorage.getItem('monthStartDayUpdatedAt');
      const parsedMonthStartUpdatedAt = Number(monthStartUpdatedAtRaw ?? 0);
      setMonthStartUpdatedAt(
        Number.isFinite(parsedMonthStartUpdatedAt) ? parsedMonthStartUpdatedAt : 0,
      );

      const { startDate: customStart, endDate: customEnd } = getCustomMonthRange(
        challengeYear,
        challengeMonth,
        monthStart,
      );
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
        return isDateInCustomMonth(startDate, challengeYear, challengeMonth, monthStart);
      });
      setChallenges(activeChallenges);

      setIsContentReady(true);
      hasAnimatedRef.current = true;
      challengeRefreshedForRef.current = { year: challengeYear, month: challengeMonth };
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
      challengeRefreshedForRef.current = { year: challengeYear, month: challengeMonth };
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
  }, [challengeYear, challengeMonth, beginLoad, endLoad, contentOpacity]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const { dataVersion } = useAppData();
  useEffect(() => {
    refreshData();
  }, [dataVersion, challengeYear, challengeMonth, refreshData]);

  // 년·월 컨텍스트 변경/외부 reset 신호(복원 등)가 있을 때만 리포트를 초기화하고,
  // 일반 데이터 변경(dataVersion 증가)에서는 기존 리포트를 유지한다.
  useEffect(() => {
    let cancelled = false;

    const syncReportFromCache = async () => {
      const currentSyncKey =
        reportScoreCacheKey ??
        `none:${reportScoreYear}-${reportScoreMonth}-${monthStartDay}`;
      const prevSyncKey = prevReportSyncKeyRef.current;
      const contextChanged = prevSyncKey != null && prevSyncKey !== currentSyncKey;
      // `reportScoreCacheKey`가 아직 없을 때만 쓰는 `none:…` 플레이스홀더 → 실제 키로 처음 바뀌는 경우는
      // 사용자가 맥락을 바꾼 것이 아니라 로드 안정화에 가깝다 → 리포트 UI를 비우지 않음
      const suppressResetForPlaceholderToRealKey =
        contextChanged &&
        prevSyncKey.startsWith('none:') &&
        reportScoreCacheKey != null;
      prevReportSyncKeyRef.current = currentSyncKey;

      let shouldResetUi = contextChanged && !suppressResetForPlaceholderToRealKey;
      try {
        // 처리된 reset 시각은 컴포넌트 생명주기 밖에서도 유지해,
        // 화면 재진입 시 과거 reset 신호를 다시 소비하지 않도록 한다.
        const handledResetAtRaw = await AsyncStorage.getItem(
          CONSUMPTION_REPORT_RESET_HANDLED_AT_KEY,
        );
        const handledResetAt = Number(handledResetAtRaw ?? 0);
        if (
          Number.isFinite(handledResetAt) &&
          handledResetAt > handledReportResetAtRef.current
        ) {
          handledReportResetAtRef.current = handledResetAt;
        }

        const reportResetAtRaw = await AsyncStorage.getItem(
          CONSUMPTION_REPORT_RESET_AT_KEY,
        );
        const reportResetAt = Number(reportResetAtRaw ?? 0);
        if (
          Number.isFinite(reportResetAt) &&
          reportResetAt > handledReportResetAtRef.current
        ) {
          handledReportResetAtRef.current = reportResetAt;
          shouldResetUi = true;
          await AsyncStorage.setItem(
            CONSUMPTION_REPORT_RESET_HANDLED_AT_KEY,
            String(reportResetAt),
          );
        }
      } catch {
        // reset 신호 확인 실패 시 기존 상태 유지
      }

      if (shouldResetUi && !cancelled) {
        setHasCheckedScore(false);
        setAiSummaryText(null);
        setAiChallengeText(null);
        setScoreFeedbackText(null);
        setAiSummaryTitleText(null);
        setAiNextWeekGoalText(null);
        setConfirmedReportMeta(null);
      }

      if (reportScoreContext == null || reportScoreCacheKey == null) {
        return;
      }

      try {
        const cached = await AsyncStorage.getItem(reportScoreCacheKey);
        if (!cached || cancelled) return;

        const parsed = JSON.parse(cached) as {
          summary?: string | string[];
          summaryTitle?: string;
          challenge?: string | string[];
          scoreFeedback?: string | string[];
          nextWeekGoal?: string | string[];
          policyFingerprint?: string;
          confirmedFqScore?: number;
          confirmedTotalExpense?: number;
          confirmedNoSpendDays?: number;
          confirmedTotalDays?: number;
          confirmedTopCategory?: {
            category?: string;
            amount?: number;
            ratioPercent?: number;
          };
          lastRecordUpdatedAt?: number;
          dataRevision?: string;
          asOfDate?: string;
          monthStartUpdatedAt?: number;
        };
        const canReuseByAsOfDate =
          reportScoreContext.isMonthClosed || parsed.asOfDate === reportScoreContext.asOfDate;
        const canReuseByMonthStartVersion =
          Number(parsed.monthStartUpdatedAt ?? 0) === reportScoreContext.monthStartUpdatedAt;
        const canReuseByPolicyFingerprint =
          typeof parsed.policyFingerprint === 'string' &&
          parsed.policyFingerprint === reportScoreContext.policyFingerprint;
        // 맥락(as-of, 월 시작일 설정 버전, 리포트 정책 지문)이 같으면 캐시 본문을 UI에 복원한다.
        // 지출 기록이 이후 추가·수정되어도 이전에 확정한 리포트 문구는 유지한다(handleCheckScore의
        // "변경 없음 → API 스킵" 판정은 dataRevision으로 별도 유지).
        if (
          canReuseByAsOfDate &&
          canReuseByMonthStartVersion &&
          canReuseByPolicyFingerprint &&
          parsed.summary &&
          parsed.challenge
        ) {
          if (!cancelled) {
            const summaryLines = splitLines(
              Array.isArray(parsed.summary) ? parsed.summary.join('\n') : parsed.summary.trim(),
            );
            const challengeLines = splitLines(
              Array.isArray(parsed.challenge)
                ? parsed.challenge.join('\n')
                : parsed.challenge.trim(),
            );
            setAiSummaryText(summaryLines);
            setAiChallengeText(challengeLines);
            if (typeof parsed.summaryTitle === 'string') {
              setAiSummaryTitleText(parsed.summaryTitle.trim());
            }
            if (typeof parsed.scoreFeedback !== 'undefined') {
              const feedbackLines = splitLines(
                Array.isArray(parsed.scoreFeedback)
                  ? parsed.scoreFeedback.join('\n')
                  : parsed.scoreFeedback.trim(),
              );
              setScoreFeedbackText(feedbackLines);
            }
            if (typeof parsed.nextWeekGoal !== 'undefined') {
              const goalLines = splitLines(
                Array.isArray(parsed.nextWeekGoal)
                  ? parsed.nextWeekGoal.join('\n')
                  : parsed.nextWeekGoal.trim(),
              );
              setAiNextWeekGoalText(goalLines);
            }
            if (
              typeof parsed.confirmedFqScore === 'number' &&
              typeof parsed.confirmedTotalExpense === 'number' &&
              typeof parsed.confirmedNoSpendDays === 'number' &&
              typeof parsed.confirmedTotalDays === 'number'
            ) {
              const confirmedTopCategory =
                parsed.confirmedTopCategory &&
                typeof parsed.confirmedTopCategory.category === 'string' &&
                typeof parsed.confirmedTopCategory.amount === 'number' &&
                typeof parsed.confirmedTopCategory.ratioPercent === 'number'
                  ? {
                      category: parsed.confirmedTopCategory.category,
                      amount: parsed.confirmedTopCategory.amount,
                      ratioPercent: parsed.confirmedTopCategory.ratioPercent,
                    }
                  : null;
              setConfirmedReportMeta({
                fqScore: parsed.confirmedFqScore,
                totalExpense: parsed.confirmedTotalExpense,
                noSpendDays: parsed.confirmedNoSpendDays,
                totalDays: parsed.confirmedTotalDays,
                topCategoryInfo: confirmedTopCategory,
              });
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
  }, [
    reportScoreYear,
    reportScoreMonth,
    monthStartDay,
    dataVersion,
    reportScoreContext,
    reportScoreCacheKey,
  ]);

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
          year: reportScoreYear,
          month: reportScoreMonth,
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
  }, [activeTopTab, reportSubTab, reportScoreYear, reportScoreMonth, monthStartDay, dataVersion]);

  // 소비 현황(이번달 지출 순위/정기 지출)용 타임라인 데이터 - 월 상세현황과 동일 로직
  useEffect(() => {
    let cancelled = false;
    setReportTrendContentReady(false);
    const load = async () => {
      const monthStart = await loadMonthStartDay();
      if (cancelled) return;
      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData || cancelled) {
        if (!cancelled) {
          setTrendTimelineData([]);
          setReportTrendContentReady(true);
        }
        return;
      }
      try {
        const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
          if (key === 'recurringType' && value === null) return undefined;
          return value;
        }) as Record<
          string,
          {
            records?: Array<{
              type?: string;
              category?: string;
              amount?: number;
              memo?: string;
              isRecurring?: boolean;
              isDeleted?: boolean;
            }>;
          }
        >;
        const items: TrendTimelineItem[] = [];
        Object.entries(calendarData).forEach(([dateString, data]) => {
          const [y, m, d] = dateString.split('-').map(Number);
          const date = new Date(y, m - 1, d);
          if (!isDateInCustomMonth(date, reportTrendYear, reportTrendMonth, monthStart) || !data?.records) return;
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
      } catch {
        if (!cancelled) {
          setTrendTimelineData([]);
          setReportTrendContentReady(true);
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reportTrendYear, reportTrendMonth, dataVersion]);

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
    const paddedMonth = String(activeMonth).padStart(2, '0');
    const syntheticDate = `${activeYear}-${paddedMonth}-01`;

    updateCalendarContext({
      selectedDate: syntheticDate,
      calendarYear: activeYear,
      calendarMonth: activeMonth,
    });
  }, [activeYear, activeMonth, updateCalendarContext]);

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
      prevChallengeMonthRef.current = { year: challengeYear, month: challengeMonth };
      return;
    }
    if (prev.year !== challengeYear || prev.month !== challengeMonth) {
      prevChallengeMonthRef.current = { year: challengeYear, month: challengeMonth };
      challengeRefreshedForRef.current = null;
      challengeMonthChangeInProgressRef.current = true;
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (
          finished &&
          (challengeRefreshedForRef.current?.year !== challengeYear ||
            challengeRefreshedForRef.current?.month !== challengeMonth)
        ) {
          setIsContentReady(false);
        }
      });
    }
  }, [activeTopTab, challengeYear, challengeMonth, contentOpacity]);

  // 리포트 탭: 월 변경 감지 → 페이드아웃, 로딩 완료 시 페이드인 (타임라인과 동일)
  useEffect(() => {
    if (activeTopTab !== 'report') return;
    const prevRef =
      reportSubTab === 'score' ? prevReportScoreMonthRef : prevReportTrendMonthRef;
    const nextYear = reportSubTab === 'score' ? reportScoreYear : reportTrendYear;
    const nextMonth = reportSubTab === 'score' ? reportScoreMonth : reportTrendMonth;
    const prev = prevRef.current;
    if (prev === null) {
      prevRef.current = { year: nextYear, month: nextMonth };
      return;
    }
    if (prev.year !== nextYear || prev.month !== nextMonth) {
      prevRef.current = { year: nextYear, month: nextMonth };
      reportNeedsFadeInRef.current = true;
      reportFadeOutInProgressRef.current = true;
      reportPendingTrendFadeInRef.current = false;
      if (reportSubTab === 'trend') {
        setReportTrendContentReady(false);
      }
      Animated.timing(reportContentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        reportFadeOutInProgressRef.current = false;
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
          } else if (reportPendingTrendFadeInRef.current) {
            reportPendingTrendFadeInRef.current = false;
            reportNeedsFadeInRef.current = false;
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
  }, [
    activeTopTab,
    reportSubTab,
    reportScoreYear,
    reportScoreMonth,
    reportTrendYear,
    reportTrendMonth,
    reportContentOpacity,
  ]);

  // 리포트 탭(소비 현황): 트렌드 로딩 완료 시 페이드인
  // 소비 리포트(점수 박스)는 월 변경 시 페이드아웃 콜백에서 바로 페이드인
  useEffect(() => {
    if (activeTopTab !== 'report' || reportSubTab !== 'trend') return;
    if (!reportTrendContentReady) {
      reportContentOpacity.setValue(0);
      return;
    }
    if (reportFadeOutInProgressRef.current) {
      reportPendingTrendFadeInRef.current = true;
      return;
    }
    reportNeedsFadeInRef.current = false;
    reportPendingTrendFadeInRef.current = false;
    reportContentOpacity.setValue(0);
    Animated.timing(reportContentOpacity, {
      toValue: 1,
      duration: MONTH_CHANGE_FADE_IN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [activeTopTab, reportSubTab, reportTrendContentReady, reportContentOpacity]);

  // 리포트 탭 진입 시 subtab별 prev month 초기화 (첫 진입 시 페이드아웃 방지)
  useEffect(() => {
    if (activeTopTab === 'report') {
      if (prevReportScoreMonthRef.current === null) {
        prevReportScoreMonthRef.current = { year: reportScoreYear, month: reportScoreMonth };
      }
      if (prevReportTrendMonthRef.current === null) {
        prevReportTrendMonthRef.current = { year: reportTrendYear, month: reportTrendMonth };
      }
    }
    if (activeTopTab !== 'report') {
      prevReportScoreMonthRef.current = null;
      prevReportTrendMonthRef.current = null;
    }
  }, [activeTopTab, reportScoreYear, reportScoreMonth, reportTrendYear, reportTrendMonth]);

  // 챌린지 탭 진입 시 prevChallengeMonthRef 초기화 (첫 진입 시 페이드아웃 방지)
  useEffect(() => {
    if (activeTopTab === 'challenge' && prevChallengeMonthRef.current === null) {
      prevChallengeMonthRef.current = { year: challengeYear, month: challengeMonth };
    }
    if (activeTopTab !== 'challenge') {
      prevChallengeMonthRef.current = null;
    }
  }, [activeTopTab, challengeYear, challengeMonth]);

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
                  records.forEach((value) => {
                    const record = value as {
                      isDeleted?: boolean;
                      isRefunded?: boolean;
                      type?: string;
                      category?: string;
                      amount?: number;
                    };
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

    if (activeTopTabRef.current === 'report') {
      if (reportSubTabRef.current === 'score') {
        setReportScoreYear(customMonthInfo.year);
        setReportScoreMonth(customMonthInfo.month);
      } else {
        setReportTrendYear(customMonthInfo.year);
        setReportTrendMonth(customMonthInfo.month);
      }
    } else {
      setChallengeYear(customMonthInfo.year);
      setChallengeMonth(customMonthInfo.month);
    }
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
    if (activeTopTabRef.current === 'report') {
      if (reportSubTabRef.current === 'score') {
        setReportScoreMonth((prevMonth) => {
          if (prevMonth === 1) {
            setReportScoreYear((prevYear) => prevYear - 1);
            return 12;
          }
          return prevMonth - 1;
        });
      } else {
        setReportTrendMonth((prevMonth) => {
          if (prevMonth === 1) {
            setReportTrendYear((prevYear) => prevYear - 1);
            return 12;
          }
          return prevMonth - 1;
        });
      }
      return;
    }
    setChallengeMonth((prevMonth) => {
      if (prevMonth === 1) {
        setChallengeYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    if (activeTopTabRef.current === 'report') {
      if (reportSubTabRef.current === 'score') {
        setReportScoreMonth((prevMonth) => {
          if (prevMonth === 12) {
            setReportScoreYear((prevYear) => prevYear + 1);
            return 1;
          }
          return prevMonth + 1;
        });
      } else {
        setReportTrendMonth((prevMonth) => {
          if (prevMonth === 12) {
            setReportTrendYear((prevYear) => prevYear + 1);
            return 1;
          }
          return prevMonth + 1;
        });
      }
      return;
    }
    setChallengeMonth((prevMonth) => {
      if (prevMonth === 12) {
        setChallengeYear((prevYear) => prevYear + 1);
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
  const shouldHideNoSpendInEarlyMonth = useMemo(() => {
    if (reportScoreContext == null) return false;
    return !reportScoreContext.isMonthClosed && reportScoreContext.elapsedDaysInMonth <= 28;
  }, [reportScoreContext]);

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
  const displayedFqScore = hasCheckedScore ? (confirmedReportMeta?.fqScore ?? fqScore) : fqScore;
  const displayedTopCategoryInfo =
    hasCheckedScore ? (confirmedReportMeta?.topCategoryInfo ?? topCategoryInfo) : topCategoryInfo;
  const displayedTotalExpense =
    hasCheckedScore && confirmedReportMeta
      ? confirmedReportMeta.totalExpense
      : (consumptionIndex?.stats.totalExpense ?? 0);
  const displayedNoSpendDays =
    hasCheckedScore && confirmedReportMeta
      ? confirmedReportMeta.noSpendDays
      : (consumptionIndex?.stats.noSpendDays ?? 0);
  const displayedTotalDays =
    hasCheckedScore && confirmedReportMeta
      ? confirmedReportMeta.totalDays
      : (consumptionIndex?.stats.totalDays ?? 0);

  const splitLines = useCallback((text: string): string[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }, []);

  const reportSummaryLines = useMemo(() => {
    if (aiSummaryText && aiSummaryText.length > 0) {
      return aiSummaryText;
    }

    let fallback: string;

    if (!consumptionIndex) {
      fallback = '아직 소비 데이터가 없습니다.\n이번 달부터 지출을 기록해 보세요.';
    } else if (consumptionIndex.status === 'collecting' || displayedFqScore == null) {
      fallback =
        '기록은 시작되었지만 아직 소비 패턴을 판단하기에는 데이터가 부족합니다.\n며칠만 더 꾸준히 기록해 주시면 소비 리포트를 볼 수 있어요.';
    } else if (!displayedTopCategoryInfo) {
      if (displayedFqScore >= 80) {
        fallback =
          '이번 달 소비 페이스는 전반적으로 안정적인 편입니다.\n특정 카테고리에 과도하게 쏠린 지출 없이 균형을 잘 유지하고 있어요.';
      } else if (displayedFqScore >= 50) {
        fallback =
          '이번 달 소비 페이스는 다소 빠른 편입니다.\n어떤 요일·시간대에 소비가 몰리는지 한 번 확인해 보세요.';
      } else {
        fallback =
          '이번 달에는 지출 속도가 꽤 빠른 편입니다.\n특히 불필요한 소액 지출이 반복되지 않는지 점검해 보시면 좋겠습니다.';
      }
    } else {
      const categoryLabel = displayedTopCategoryInfo.category;
      const ratioText = `${displayedTopCategoryInfo.ratioPercent.toFixed(1)}%`;

      if (displayedFqScore >= 80) {
        fallback = `이번 달 소비 페이스는 안정적인 편입니다.\n다만 전체 지출의 ${ratioText}가 '${categoryLabel}'에서 발생하고 있어, 이 카테고리만 조금만 줄이면 더 높은 점수를 기대할 수 있어요.`;
      } else if (displayedFqScore >= 50) {
        fallback = `이번 달 소비 페이스는 다소 빠른 편입니다.\n특히 '${categoryLabel}' 카테고리가 전체의 ${ratioText}를 차지하고 있어, 이 부분을 한 번 점검해 보시면 좋겠습니다.`;
      } else {
        fallback = `이번 달에는 지출 속도가 꽤 빠른 편입니다.\n'${categoryLabel}' 카테고리가 전체의 ${ratioText}를 차지해 소비 패턴을 끌어올리고 있어요.\n이 카테고리부터 작게 줄이는 챌린지를 시작해 보세요.`;
      }
    }

    return splitLines(fallback);
  }, [aiSummaryText, consumptionIndex, displayedFqScore, displayedTopCategoryInfo, splitLines]);

  const reportNextGoalLines = useMemo(() => {
    if (aiNextWeekGoalText && aiNextWeekGoalText.length > 0) {
      return aiNextWeekGoalText;
    }

    let fallback: string;

    if (!consumptionIndex || displayedFqScore == null) {
      fallback =
        '다가오는 한 주에는 지출을 기록하는 습관을 먼저 만드는 것을 목표로 해보세요.\n특히 자주 쓰는 카테고리 한두 개만 의식하면서 적어 보는 것만으로도 충분합니다.';
    } else if (!displayedTopCategoryInfo) {
      if (displayedFqScore >= 80) {
        fallback =
          '다음 주에는 지금과 같은 소비 페이스를 유지하는 것을 목표로 해보세요.\n특별한 소비 계획이 없다면, 이미 잘 하고 계신 패턴을 그대로 이어가셔도 좋습니다.';
      } else if (displayedFqScore >= 50) {
        fallback =
          '다음 주에는 평소보다 하루에 한 번 정도만 소비를 줄여 보는 것을 목표로 해보세요.\n특히 큰 의미 없이 나가는 소액 지출이 있다면 한두 번만 덜 쓰는 것부터 시도해보면 좋습니다.';
      } else {
        fallback =
          '다가오는 한 주 동안은 지출을 한 번 더 생각해 보고 사용하는 것을 목표로 해보세요.\n꼭 필요하지 않은 소비를 하루에 한 번만 덜 하는 것부터 시작해도 충분합니다.';
      }
    } else {
      const categoryLabel = displayedTopCategoryInfo.category;
      const ratioText = `${displayedTopCategoryInfo.ratioPercent.toFixed(1)}%`;

      if (displayedFqScore >= 80) {
        fallback = `다음 주에는 '${categoryLabel}' 지출을 이번 주보다 조금만 줄여 보는 것을 목표로 해보세요.\n현재 전체 지출의 ${ratioText}를 차지하고 있어, 이 부분만 가볍게 조절해도 좋은 흐름을 유지하는 데 도움이 됩니다.`;
      } else if (displayedFqScore >= 50) {
        fallback = `다음 주에는 '${categoryLabel}' 지출을 한두 번만 덜 쓰는 것을 목표로 해보세요.\n이 카테고리가 전체 지출의 ${ratioText}를 차지하고 있어서, 작은 조정만으로도 전체 소비 페이스를 낮추는 데 도움이 됩니다.`;
      } else {
        fallback = `다가오는 한 주에는 '${categoryLabel}' 지출을 특히 의식하면서 사용해보세요.\n전체 지출의 ${ratioText}를 차지하고 있어, 이 카테고리에서 한두 번만 줄여도 이번 달 소비 흐름을 바꾸는 데 큰 도움이 됩니다.`;
      }
    }

    return splitLines(fallback);
  }, [aiNextWeekGoalText, consumptionIndex, displayedFqScore, displayedTopCategoryInfo, splitLines]);

  const shouldShowChallengeCard = useMemo(() => {
    if (!consumptionIndex || displayedFqScore == null || !aiChallengeText || !displayedTopCategoryInfo) return false;
    // 점수가 충분히 높으면 별도의 챌린지 제안은 하지 않음
    if (displayedFqScore >= 80) return false;
    // 상위 카테고리 비중이 너무 낮으면 챌린지 제안하지 않음
    if (displayedTopCategoryInfo.ratioPercent < 15) return false;
    // 이미 해당 카테고리로 생성된 챌린지가 있다면 중복 제안하지 않음
    const hasExistingChallengeForCategory = challenges.some(
      (c) => c.category === displayedTopCategoryInfo.category,
    );
    if (hasExistingChallengeForCategory) return false;
    return true;
  }, [consumptionIndex, displayedFqScore, aiChallengeText, displayedTopCategoryInfo, challenges]);

  const scoreMessageLines = useMemo(() => {
    const collectingMessage = (() => {
      const n = remainingRecordsForIndex;
      const countText = typeof n === 'number' ? `${n}건을` : '몇건을';
      return `이번 달 소비 기록이 아직 충분하지 않습니다.\n${countText} 더 기록하시면 소비 진단을 시작할 수 있어요.`;
    })();

    // 아직 점수 확인 전: 초기 안내 문구
    if (!hasCheckedScore) {
      if (isCollectingIndex || displayedFqScore == null) {
        return splitLines(collectingMessage);
      }
      return splitLines(
        '이번 달 소비 상태를 분석할 수 있어요.\n아래 버튼을 눌러 결과를 확인해 보세요.',
      );
    }

    // 점수를 확인했지만, 여전히 데이터가 부족한 상태라면 동일한 안내 유지
    if (isCollectingIndex || displayedFqScore == null) {
      return splitLines(collectingMessage);
    }

    // 점수 확인 후: 우선 AI가 제공한 점수 피드백이 있다면 사용
    if (scoreFeedbackText && scoreFeedbackText.length > 0) {
      return scoreFeedbackText;
    }

    // scoreFeedback이 없을 때는, 점수에 대한 해석을 강하게 고정하지 않고
    // 간단한 중립 문구만 보여준다. (실제 피드백은 summary/summaryTitle에서 제공)
    return splitLines(
      '이번 달 소비 패턴을 바탕으로 계산된 결과예요.\n아래 리포트를 함께 보면서 이번 달 소비를 한 번 정리해 보셔도 좋겠습니다.',
    );
  }, [hasCheckedScore, isCollectingIndex, displayedFqScore, remainingRecordsForIndex, scoreFeedbackText, splitLines]);

  const scoreEmoji = useMemo(() => {
    if (!hasCheckedScore || displayedFqScore == null) {
      return '';
    }

    // 점수 구간별 이모지 후보 (각 10개)
    const topTier = ['🌟', '💎', '🎉', '🏆', '🥇', '✨', '💖', '🙌', '👏', '😎'];
    const goodTier = ['😄', '🙂', '👍', '😊', '🤗', '🌈', '🍀', '💪', '🧡', '😌'];
    const midTier = ['😐', '🤔', '📊', '📈', '📝', '🔍', '📘', '🧠', '💬', '📌'];
    const lowTier = ['😟', '🙁', '💸', '🕳️', '🤯', '😮‍💨', '💭', '🪙', '📉', '😬'];
    const badTier = ['🚨', '⚠️', '🧨', '💣', '🥵', '😵', '🛑', '🔥', '❗️', '🤕'];

    let pool = midTier;
    if (displayedFqScore >= 90) {
      pool = topTier;
    } else if (displayedFqScore >= 75) {
      pool = goodTier;
    } else if (displayedFqScore >= 50) {
      pool = midTier;
    } else if (displayedFqScore >= 30) {
      pool = lowTier;
    } else {
      pool = badTier;
    }

    // 점수를 기준으로 "랜덤하지만 재현 가능한" 인덱스 선택
    const seed = displayedFqScore * 13;
    const idx = Math.abs(seed) % pool.length;
    return pool[idx] ?? '';
  }, [hasCheckedScore, displayedFqScore]);

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
    void logEvent('btn', {
      screen_name: 'challenge',
      target: 'feedback',
    });

    if (!consumptionIndex || consumptionIndex.status !== 'ready' || fqScore == null) {
      showToast('기록이 조금 더 쌓인 후 확인할 수 있습니다.');
      return;
    }

    if (monthStartDay <= 0) {
      showToast('월 시작일 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    let didUpdate = false;
    let nextSummary: string[] | null = null;
    let nextSummaryTitle: string | null = null;
    let nextChallenge: string[] | null = null;
    let nextScoreFeedback: string | null = null;
    let nextNextWeekGoal: string[] | null = null;

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

      if (reportScoreContext == null || reportScoreCacheKey == null) {
        showToast('월 시작일 정보를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const snapshot = computeReportSnapshot(calendarData, reportScoreContext);
      const {
        lastRecordUpdatedAt,
        dataRevision,
        toDateTotalExpense,
        toDateExpenseCount,
        toDateActiveDays,
        noSpendDaysToDate,
        toDateCategoryTotals,
        toDateCategoryUsage,
      } = snapshot;

      if (lastRecordUpdatedAt === 0) {
        showToast('이번 달에는 아직 소비 기록이 없습니다.');
        return;
      }

      const cached = await AsyncStorage.getItem(reportScoreCacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as {
            summary: string | string[];
            summaryTitle?: string;
            challenge: string | string[];
            scoreFeedback?: string;
            nextWeekGoal?: string | string[];
            policyFingerprint?: string;
            lastRecordUpdatedAt?: number;
            dataRevision?: string;
            asOfDate?: string;
            monthStartUpdatedAt?: number;
            confirmedFqScore?: number;
            confirmedTotalExpense?: number;
            confirmedNoSpendDays?: number;
            confirmedTotalDays?: number;
            confirmedTopCategory?: {
              category?: string;
              amount?: number;
              ratioPercent?: number;
            };
          };
          const canReuseByAsOfDate =
            reportScoreContext.isMonthClosed ||
            parsed.asOfDate === reportScoreContext.asOfDate;
        const canReuseByMonthStartVersion =
          Number(parsed.monthStartUpdatedAt ?? 0) === reportScoreContext.monthStartUpdatedAt;
        const canReuseByPolicyFingerprint =
          typeof parsed.policyFingerprint === 'string' &&
          parsed.policyFingerprint === reportScoreContext.policyFingerprint;

          // (1) 이미 이 월에서 한 번 이상 분석했고, 월간 지출 데이터 지문도 동일하면 → 분석 중단
          // (레거시 캐시에 dataRevision 없음 → 스킵하지 않고 재분석 허용)
        if (
          typeof parsed.dataRevision === 'string' &&
          parsed.dataRevision === dataRevision &&
          hasCheckedScore &&
          canReuseByAsOfDate &&
          canReuseByMonthStartVersion &&
          canReuseByPolicyFingerprint
        ) {
            showToast('변경내역이 없어 분석을 중단합니다.');
            return;
          }

          // (2) 이번 세션에서 아직 점수 확인 전 → 캐시에서 화면만 채움(syncReportFromCache와 동일하게 기록 버전 불일치여도 허용)
        if (
          !hasCheckedScore &&
          canReuseByAsOfDate &&
          canReuseByMonthStartVersion &&
          canReuseByPolicyFingerprint &&
          parsed.summary &&
          parsed.challenge
        ) {
            nextSummary = splitLines(
              Array.isArray(parsed.summary) ? parsed.summary.join('\n') : parsed.summary.trim(),
            );
            nextChallenge = splitLines(
              Array.isArray(parsed.challenge) ? parsed.challenge.join('\n') : parsed.challenge.trim(),
            );

            runReportContentRefreshAnimation(() => {
              if (nextSummary && nextChallenge) {
                setAiSummaryText(nextSummary);
                setAiChallengeText(nextChallenge);
                if (typeof parsed.summaryTitle === 'string') {
                  setAiSummaryTitleText(parsed.summaryTitle.trim());
                }
                if (typeof parsed.scoreFeedback !== 'undefined') {
                  const feedbackLines = splitLines(
                    Array.isArray(parsed.scoreFeedback)
                      ? parsed.scoreFeedback.join('\n')
                      : parsed.scoreFeedback.trim(),
                  );
                  setScoreFeedbackText(feedbackLines);
                }
                if (typeof parsed.nextWeekGoal !== 'undefined') {
                  const goalLines = splitLines(
                    Array.isArray(parsed.nextWeekGoal)
                      ? parsed.nextWeekGoal.join('\n')
                      : parsed.nextWeekGoal.trim(),
                  );
                  setAiNextWeekGoalText(goalLines);
                }
                if (
                  typeof parsed.confirmedFqScore === 'number' &&
                  typeof parsed.confirmedTotalExpense === 'number' &&
                  typeof parsed.confirmedNoSpendDays === 'number' &&
                  typeof parsed.confirmedTotalDays === 'number'
                ) {
                  const confirmedTopCategory =
                    parsed.confirmedTopCategory &&
                    typeof parsed.confirmedTopCategory.category === 'string' &&
                    typeof parsed.confirmedTopCategory.amount === 'number' &&
                    typeof parsed.confirmedTopCategory.ratioPercent === 'number'
                      ? {
                          category: parsed.confirmedTopCategory.category,
                          amount: parsed.confirmedTopCategory.amount,
                          ratioPercent: parsed.confirmedTopCategory.ratioPercent,
                        }
                      : null;
                  setConfirmedReportMeta({
                    fqScore: parsed.confirmedFqScore,
                    totalExpense: parsed.confirmedTotalExpense,
                    noSpendDays: parsed.confirmedNoSpendDays,
                    totalDays: parsed.confirmedTotalDays,
                    topCategoryInfo: confirmedTopCategory,
                  });
                } else if (
                  consumptionIndex?.status === 'ready' &&
                  typeof consumptionIndex.fqScore === 'number'
                ) {
                  setConfirmedReportMeta({
                    fqScore: Math.round(consumptionIndex.fqScore),
                    totalExpense: consumptionIndex.stats.totalExpense,
                    noSpendDays: consumptionIndex.stats.noSpendDays,
                    totalDays: consumptionIndex.stats.totalDays,
                    topCategoryInfo: topCategoryInfo
                      ? {
                          category: topCategoryInfo.category,
                          amount: topCategoryInfo.amount,
                          ratioPercent: topCategoryInfo.ratioPercent,
                        }
                      : null,
                  });
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
      const securityHeaders = await getApiSecurityHeaders();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, CONSUMPTION_REPORT_API_TIMEOUT_MS);
      const res = await (async () => {
        try {
          console.warn('[consumption-report] API URL', CONSUMPTION_REPORT_API_URL);
          return await fetch(CONSUMPTION_REPORT_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...securityHeaders,
            },
            body: JSON.stringify({
              fqScore,
              stats: {
                year: reportScoreYear,
                month: reportScoreMonth,
                asOfDate: reportScoreContext.asOfDate,
                isMonthClosed: reportScoreContext.isMonthClosed,
                elapsedDaysInMonth: reportScoreContext.elapsedDaysInMonth,
                totalExpense: consumptionIndex.stats.totalExpense,
                noSpendDays: consumptionIndex.stats.noSpendDays,
                totalDays: consumptionIndex.stats.totalDays,
                highAmountRatio: consumptionIndex.stats.highAmountRatio,
                categoryTotals: consumptionIndex.stats.categoryTotals,
                expenseCount: consumptionIndex.stats.expenseCount,
                activeDays: Object.keys(consumptionIndex.stats.dailyExpenseCounts).length,
                toDateTotalExpense,
                toDateExpenseCount,
                toDateActiveDays,
                noSpendDaysToDate,
                toDateCategoryTotals,
                toDateCategoryUsage,
              },
            }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      })();

      if (!res.ok) {
        let retryAfterSec: number | undefined;
        let errorBodyText = '';
        try {
          const raw = await res.text();
          errorBodyText = raw.slice(0, 500);
          if (raw.length > 0) {
            const parsed = JSON.parse(raw) as { retryAfterSec?: unknown };
            if (typeof parsed.retryAfterSec === 'number' && Number.isFinite(parsed.retryAfterSec)) {
              retryAfterSec = parsed.retryAfterSec;
            }
          }
        } catch {
          // ignore body parse/read failure
        }
        const retryPolicy = getRetryPolicy(res.status);
        if (__DEV__) {
          console.warn('[consumption-report] request failed', {
            url: CONSUMPTION_REPORT_API_URL,
            status: res.status,
            retryPolicy,
            retryAfterSec: retryAfterSec ?? null,
            errorBody: errorBodyText,
          });
        } else {
          console.warn('[consumption-report] request failed', {
            status: res.status,
            retryPolicy,
          });
        }
        showToast(getConsumptionReportErrorMessage(res.status, retryAfterSec));
        return;
      }

      const data = (await res.json()) as {
        summary?: string | string[];
        summaryTitle?: string;
        challenge?: string | string[];
        scoreFeedback?: string;
        nextWeekGoal?: string | string[];
      };
      const dataObj = data as {
        scoreFeedback?: string | string[];
        summaryTitle?: string;
        summary?: string | string[];
        challenge?: string | string[];
        nextWeekGoal?: string | string[];
      };
      const summaryLines = dataObj.summary
        ? splitLines(
            Array.isArray(dataObj.summary) ? dataObj.summary.join('\n') : dataObj.summary.trim(),
          )
        : [];
      const summaryTitle =
        typeof dataObj.summaryTitle === 'string' ? dataObj.summaryTitle.trim() : '';
      const challengeLines = dataObj.challenge
        ? splitLines(
            Array.isArray(dataObj.challenge)
              ? dataObj.challenge.join('\n')
              : dataObj.challenge.trim(),
          )
        : [];
      const scoreFeedbackLines = dataObj.scoreFeedback
        ? splitLines(
            Array.isArray(dataObj.scoreFeedback)
              ? dataObj.scoreFeedback.join('\n')
              : dataObj.scoreFeedback.trim(),
          )
        : [];
      const nextWeekGoalLines = dataObj.nextWeekGoal
        ? splitLines(
            Array.isArray(dataObj.nextWeekGoal)
              ? dataObj.nextWeekGoal.join('\n')
              : dataObj.nextWeekGoal.trim(),
          )
        : [];

      if (summaryLines.length === 0 || challengeLines.length === 0) {
        showToast('AI 리포트 형식이 올바르지 않습니다.');
        return;
      }

      nextSummary = summaryLines;
      nextChallenge = challengeLines;
      if (summaryTitle) {
        nextSummaryTitle = summaryTitle;
      }
      if (scoreFeedbackLines.length > 0) {
        nextScoreFeedback = scoreFeedbackLines.join('\n');
      }
      if (nextWeekGoalLines.length > 0) {
        nextNextWeekGoal = nextWeekGoalLines;
      }
      didUpdate = true;

      await AsyncStorage.setItem(
        reportScoreCacheKey,
        JSON.stringify({
          summary: summaryLines,
          summaryTitle: summaryTitle || undefined,
          challenge: challengeLines,
          scoreFeedback: scoreFeedbackLines.length > 0 ? scoreFeedbackLines : undefined,
          nextWeekGoal: nextWeekGoalLines.length > 0 ? nextWeekGoalLines : undefined,
          lastRecordUpdatedAt,
          dataRevision,
          asOfDate: reportScoreContext.asOfDate,
          monthStartUpdatedAt: reportScoreContext.monthStartUpdatedAt,
          policyFingerprint: reportScoreContext.policyFingerprint,
          confirmedFqScore: fqScore,
          confirmedTotalExpense: consumptionIndex.stats.totalExpense,
          confirmedNoSpendDays: consumptionIndex.stats.noSpendDays,
          confirmedTotalDays: consumptionIndex.stats.totalDays,
          confirmedTopCategory: topCategoryInfo
            ? {
                category: topCategoryInfo.category,
                amount: topCategoryInfo.amount,
                ratioPercent: topCategoryInfo.ratioPercent,
              }
            : undefined,
        }),
      );
      const legacyCacheKey = `consumptionReport_${reportScoreYear}_${reportScoreMonth}_${monthStartDay}`;
      await AsyncStorage.removeItem(legacyCacheKey).catch(() => {});
    } catch (error: unknown) {
      if (__DEV__) {
        console.warn('[consumption-report] request exception', {
          url: CONSUMPTION_REPORT_API_URL,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
      if (error instanceof Error && error.name === 'AbortError') {
        showToast('응답이 지연되고 있습니다. 다시 시도해 주세요.');
      } else {
        showToast('오류가 발생했습니다. 다시 시도해 주세요.');
      }
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
            const feedbackLines = splitLines(nextScoreFeedback);
            setScoreFeedbackText(feedbackLines);
          }
          if (nextNextWeekGoal) {
            setAiNextWeekGoalText(nextNextWeekGoal);
          }
          if (
            consumptionIndex?.status === 'ready' &&
            typeof consumptionIndex.fqScore === 'number'
          ) {
            setConfirmedReportMeta({
              fqScore: Math.round(consumptionIndex.fqScore),
              totalExpense: consumptionIndex.stats.totalExpense,
              noSpendDays: consumptionIndex.stats.noSpendDays,
              totalDays: consumptionIndex.stats.totalDays,
              topCategoryInfo: topCategoryInfo
                ? {
                    category: topCategoryInfo.category,
                    amount: topCategoryInfo.amount,
                    ratioPercent: topCategoryInfo.ratioPercent,
                  }
                : null,
            });
          }
          setHasCheckedScore(true);
        });
      }
    }
  }, [
    consumptionIndex,
    fqScore,
    monthStartDay,
    reportScoreYear,
    reportScoreMonth,
    reportScoreContext,
    reportScoreCacheKey,
    hasCheckedScore,
    consumptionIndex,
    topCategoryInfo,
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
                        {reportScoreYear}년 {String(reportScoreMonth).padStart(2, '0')}월
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
                          minHeight: hasCheckedScore && displayedFqScore != null ? undefined : reportScoreCardHeight,
                        },
                      ]}
                    >
                      <Text style={[styles.reportScoreLabel, { color: colors.textAssistive }]}>
                        이번달 소비 점수는?
                      </Text>
                      <View style={styles.reportScoreValueRow}>
                        <Text style={[styles.reportScoreEmoji, { color: colors.text }]}>
                          {hasCheckedScore && displayedFqScore != null ? scoreEmoji : ''}
                        </Text>
                        <Text style={[styles.reportScoreValue, { color: colors.text }]}>
                          {hasCheckedScore && displayedFqScore != null ? displayedFqScore : '?'}
                        </Text>
                        <Text style={[styles.reportScoreUnit, { color: colors.text }]}>점</Text>
                      </View>
                      {scoreMessageLines.map((line, idx) => (
                        <Text
                          key={idx}
                          style={[
                            styles.reportScoreMessage,
                            {
                              color: colors.textNeutral,
                              marginBottom:
                                idx === scoreMessageLines.length - 1 ? 24 : 0,
                            },
                          ]}
                        >
                          {line}
                        </Text>
                      ))}
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
                              {`${displayedTotalExpense.toLocaleString()}원`}
                            </Text>
                          </View>
                          {!shouldHideNoSpendInEarlyMonth && (
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                                무지출일
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                                {`${displayedNoSpendDays}일 / ${displayedTotalDays}일`}
                              </Text>
                            </View>
                          )}
                        </View>
                        {aiSummaryTitleText && (
                          <Text style={[styles.reportSummaryHeadline, { color: colors.text }]}>
                            {aiSummaryTitleText}
                          </Text>
                        )}
                        {reportSummaryLines.map((line, idx) => (
                          <Text
                            key={idx}
                            style={[
                              styles.reportSummaryBody,
                              {
                                color: colors.textNeutral,
                                marginBottom: idx === reportSummaryLines.length - 1 ? 0 : 8,
                              },
                            ]}
                          >
                            {line}
                          </Text>
                        ))}
                        <View style={styles.reportNextGoal}>
                          <Text style={[styles.reportNextGoalTitle, { color: colors.text }]}>
                            📌 다음 주 목표
                          </Text>
                          {reportNextGoalLines.map((line, idx) => (
                            <Text
                              key={idx}
                              style={[
                                styles.reportNextGoalBody,
                                {
                                  color: colors.textNeutral,
                                  marginBottom: idx === reportNextGoalLines.length - 1 ? 0 : 8,
                                },
                              ]}
                            >
                              {line}
                            </Text>
                          ))}
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
                        {displayedTopCategoryInfo && consumptionIndex && (
                          <View style={styles.reportSummaryRows}>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                                카테고리
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                                {displayedTopCategoryInfo.category}
                              </Text>
                            </View>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: colors.textAssistive }]}>
                                총 소비금액
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: colors.text }]}>
                                {`${displayedTopCategoryInfo.amount.toLocaleString()}원`}
                              </Text>
                            </View>
                          </View>
                        )}
                        {aiChallengeText?.map((line, idx) => (
                          <Text
                            key={idx}
                            style={[
                              styles.reportChallengeBody,
                              {
                                color: colors.textNeutral,
                                marginBottom: idx === aiChallengeText.length - 1 ? 0 : 8,
                              },
                            ]}
                          >
                            {line}
                          </Text>
                        ))}
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
                        {reportTrendYear}년 {String(reportTrendMonth).padStart(2, '0')}월
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
                            void logEvent('list', {
                              screen_name: 'challenge',
                              target:
                                trendCategoryFilter === 'all'
                                  ? 'expense-monthly-ranking'
                                  : 'expense-recurring-ranking',
                            });
                            router.push({
                              pathname: '/expense-category-detail',
                              params: {
                                category: item.category,
                                year: reportTrendYear.toString(),
                                month: reportTrendMonth.toString(),
                                rankingType:
                                  trendCategoryFilter === 'all' ? 'monthly' : 'recurring',
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
            year={challengeYear}
            month={challengeMonth}
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
                    void logEvent('list', {
                      screen_name: 'challenge',
                      target: 'challenge-item',
                    });
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
          selectedYear={activeYear}
          onYearChange={(newYear) => {
            const minY = yearOptions[0]?.value ?? newYear;
            const maxY = yearOptions[yearOptions.length - 1]?.value ?? newYear;
            const nextYear = Math.min(maxY, Math.max(minY, newYear));
            if (activeTopTab === 'report') {
              if (reportSubTab === 'score') {
                setReportScoreYear(nextYear);
              } else {
                setReportTrendYear(nextYear);
              }
            } else {
              setChallengeYear(nextYear);
            }
          }}
          monthOptions={monthOptions}
          selectedMonth={activeMonth}
          onMonthChange={(newMonth) => {
            if (activeTopTab === 'report') {
              if (reportSubTab === 'score') {
                setReportScoreMonth(newMonth);
              } else {
                setReportTrendMonth(newMonth);
              }
            } else {
              setChallengeMonth(newMonth);
            }
          }}
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
