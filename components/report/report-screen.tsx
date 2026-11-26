/**
 * Report Tab Screen — 소비 리포트 · 소비 현황.
 *
 * 챌린지 화면의 리포트 모드에서 분리. 「소비 리포트」 로직·UI는 그대로 옮겼고,
 * 「소비 현황」은 `ReportTrendTab`으로 새로 구성했다.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { ReportTrendTab } from '@/components/report/report-trend-tab';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { CONSUMPTION_REPORT_API_URL } from '@/constants/api';
import { REPORT_STACK_PATHS } from '@/constants/navigation/route-ownership';
import {
  getFabBottomAboveTabBar,
  getTabScreenScrollPaddingBottom,
} from '@/constants/navigation/tab-bar-metrics';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getApiSecurityHeaders } from '@/utils/api-security-headers';
import { logEvent, logScreenView } from '@/utils/analytics';
import {
  REPORT_CONSUMPTION_SCREEN_NAME,
  REPORT_TREND_SCREEN_NAME,
  setCurrentReportScreenName,
} from '@/utils/report-screen-name';
import { toMonthIndex } from '@/utils/report-trend';
import { getChallengesByDateRange } from '@/utils/challenges';
import {
  computeConsumptionIndex,
  type CalendarData,
  type ConsumptionIndexResult,
} from '@/utils/consumption-index';
import { tabReselectEvent } from '@/utils/tab-reselect-event';
import {
  getCustomMonthInfo,
  getCustomMonthRange,
  isDateInCustomMonth,
  parseCalendarDateKeyLocal,
} from '@/utils/custom-month';
import { useFocusEffect, useLocalSearchParams, useRouter, useIsFocused } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


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
  toDateCategoryTotals: { category: string; amount: number; ratio: number }[];
  toDateCategoryUsage: { category: string; count: number; projectedMonthlyCount: number }[];
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

/**
 * 월 단위 안정 키. asOfDate / isMonthClosed / elapsedDays / monthStartUpdatedAt 은
 * 날짜·로드 타이밍에 따라 바뀌어 캐시가 갈라지고 UI가 `?`로 초기화되므로 키에 넣지 않는다.
 * (월 시작일 변경은 monthStartDay, 정책 변경은 policyFingerprint 로 무효화)
 */
function buildReportCacheKey(context: ReportContext): string {
  const source = [
    context.year,
    context.month,
    context.monthStartDay,
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

type ReportSubTabId = 'score' | 'trend';

/** 점수 확인 전 카드의 최소 높이 — 화면이 이보다 작으면 스크롤 */
const REPORT_SCORE_CARD_MIN = 280;

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function ReportScreen() {
  const insets = useSafeAreaInsets();
  const bottomContentInset = getTabScreenScrollPaddingBottom(insets.bottom);
  const controlBarBottom = getFabBottomAboveTabBar(insets.bottom);
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const [reportSubTab, setReportSubTab] = useState<ReportSubTabId>('score');
  const [consumptionIndex, setConsumptionIndex] = useState<ConsumptionIndexResult | null>(null);
  const [isConsumptionIndexLoading, setIsConsumptionIndexLoading] = useState(false);
  void isConsumptionIndexLoading;
  const [aiSummaryText, setAiSummaryText] = useState<string[] | null>(null);
  const [aiChallengeText, setAiChallengeText] = useState<string[] | null>(null);
  const [aiSummaryTitleText, setAiSummaryTitleText] = useState<string | null>(null);
  const [scoreFeedbackText, setScoreFeedbackText] = useState<string[] | null>(null);
  const [aiNextWeekGoalText, setAiNextWeekGoalText] = useState<string[] | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [hasCheckedScore, setHasCheckedScore] = useState(false);
  const [confirmedReportMeta, setConfirmedReportMeta] = useState<ConfirmedReportMeta | null>(null);
  const { setLoading } = useLoading();
  const { showToast } = useToast();
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
  const reportSubTabRef = useRef<ReportSubTabId>('score');
  useEffect(() => {
    reportSubTabRef.current = reportSubTab;
  }, [reportSubTab]);

  const params = useLocalSearchParams<{ year?: string; month?: string; tab?: string; ts?: string }>();

  const [monthStartDay, setMonthStartDay] = useState(1);
  const [monthStartUpdatedAt, setMonthStartUpdatedAt] = useState(0);
  const now = new Date();
  const initialYear = params.year ? parseInt(params.year, 10) || now.getFullYear() : now.getFullYear();
  const initialMonth = params.month ? parseInt(params.month, 10) || now.getMonth() + 1 : now.getMonth() + 1;
  const [reportScoreYear, setReportScoreYear] = useState(initialYear);
  const [reportScoreMonth, setReportScoreMonth] = useState(initialMonth);
  const [reportTrendYear, setReportTrendYear] = useState(initialYear);
  const [reportTrendMonth, setReportTrendMonth] = useState(initialMonth);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  // 소비 현황은 당월(월 시작일 반영) 이후를 볼 수 없다 — 선택창·홈 진입 등 어떤 경로든 당월로 되돌린다
  const currentTrendMonth = getCustomMonthInfo(new Date(), monthStartDay);
  if (
    toMonthIndex(reportTrendYear, reportTrendMonth) >
    toMonthIndex(currentTrendMonth.year, currentTrendMonth.month)
  ) {
    setReportTrendYear(currentTrendMonth.year);
    setReportTrendMonth(currentTrendMonth.month);
  }
  const activeYear = reportSubTab === 'score' ? reportScoreYear : reportTrendYear;
  const activeMonth = reportSubTab === 'score' ? reportScoreMonth : reportTrendMonth;
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

  // 홈 잔액/년도 월 카드 → 리포트 탭 진입 시 소비 리포트 서브탭 + 해당 년/월
  const appliedStatusParam = useRef(false);
  useEffect(() => {
    if (params.tab === 'status' && !appliedStatusParam.current) {
      setReportSubTab('score');
      appliedStatusParam.current = true;
    }
  }, [params.tab]);

  // 홈 리스트뷰 「내역」 → 소비 현황 서브탭 + 해당 년/월.
  // ts(호출 시각)가 포함된 키가 바뀔 때마다 한 번 적용한다 — 같은 연·월로 다시 들어와도(그 사이 서브탭을
  // 바꿨어도) 매번 적용. effect가 아니라 렌더 중 상태 조정(키 비교)으로 처리한다.
  const [appliedTrendEntryKey, setAppliedTrendEntryKey] = useState<string | null>(null);
  const trendEntryKey =
    params.tab === 'trend'
      ? `${params.ts ?? ''}|${params.year ?? ''}|${params.month ?? ''}`
      : null;
  if (trendEntryKey !== null && trendEntryKey !== appliedTrendEntryKey) {
    setAppliedTrendEntryKey(trendEntryKey);
    setReportSubTab('trend');
    const paramYear = params.year ? parseInt(params.year, 10) : undefined;
    const paramMonth = params.month ? parseInt(params.month, 10) : undefined;
    if (paramYear != null && !Number.isNaN(paramYear)) {
      setReportTrendYear(paramYear);
    }
    if (paramMonth != null && !Number.isNaN(paramMonth) && paramMonth >= 1 && paramMonth <= 12) {
      setReportTrendMonth(paramMonth);
    }
  }

  // 홈에서 넘긴 year/month가 있으면 해당 연·월로 표시 (탭 재진입 시에도 동기화)
  const [appliedScoreParamKey, setAppliedScoreParamKey] = useState<string | null>(null);
  const scoreParamKey = `${params.year ?? ''}|${params.month ?? ''}|${params.tab ?? ''}`;
  if (scoreParamKey !== appliedScoreParamKey) {
    setAppliedScoreParamKey(scoreParamKey);
    const paramYear = params.year ? parseInt(params.year, 10) : undefined;
    const paramMonth = params.month ? parseInt(params.month, 10) : undefined;
    if (paramYear != null && !Number.isNaN(paramYear)) {
      setReportScoreYear(paramYear);
    }
    if (paramMonth != null && !Number.isNaN(paramMonth) && paramMonth >= 1 && paramMonth <= 12) {
      setReportScoreMonth(paramMonth);
    }
  }

  // 화면에 들어올 때와 서브 탭을 바꿀 때 서브 탭 이름으로 screen_view를 보낸다
  const isReportFocused = useIsFocused();
  const reportScreenName =
    reportSubTab === 'trend' ? REPORT_TREND_SCREEN_NAME : REPORT_CONSUMPTION_SCREEN_NAME;
  useEffect(() => {
    // 전역 UI(안내 카드 등)의 이벤트가 같은 화면 이름을 쓰도록 공유
    setCurrentReportScreenName(reportScreenName);
  }, [reportScreenName]);
  useEffect(() => {
    if (isReportFocused) {
      void logScreenView(reportScreenName);
    }
  }, [isReportFocused, reportScreenName]);

  const [isContentReady, setIsContentReady] = useState(false);
  const hasResolvedTrendMonthRef = useRef(false);
  // 챌린지 제안 카드 중복 방지용 — 화면에 처음 들어온 년·월의 챌린지 (분리 전과 동일)
  const [challengeScope] = useState({ year: initialYear, month: initialMonth });
  const [challenges, setChallenges] = useState<{ category: string }[]>([]);

  // 탭 진입 시 탑 네비 + 본문 페이드인용 (월 변경 시에는 사용 안 함, 1로 유지)
  const [screenOpacity] = useState(() => new Animated.Value(0));
  const hasInitiallyFadedInRef = useRef(false);

  // 소비 리포트 월 변경 시 페이드 아웃/인 (타임라인과 동일) - 점수 박스는 항상 표시, 애니메이션만 적용
  const [reportContentOpacity] = useState(() => new Animated.Value(1));
  const prevReportScoreMonthRef = useRef<{ year: number; month: number } | null>(null);
  const prevReportSyncKeyRef = useRef<string | null>(null);
  const handledReportResetAtRef = useRef<number>(0);

  const refreshData = useCallback(async () => {
    beginLoad();
    try {
      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);
      // 진입 년·월 지정이 없으면 소비 현황은 월 시작일을 반영한 이번 달에서 시작
      if (!hasResolvedTrendMonthRef.current) {
        hasResolvedTrendMonthRef.current = true;
        if (!params.year && !params.month) {
          const current = getCustomMonthInfo(new Date(), monthStart);
          setReportTrendYear(current.year);
          setReportTrendMonth(current.month);
        }
      }
      const monthStartUpdatedAtRaw = await AsyncStorage.getItem('monthStartDayUpdatedAt');
      const parsedMonthStartUpdatedAt = Number(monthStartUpdatedAtRaw ?? 0);
      setMonthStartUpdatedAt(
        Number.isFinite(parsedMonthStartUpdatedAt) ? parsedMonthStartUpdatedAt : 0,
      );

      const { startDate: customStart, endDate: customEnd } = getCustomMonthRange(
        challengeScope.year,
        challengeScope.month,
        monthStart,
      );
      const formatChallengeDate = (dateObj: Date) => formatDateToYmd(dateObj).replace(/-/g, '.');
      const challengeRecords = await getChallengesByDateRange(
        formatChallengeDate(customStart),
        formatChallengeDate(customEnd)
      );
      setChallenges(
        challengeRecords.filter((challenge) => {
          const [startY, startM, startD] = challenge.startDate.split('.').map(Number);
          return isDateInCustomMonth(
            new Date(startY, startM - 1, startD),
            challengeScope.year,
            challengeScope.month,
            monthStart,
          );
        }),
      );
    } catch (err) {
      console.error('[report-tab] Failed to load report data:', err);
      setChallenges([]);
    } finally {
      setIsContentReady(true);
      endLoad();
    }
  }, [beginLoad, endLoad, challengeScope, params.year, params.month]);

  const { dataVersion } = useAppData();
  // 화면에 들어올 때와, 보고 있는 동안 데이터가 바뀔 때 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void dataVersion;
      refreshData();
    }, [dataVersion, refreshData])
  );

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
        const canReuseByPolicyFingerprint =
          typeof parsed.policyFingerprint === 'string' &&
          parsed.policyFingerprint === reportScoreContext.policyFingerprint;
        // 정책 지문이 같으면 캐시 본문을 UI에 복원한다.
        // asOfDate·monthStartUpdatedAt 불일치는 복원을 막지 않는다(일자/로드 타이밍으로 `?` 초기화되던 원인).
        // 지출 기록이 이후 추가·수정되어도 이전에 확정한 리포트 문구는 유지한다(handleCheckScore의
        // "변경 없음 → API 스킵" 판정은 dataRevision으로 별도 유지).
        if (canReuseByPolicyFingerprint && parsed.summary && parsed.challenge) {
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
      if (reportSubTab !== 'score') return;

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
  }, [reportSubTab, reportScoreYear, reportScoreMonth, monthStartDay, dataVersion]);

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

  // 소비 리포트: 월 변경 감지 → 페이드아웃 직후 페이드인 (점수 박스는 데이터 없어도 항상 표시)
  useEffect(() => {
    if (reportSubTab !== 'score') return;
    const next = { year: reportScoreYear, month: reportScoreMonth };
    const prev = prevReportScoreMonthRef.current;
    prevReportScoreMonthRef.current = next;
    if (prev === null || (prev.year === next.year && prev.month === next.month)) return;
    Animated.timing(reportContentOpacity, {
      toValue: 0,
      duration: MONTH_CHANGE_FADE_OUT_DURATION,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      reportContentOpacity.setValue(0);
      Animated.timing(reportContentOpacity, {
        toValue: 1,
        duration: MONTH_CHANGE_FADE_IN_DURATION,
        useNativeDriver: true,
      }).start();
    });
  }, [reportSubTab, reportScoreYear, reportScoreMonth, reportContentOpacity]);

  // 오늘 날짜 기준으로, 커스텀 월 시작일을 반영한 년/월로 이동
  const resetToCurrentMonth = useCallback(async () => {
    const today = new Date();
    const monthStart = await loadMonthStartDay();
    const customMonthInfo = getCustomMonthInfo(today, monthStart);

    if (reportSubTabRef.current === 'score') {
      setReportScoreYear(customMonthInfo.year);
      setReportScoreMonth(customMonthInfo.month);
    } else {
      setReportTrendYear(customMonthInfo.year);
      setReportTrendMonth(customMonthInfo.month);
    }
  }, []);

  // 이미 선택된 탭을 다시 탭 → 중첩 화면 닫고 이번 달로 리셋 (NativeTabs 재선택)
  useEffect(() => {
    return tabReselectEvent.subscribe((tabName) => {
      if (tabName !== 'report') {
        return;
      }
      if (router.canDismiss()) {
        router.dismissTo(REPORT_STACK_PATHS.index);
      }
      resetToCurrentMonth().catch((error) => {
        console.error('[report-tab] Failed to reset to today:', error);
      });
    });
  }, [resetToCurrentMonth, router]);

  const handlePrevMonth = useCallback(() => {
    setReportScoreMonth((prevMonth) => {
      if (prevMonth === 1) {
        setReportScoreYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setReportScoreMonth((prevMonth) => {
      if (prevMonth === 12) {
        setReportScoreYear((prevYear) => prevYear + 1);
        return 1;
      }
      return prevMonth + 1;
    });
  }, []);

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
  // 점수를 확인하기 전에는 점수 카드가 남은 화면 높이를 채운다. 확인한 뒤에는 내용 높이.
  const isBeforeScoreCheck = !(hasCheckedScore && displayedFqScore != null);
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
  }, [aiSummaryText, consumptionIndex, displayedFqScore, displayedTopCategoryInfo]);

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
  }, [aiNextWeekGoalText, consumptionIndex, displayedFqScore, displayedTopCategoryInfo]);

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
  }, [hasCheckedScore, isCollectingIndex, displayedFqScore, remainingRecordsForIndex, scoreFeedbackText]);

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
      if (reportSubTab !== 'score') {
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
    [reportSubTab, reportContentOpacity],
  );

  const handleCheckScore = useCallback(async () => {
    void logEvent('btn', {
      screen_name: REPORT_CONSUMPTION_SCREEN_NAME,
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
          const canReuseByPolicyFingerprint =
            typeof parsed.policyFingerprint === 'string' &&
            parsed.policyFingerprint === reportScoreContext.policyFingerprint;

          // (1) 이미 이 월에서 한 번 이상 분석했고, 월간 지출 데이터 지문도 동일하면 → 분석 중단
          // (레거시 캐시에 dataRevision 없음 → 스킵하지 않고 재분석 허용)
          // asOfDate는 판정에 쓰지 않음: 날짜만 바뀌었을 때 불필요 API 재호출 방지
          if (
            typeof parsed.dataRevision === 'string' &&
            parsed.dataRevision === dataRevision &&
            hasCheckedScore &&
            canReuseByPolicyFingerprint
          ) {
            showToast('변경내역이 없어 분석을 중단합니다.');
            return;
          }

          // (2) 이번 세션에서 아직 점수 확인 전 → 캐시에서 화면만 채움(syncReportFromCache와 동일하게 기록 버전 불일치여도 허용)
          if (
            !hasCheckedScore &&
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
    topCategoryInfo,
    showToast,
    runReportContentRefreshAnimation,
  ]);

  // 소비 리포트: 좌우 스와이프로 월 변경 (소비 현황은 그래프가 좌우 스크롤이라 제외)
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;
        // 가로 스와이프가 세로보다 크고, 일정 거리 이상일 때만 처리
        if (reportSubTab !== 'score') return false;
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
    }),
    [reportSubTab, handleNextMonth, handlePrevMonth],
  );

  return (
    <View style={styles.screenWrapper}>
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
        {/* 탭 진입 시: 데이터 로드 완료 후 탑 네비 + 본문 페이드인 (월 변경 시에는 애니메이션 없음) */}
        <Animated.View style={{ opacity: screenOpacity }}>
          <TopNavigation
            type="main"
            title="리포트"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            {
              backgroundColor: palette.fill,
              opacity: screenOpacity,
            },
          ]}
          {...panResponder.panHandlers}
        >
            <View style={[styles.reportContent, { backgroundColor: palette.backgroundAlt }]}>
              {/* 서브 탭: 소비 리포트 | 소비 현황 (Figma tab) */}
              <View style={[styles.reportSubTabBar, { backgroundColor: palette.staticWhite }]}>
                <Pressable
                  style={styles.reportSubTab}
                  onPress={() => setReportSubTab('score')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: reportSubTab === 'score' }}
                  accessibilityLabel="소비 리포트"
                >
                  <UiLineText
                    variant={reportSubTab === 'score' ? 'body01Bold' : 'body01Medium'}
                    style={[
                      reportSubTab === 'score' ? styles.reportSubTabTextActive : styles.reportSubTabTextInactive,
                      { color: reportSubTab === 'score' ? palette.text : palette.textAssistive },
                    ]}
                  >
                    소비 리포트
                  </UiLineText>
                  {reportSubTab === 'score' && (
                    <View style={[styles.reportSubTabIndicator, { backgroundColor: palette.primary }]} />
                  )}
                </Pressable>
                <Pressable
                  style={styles.reportSubTab}
                  onPress={() => setReportSubTab('trend')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: reportSubTab === 'trend' }}
                  accessibilityLabel="소비 현황"
                >
                  <UiLineText
                    variant={reportSubTab === 'trend' ? 'body01Bold' : 'body01Medium'}
                    style={[
                      reportSubTab === 'trend' ? styles.reportSubTabTextActive : styles.reportSubTabTextInactive,
                      { color: reportSubTab === 'trend' ? palette.text : palette.textAssistive },
                    ]}
                  >
                    소비 현황
                  </UiLineText>
                  {reportSubTab === 'trend' && (
                    <View style={[styles.reportSubTabIndicator, { backgroundColor: palette.primary }]} />
                  )}
                </Pressable>
              </View>
              <View style={[styles.reportSubTabDivider, { backgroundColor: palette.border }]} />

              {reportSubTab === 'score' ? (
                <ScrollView
                  style={[styles.reportScroll, { backgroundColor: palette.fill }]}
                  contentContainerStyle={[
                    styles.reportScrollContent,
                    { paddingBottom: bottomContentInset },
                  ]}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  overScrollMode="never"
                >
                  {/* 월 스위처 카드 (Frame 208) - 고정, 년/월 탭 시 타임라인과 동일한 피커 */}
                  <View style={[styles.reportMonthCard, { backgroundColor: palette.staticWhite }]}>
                    <Pressable
                      onPress={handlePrevMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="이전 달"
                    >
                      <Icon name="arrowLeft" variant="solid" size={24} color={palette.textAssistive} />
                    </Pressable>
                    <Pressable
                      onPress={() => setShowYearMonthPicker(true)}
                      style={styles.reportMonthTextWrap}
                      accessibilityRole="button"
                      accessibilityLabel="년월 선택"
                    >
                      <UiLineText variant="body01Bold" style={[styles.reportMonthText, { color: palette.text }]}>
                        {reportScoreYear}년 {String(reportScoreMonth).padStart(2, '0')}월
                      </UiLineText>
                    </Pressable>
                    <Pressable
                      onPress={handleNextMonth}
                      style={styles.reportMonthArrow}
                      accessibilityRole="button"
                      accessibilityLabel="다음 달"
                    >
                      <Icon name="arrowRight" variant="solid" size={24} color={palette.textAssistive} />
                    </Pressable>
                  </View>

                  {/* 점수 카드 + AI 리포트 (Frame 226/227/228) - 월 변경 시 페이드 아웃/인 */}
                  <Animated.View
                    style={[
                      { opacity: reportContentOpacity },
                      isBeforeScoreCheck && styles.reportScoreFill,
                    ]}
                  >
                    <View
                      style={[
                        styles.reportScoreCard,
                        {
                          backgroundColor: palette.staticWhite,
                        },
                        isBeforeScoreCheck && styles.reportScoreCardFill,
                      ]}
                    >
                      <Text style={[styles.reportScoreLabel, { color: palette.textAssistive }]}>
                        이번달 소비 점수는?
                      </Text>
                      <View style={styles.reportScoreValueRow}>
                        <Text style={[styles.reportScoreEmoji, { color: palette.text }]}>
                          {hasCheckedScore && displayedFqScore != null ? scoreEmoji : ''}
                        </Text>
                        <Text style={[styles.reportScoreValue, { color: palette.text }]}>
                          {hasCheckedScore && displayedFqScore != null ? displayedFqScore : '?'}
                        </Text>
                        <UiLineText variant="body01Bold" style={[styles.reportScoreUnit, { color: palette.text }]}>
                          점
                        </UiLineText>
                      </View>
                      {scoreMessageLines.map((line, idx) => (
                        <Text
                          key={idx}
                          style={[
                            styles.reportScoreMessage,
                            {
                              color: palette.textNeutral,
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
                          { backgroundColor: palette.staticWhite },
                        ]}
                      >
                        <Text style={[styles.reportSummaryTitle, { color: palette.text }]}>
                          📊 이번 달 리포트
                        </Text>
                        <View style={styles.reportSummaryRows}>
                          <View style={styles.reportSummaryRow}>
                            <Text style={[styles.reportSummaryLabel, { color: palette.textAssistive }]}>
                              월간 지출
                            </Text>
                            <Text style={[styles.reportSummaryValue, { color: palette.text }]}>
                              {`${displayedTotalExpense.toLocaleString()}원`}
                            </Text>
                          </View>
                          {!shouldHideNoSpendInEarlyMonth && (
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: palette.textAssistive }]}>
                                무지출일
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: palette.text }]}>
                                {`${displayedNoSpendDays}일 / ${displayedTotalDays}일`}
                              </Text>
                            </View>
                          )}
                        </View>
                        {aiSummaryTitleText && (
                          <Text style={[styles.reportSummaryHeadline, { color: palette.text }]}>
                            {aiSummaryTitleText}
                          </Text>
                        )}
                        {reportSummaryLines.map((line, idx) => (
                          <Text
                            key={idx}
                            style={[
                              styles.reportSummaryBody,
                              {
                                color: palette.textNeutral,
                                marginBottom: idx === reportSummaryLines.length - 1 ? 0 : 8,
                              },
                            ]}
                          >
                            {line}
                          </Text>
                        ))}
                        <View style={styles.reportNextGoal}>
                          <Text style={[styles.reportNextGoalTitle, { color: palette.text }]}>
                            📌 다음 주 목표
                          </Text>
                          {reportNextGoalLines.map((line, idx) => (
                            <Text
                              key={idx}
                              style={[
                                styles.reportNextGoalBody,
                                {
                                  color: palette.textNeutral,
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
                          { backgroundColor: palette.staticWhite },
                        ]}
                      >
                        <Text style={[styles.reportChallengeTitle, { color: palette.text }]}>
                          🎯 챌린지 제안
                        </Text>
                        {displayedTopCategoryInfo && consumptionIndex && (
                          <View style={styles.reportSummaryRows}>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: palette.textAssistive }]}>
                                카테고리
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: palette.text }]}>
                                {displayedTopCategoryInfo.category}
                              </Text>
                            </View>
                            <View style={styles.reportSummaryRow}>
                              <Text style={[styles.reportSummaryLabel, { color: palette.textAssistive }]}>
                                총 소비금액
                              </Text>
                              <Text style={[styles.reportSummaryValue, { color: palette.text }]}>
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
                                color: palette.textNeutral,
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
              ) : null}
              <ReportTrendTab
                visible={reportSubTab === 'trend'}
                year={reportTrendYear}
                month={reportTrendMonth}
                onSelectMonth={(nextYear, nextMonth) => {
                  setReportTrendYear(nextYear);
                  setReportTrendMonth(nextMonth);
                }}
                singleMonthEntryKey={trendEntryKey}
                onPressPeriod={() => setShowYearMonthPicker(true)}
                palette={palette}
                controlBarBottom={controlBarBottom}
              />
            </View>
        </Animated.View>

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
            if (reportSubTab === 'score') {
              setReportScoreYear(nextYear);
            } else {
              setReportTrendYear(nextYear);
            }
          }}
          monthOptions={monthOptions}
          selectedMonth={activeMonth}
          onMonthChange={(newMonth) => {
            if (reportSubTab === 'score') {
              setReportScoreMonth(newMonth);
            } else {
              setReportTrendMonth(newMonth);
            }
          }}
        />

      </SafeAreaView>
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
  reportContent: {
    flex: 1,
    backgroundColor: colors.light.backgroundAlt,
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
    
  },
  reportSubTabTextInactive: {
    
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
    
  },
  reportScoreCard: {
    width: '100%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportScoreFill: {
    flexGrow: 1,
  },
  reportScoreCardFill: {
    flexGrow: 1,
    minHeight: REPORT_SCORE_CARD_MIN,
  },
  reportScoreLabel: {
    ...typography.body02.medium,
    marginBottom: 16,
  },
  reportScoreValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 24,
  },
  reportScoreEmoji: {
    ...typography.headline02.bold,
    marginRight: 4,
  },
  reportScoreValue: {
    ...typography.headline01.bold,
  },
  reportScoreUnit: {
    marginLeft: 4,
  },
  reportScoreMessage: {
    ...typography.body01.regular,
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
    ...typography.body02.bold,
    marginBottom: 8,
  },
  reportSummaryHeadline: {
    ...typography.body02.bold,
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
    ...typography.body02.regular,
    width: 72,
  },
  reportSummaryValue: {
    ...typography.body02.bold,
    flexShrink: 1,
  },
  reportSummaryBody: {
    ...typography.body02.regular,
    marginTop: 0,
  },
  reportNextGoal: {
    marginTop: 12,
  },
  reportNextGoalTitle: {
    ...typography.body02.bold,
    marginBottom: 4,
  },
  reportNextGoalBody: {
    ...typography.body02.regular,
  },
  reportChallengeCard: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 16,
  },
  reportChallengeTitle: {
    ...typography.body02.bold,
    marginBottom: 8,
  },
  reportChallengeBody: {
    ...typography.body02.regular,
  },
});
