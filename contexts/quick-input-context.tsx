/**
 * Quick Input Context
 *
 * 간편입력 오버레이를 탭바 바깥(전체 화면) 레벨에서 렌더링하여
 * 키보드와 동일한 좌표계를 사용하도록 함.
 *
 * react-native-keyboard-controller의 useKeyboardHandler onStart에서
 * duration + height를 받아, withTiming으로 키보드와 동일한 시간에 맞춰
 * 애니메이션하여 겹침/엇박자 감소.
 */

import { QuickInputConfirmCard, type QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';
import { QuickInputField } from '@/components/ui/quick-input-field';
import { QuickInputTipBox } from '@/components/ui/quick-input-tip-box';
import { PARSE_EXPENSE_API_URL } from '@/constants/api';
import { getRandomQuickInputPlaceholder } from '@/constants/quick-input-placeholders';
import { useAppData } from '@/contexts/app-data-context';
import { useToast } from '@/contexts/toast-context';
import { applyPendingCalendarTargetEvent, calendarRefreshEvent } from '@/hooks/calendar-events';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { getApiSecurityHeaders } from '@/utils/api-security-headers';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { rescheduleDailyReminderIfNeeded } from '@/utils/notification-scheduler';
import {
  resolveExpenseSeriesStartDateFromMessage,
  resolveRelativeWeekdayDateFromMessage,
} from '@/utils/parse-expense-relative-date';
import { logEvent } from '@/utils/analytics';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import {
  adjustWeekendDate,
  calculateRecurringIterations,
  getActualDayForMonth,
  getDayOfWeekLabel,
  getNextRecurringDate,
  resolveExpenseRecurringTypeFromMessage,
  getRecurringWeekendOptionDisplayLabel,
} from '@/utils/expense-calculations';
import { createExpensesBatch, type ExpenseRecord, type PaymentMethod } from '@/utils/expenses';
import { createIncome, type IncomeRecord } from '@/utils/incomes';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import { loadCategories } from '@/utils/categories';
import { getDefaultSubtypeIdByMethod, loadPaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { TextInput } from 'react-native';
import { Keyboard, Pressable, Animated as RNAnimated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type AnimatedValue = RNAnimated.Value;

const FAB_OFFSET_ABOVE_TABS = 16;

interface QuickInputContextValue {
  isQuickInputVisible: boolean;
  showQuickInput: (starScale: AnimatedValue, starRotate: AnimatedValue, shortBottomFromScreen?: number) => void;
  hideQuickInput: () => void;
  quickInputText: string;
  setQuickInputText: (text: string) => void;
}

const QuickInputContext = createContext<QuickInputContextValue | undefined>(undefined);

const KEYBOARD_GAP = 16;

/** 토큰 비용 절감: 메시지 최대 길이(자). 초과 시 요청 거부 */
const MAX_MESSAGE_LENGTH = 100;
/** 토큰 비용 절감: 호출 간격 제한 (ms). 이 시간 내 최대 RATE_LIMIT_MAX_REQUESTS회만 허용 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
/** 토큰 비용 절감: 비기록 연속 N회 시 API 호출 잠금 */
const NON_RECORD_LOCK_THRESHOLD = 3;
const NON_RECORD_LOCK_MS = 30_000;

/** parse-expense API가 반환하는 기록 한 건 (확인 카드·기록 생성용) */
interface PendingParseRecord {
  recordType?: 'expense' | 'income';
  category: string | null;
  date: string;
  amount: number;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
  paymentSubtypeId?: string;
  paymentSubtypeColor?: string;
  memo?: string;
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: 'weekend' | 'friday' | 'monday';
}

function toPendingParseRecord(value: unknown): PendingParseRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const rawRecordType = candidate.recordType;
  const rawDate = candidate.date;
  const rawAmount = candidate.amount;
  const rawCategory = candidate.category;
  const rawPaymentMethod = candidate.paymentMethod;
  const rawMemo = candidate.memo;
  const rawPaymentSubtypeLabel = candidate.paymentSubtypeLabel;
  const rawRecurringType = candidate.recurringType;
  const rawWeekendOption = candidate.weekendOption;

  const date = typeof rawDate === 'string' ? rawDate : '';
  const amount = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount);
  const category = typeof rawCategory === 'string' ? rawCategory : null;
  const paymentMethod =
    rawPaymentMethod === 'credit' || rawPaymentMethod === 'debit' || rawPaymentMethod === 'cash'
      ? rawPaymentMethod
      : undefined;
  const memo = typeof rawMemo === 'string' ? rawMemo : undefined;
  const paymentSubtypeLabel =
    typeof rawPaymentSubtypeLabel === 'string' ? rawPaymentSubtypeLabel.trim() : undefined;
  const recurringType = typeof rawRecurringType === 'string' ? rawRecurringType : undefined;
  const weekendOption =
    rawWeekendOption === 'weekend' || rawWeekendOption === 'friday' || rawWeekendOption === 'monday'
      ? rawWeekendOption
      : undefined;

  if (!Number.isFinite(amount)) {
    return null;
  }

  return {
    recordType: rawRecordType === 'income' ? 'income' : 'expense',
    category,
    date,
    amount,
    paymentMethod,
    paymentSubtypeLabel,
    memo,
    isRecurring: candidate.isRecurring as PendingParseRecord['isRecurring'],
    isInstallment: candidate.isInstallment as PendingParseRecord['isInstallment'],
    recurringType,
    totalMonths: typeof candidate.totalMonths === 'number' ? candidate.totalMonths : Number(candidate.totalMonths),
    weekendOption,
  };
}

function normalizeApiRecords(records: unknown): PendingParseRecord[] {
  if (Array.isArray(records)) {
    return records
      .map((item) => toPendingParseRecord(item))
      .filter((item): item is PendingParseRecord => item != null);
  }

  const single = toPendingParseRecord(records);
  return single ? [single] : [];
}

function parsePendingDate(date: string): { year: number; month: number; day: number } | null {
  const matched = date.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (!matched) {
    return null;
  }

  const year = parseInt(matched[1], 10);
  const month = parseInt(matched[2], 10);
  const day = parseInt(matched[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day);
  const isSameDate =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
  if (!isSameDate) {
    return null;
  }

  return { year, month, day };
}

type RequiredField = 'category' | 'date' | 'amount';

function requiredFieldToast(field: RequiredField): string {
  switch (field) {
    case 'category':
      return '카테고리를 기입해 주세요.';
    case 'date':
      return '날짜를 기입해 주세요.';
    case 'amount':
      return '금액을 기입해 주세요.';
    default:
      return '입력값을 확인해 주세요.';
  }
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function hasInvalidDateToken(message: string): boolean {
  const nowYear = new Date().getFullYear();

  const ymdDotMatches = message.matchAll(/(\d{4})\.(\d{1,2})\.(\d{1,2})/g);
  for (const match of ymdDotMatches) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return true;
    }
  }

  const ymdSlashMatches = message.matchAll(/(\d{4})\/(\d{1,2})\/(\d{1,2})/g);
  for (const match of ymdSlashMatches) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!isValidCalendarDate(year, month, day)) {
      return true;
    }
  }

  const mdKoreanMatches = message.matchAll(/(\d{1,2})월\s*(\d{1,2})일/g);
  for (const match of mdKoreanMatches) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!isValidCalendarDate(nowYear, month, day)) {
      return true;
    }
  }

  const mdDotMatches = message.matchAll(/(?:^|[^\d])(\d{1,2})\.(\d{1,2})(?:[^\d]|$)/g);
  for (const match of mdDotMatches) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!isValidCalendarDate(nowYear, month, day)) {
      return true;
    }
  }

  const mdSlashMatches = message.matchAll(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:[^\d]|$)/g);
  for (const match of mdSlashMatches) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    if (!isValidCalendarDate(nowYear, month, day)) {
      return true;
    }
  }

  return false;
}

function resolveMessageValidationToast(message: string, categoryLabels: string[], today: string): string | null {
  const normalizedMessage = message.trim();
  const hasCategory = categoryLabels.some((label) => normalizedMessage.includes(label));
  const hasDate =
    /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(normalizedMessage) ||
    /\d{1,2}월\s*\d{1,2}일/.test(normalizedMessage) ||
    /\d{1,2}[.\-/]\d{1,2}/.test(normalizedMessage) ||
    /오늘|어제|그제|내일|모레/.test(normalizedMessage) ||
    resolveRelativeWeekdayDateFromMessage(normalizedMessage, today) != null;
  const hasAmount =
    /(\d[\d,]*)\s*원/.test(normalizedMessage) ||
    /(\d[\d,]*)\s*(만원|천원|백원)/.test(normalizedMessage);

  const noCategory = !hasCategory;
  const noDate = !hasDate;
  const noAmount = !hasAmount;

  if (noCategory && noDate && noAmount) {
    return '지출하신 소비내역을 입력해 주세요.';
  }

  if (hasDate && hasInvalidDateToken(normalizedMessage)) {
    return '올바른 날짜를 기입해 주세요.';
  }

  if (noCategory) return requiredFieldToast('category');
  if (noDate) return requiredFieldToast('date');
  if (noAmount) return requiredFieldToast('amount');
  return null;
}

function hasUnresolvablePersonalDateHint(message: string): boolean {
  return /카드\s*결제일|결제일|월급날|급여일/.test(message);
}

function hasConcreteDateHint(message: string, today: string): boolean {
  return (
    /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/.test(message) ||
    /\d{1,2}월\s*\d{1,2}일/.test(message) ||
    /\d{1,2}[.\-/]\d{1,2}/.test(message) ||
    /오늘|어제|그제|내일|모레/.test(message) ||
    resolveRelativeWeekdayDateFromMessage(message, today) != null
  );
}

function hasIncomeHintInMessage(message: string): boolean {
  return /월급|급여|보너스|입금|용돈|환급|수입|꽁돈|용돈받/.test(message) || /salary|income|bonus|windfall/.test(message.toLowerCase());
}

function formatDateDisplay(dateStr: string): string {
  const parsed = parsePendingDate(dateStr);
  if (!parsed) return dateStr;
  const { year, month, day } = parsed;
  const y = String(year);
  const dayLabel = getDayOfWeekLabel(year, month, day);
  return `${y}년 ${month}월 ${day}일(${dayLabel})`;
}

function paymentMethodToLabel(method?: 'credit' | 'debit' | 'cash'): string {
  switch (method) {
    case 'debit':
      return '체크카드';
    case 'cash':
      return '현금';
    default:
      return '신용카드';
  }
}

function formatAmount(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function normalizePaymentSubtypeText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function normalizePaymentSubtypeStem(value: string): string {
  return normalizePaymentSubtypeText(value).replace(/(체크카드|신용카드|체크|신용|카드)/g, '');
}

function inferPaymentMethodFromLabel(
  label: string | undefined,
): 'credit' | 'debit' | undefined {
  const normalized = normalizePaymentSubtypeText(label ?? '');
  if (!normalized) return undefined;
  if (normalized.includes('체크')) return 'debit';
  if (normalized.includes('신용')) return 'credit';
  return undefined;
}

function findBestPaymentSubtypeMatch(
  subtypes: PaymentSubtype[],
  method: 'credit' | 'debit' | 'cash' | undefined,
  label: string | undefined,
): PaymentSubtype | undefined {
  const normalizedLabel = (label ?? '').trim();
  if (!normalizedLabel) return undefined;

  const inferredMethod = inferPaymentMethodFromLabel(normalizedLabel);
  const primaryMethod =
    method && method !== 'cash' ? method : inferredMethod;

  const pickFromCandidates = (candidates: PaymentSubtype[]): PaymentSubtype | undefined => {
    if (candidates.length === 0) return undefined;

    const normalized = normalizePaymentSubtypeText(normalizedLabel);
    const normalizedStem = normalizePaymentSubtypeStem(normalizedLabel);

    const exact = candidates.find((item) => normalizePaymentSubtypeText(item.label) === normalized);
    if (exact) return exact;

    const stemExact = normalizedStem
      ? candidates.find((item) => normalizePaymentSubtypeStem(item.label) === normalizedStem)
      : undefined;
    if (stemExact) return stemExact;

    return candidates.find((item) => {
      const target = normalizePaymentSubtypeText(item.label);
      const targetStem = normalizePaymentSubtypeStem(item.label);
      return (
        target.includes(normalized) ||
        normalized.includes(target) ||
        (normalizedStem.length > 0 &&
          (targetStem.includes(normalizedStem) || normalizedStem.includes(targetStem)))
      );
    });
  };

  if (primaryMethod) {
    const byMethod = pickFromCandidates(subtypes.filter((item) => item.type === primaryMethod));
    if (byMethod) return byMethod;
  }

  return pickFromCandidates(subtypes);
}

function inferSubtypeFromMessage(
  subtypes: PaymentSubtype[],
  message: string,
  method: 'credit' | 'debit' | 'cash' | undefined,
): PaymentSubtype | undefined {
  const normalizedMessage = normalizePaymentSubtypeText(message);
  if (!normalizedMessage) return undefined;

  const inferredMethod = method === 'cash' ? undefined : method;
  const candidates = inferredMethod
    ? subtypes.filter((item) => item.type === inferredMethod)
    : subtypes;

  const scored = candidates
    .map((item) => {
      const labelNorm = normalizePaymentSubtypeText(item.label);
      const labelStem = normalizePaymentSubtypeStem(item.label);
      const messageStem = normalizePaymentSubtypeStem(message);
      const directHit = labelNorm.length > 0 && normalizedMessage.includes(labelNorm);
      const stemHit = labelStem.length > 0 && messageStem.includes(labelStem);
      const score = (directHit ? 1000 : 0) + (stemHit ? 100 : 0) + labelNorm.length;
      return { item, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.item;
}

function toBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1;
}

function normalizePendingRecord(r: PendingParseRecord): PendingParseRecord {
  const isRecurring = toBool(r.isRecurring);
  const isInstallment = toBool(r.isInstallment);
  return {
    ...r,
    isRecurring: isRecurring || undefined,
    isInstallment: isInstallment || undefined,
    recurringType: isRecurring ? (r.recurringType || '매월') : undefined,
    totalMonths:
      isRecurring || isInstallment
        ? Math.max(2, Math.min(12, typeof r.totalMonths === 'number' ? r.totalMonths : parseInt(String(r.totalMonths || 12), 10) || 12))
        : undefined,
    weekendOption:
      isRecurring || isInstallment
        ? (r.weekendOption === 'friday' || r.weekendOption === 'monday' ? r.weekendOption : 'weekend')
        : undefined,
  };
}

function isValidPendingDate(date: unknown): date is string {
  return typeof date === 'string' && parsePendingDate(date) != null;
}

/** 메시지에서 정기/할부 의도 추론 후 record에 반영 (API 미반환 시 클라이언트 fallback) */
function applyMessageFallback(raw: PendingParseRecord, message: string): PendingParseRecord {
  const record = normalizePendingRecord(raw);
  const msg = message.trim();
  if (!msg) return record;
  const inferredRecurringType = resolveExpenseRecurringTypeFromMessage(msg, record.recurringType);
  const hasRecurring =
    inferredRecurringType != null ||
    /구독|매달|매월|월세|정기|매주|매일/.test(msg) ||
    /subscription|monthly|recurring/.test(msg);
  const hasInstallment = /할부|\d+개월\s*할부/.test(msg);
  if (hasRecurring && toBool(record.isRecurring) && !toBool(record.isInstallment)) {
    return normalizePendingRecord({
      ...record,
      recurringType: inferredRecurringType || record.recurringType || '매월',
      totalMonths: record.totalMonths ?? 12,
      weekendOption: (record.weekendOption as 'weekend' | 'friday' | 'monday') || 'weekend',
    });
  }
  if (hasRecurring && !toBool(record.isRecurring) && !toBool(record.isInstallment)) {
    let recurringType = record.recurringType;
    if (!recurringType) {
      if (inferredRecurringType) recurringType = inferredRecurringType;
      else if (/매주|주간|weekly/.test(msg)) recurringType = '매주';
      else if (/매일|일간|daily/.test(msg)) recurringType = '매일';
      else recurringType = '매월';
    }
    return normalizePendingRecord({
      ...record,
      isRecurring: true,
      recurringType,
      totalMonths: record.totalMonths ?? 12,
      weekendOption: (record.weekendOption as 'weekend' | 'friday' | 'monday') || 'weekend',
    });
  }
  if (hasInstallment && !toBool(record.isRecurring) && !toBool(record.isInstallment)) {
    const m = msg.match(/(\d+)개월/);
    const months = m ? Math.min(12, Math.max(2, parseInt(m[1], 10) || 3)) : 3;
    return normalizePendingRecord({
      ...record,
      isInstallment: true,
      totalMonths: record.totalMonths ?? months,
      weekendOption: (record.weekendOption as 'weekend' | 'friday' | 'monday') || 'weekend',
    });
  }
  return record;
}

function getRepeatOption1(record: PendingParseRecord): string {
  const r = normalizePendingRecord(record);
  if (r.isRecurring) return '정기 기록';
  if (r.isInstallment) return '할부 기록';
  return '안함';
}

function getRepeatOption2(record: PendingParseRecord): string {
  const r = normalizePendingRecord(record);
  if (r.isRecurring && r.recurringType) return r.recurringType;
  if (r.isInstallment && r.totalMonths) return `${r.totalMonths}개월`;
  return '';
}

function getRepeatOption3(record: PendingParseRecord): string {
  const r = normalizePendingRecord(record);
  if (!r.isRecurring && !r.isInstallment) return '';
  return getRecurringWeekendOptionDisplayLabel(r.recurringType, r.weekendOption ?? 'weekend', {
    isRecurring: !!r.isRecurring,
  });
}

export const QuickInputProvider = ({ children }: PropsWithChildren) => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { refresh } = useAppData();
  const [isQuickInputVisible, setIsQuickInputVisible] = useState(false);
  const [quickInputText, setQuickInputText] = useState('');
  const [quickInputPlaceholder, setQuickInputPlaceholder] = useState(getRandomQuickInputPlaceholder);
  const [confirmCardData, setConfirmCardData] = useState<QuickInputConfirmCardData | null>(null);
  const [isQuickInputSendLoading, setIsQuickInputSendLoading] = useState(false);
  const [isQuickInputConfirmAdding, setIsQuickInputConfirmAdding] = useState(false);
  const shortBottomFromScreen = useSharedValue(KEYBOARD_GAP);
  const lastShortBottomRef = useRef<number>(KEYBOARD_GAP);
  const pendingRecordRef = useRef<PendingParseRecord | null>(null);
  /** 토큰 비용 절감: 최근 요청 시각 목록 (rate limit용) */
  const rateLimitTimestampsRef = useRef<number[]>([]);
  /** 토큰 비용 절감: 비기록 연속 횟수, 잠금 해제 시각 */
  const nonRecordCountRef = useRef(0);
  const lockEndTimeRef = useRef<number>(0);
  /** 간헐적 중복 탭/중복 실행 방지용 in-flight lock */
  const isConfirmAddInFlightRef = useRef(false);

  const quickInputRef = useRef<TextInput>(null);
  const paymentSubtypesCacheRef = useRef<PaymentSubtype[]>([]);
  const expenseCategoriesCacheRef = useRef<Array<{ label: string; emoji: string }>>([]);
  const incomeCategoriesCacheRef = useRef<Array<{ label: string; emoji: string }>>([]);
  const quickInputBackdropOpacity = useRef(new RNAnimated.Value(0)).current;
  /** 숏/롱 동일 애니메이션: 부모 starScale/starRotate 공유. 새로고침 시 크래시 방지를 위해 fallback 보유 */
  const starRefs = useRef<{ starScale: AnimatedValue; starRotate: AnimatedValue } | null>(null);
  const overlayStarScale = useRef(new RNAnimated.Value(1)).current;
  const overlayStarRotate = useRef(new RNAnimated.Value(0)).current;

  // 키보드와 동일한 duration으로 애니메이션하여 겹침/엇박자 감소
  const animatedBottom = useSharedValue(KEYBOARD_GAP);
  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        const keyboardHeight = Number.isFinite(e.height) ? e.height : 0;
        const target = keyboardHeight + KEYBOARD_GAP;
        if (keyboardHeight > 0) {
          const rawDuration =
            Number.isFinite(e.duration) && e.duration > 0 && e.duration <= 1000
              ? e.duration
              : 250;
          const duration = rawDuration * 0.89;
          animatedBottom.value = withTiming(target, {
            duration,
            // 쿼티 키패드의 자연스러운 ease-out 커브에 가까운 감쇠
            easing: Easing.out(Easing.cubic),
          });
        } else {
          animatedBottom.value = shortBottomFromScreen.value;
        }
      },
      onEnd: (e) => {
        'worklet';
        const keyboardHeight = Number.isFinite(e.height) ? e.height : 0;
        animatedBottom.value = keyboardHeight + KEYBOARD_GAP;
      },
    },
    []
  );

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    bottom: animatedBottom.value,
  }));

  const showQuickInput = useCallback((starScale: AnimatedValue, starRotate: AnimatedValue, shortBottom?: number) => {
    if (!isAtLeastVersion(Constants.expoConfig?.version, QUICK_INPUT_MIN_VERSION)) return;
    starRefs.current = { starScale, starRotate };
    const bottom = Number.isFinite(shortBottom) ? Math.max(KEYBOARD_GAP, shortBottom) : KEYBOARD_GAP;
    lastShortBottomRef.current = bottom;
    shortBottomFromScreen.value = bottom;
    animatedBottom.value = bottom;
    setQuickInputPlaceholder(getRandomQuickInputPlaceholder());
    setIsQuickInputVisible(true);
  }, []);

  const setQuickInputTextTruncated = useCallback((text: string) => {
    setQuickInputText(text.slice(0, MAX_MESSAGE_LENGTH));
  }, []);

  const hideQuickInput = useCallback(() => {
    overlayStarScale.stopAnimation();
    overlayStarRotate.stopAnimation();
    starRefs.current = null;
    setIsQuickInputVisible(false);
    setQuickInputText('');
    setConfirmCardData(null);
    pendingRecordRef.current = null;
    setIsQuickInputSendLoading(false);
    setIsQuickInputConfirmAdding(false);
  }, [overlayStarScale, overlayStarRotate]);

  const getPaymentSubtypesCached = useCallback(async (): Promise<PaymentSubtype[]> => {
    if (paymentSubtypesCacheRef.current.length > 0) {
      return paymentSubtypesCacheRef.current;
    }
    const loaded = await loadPaymentSubtypes();
    paymentSubtypesCacheRef.current = loaded;
    return loaded;
  }, []);

  const getExpenseCategoriesCached = useCallback(async () => {
    if (expenseCategoriesCacheRef.current.length > 0) {
      return expenseCategoriesCacheRef.current;
    }
    const loaded = await loadCategories('expense');
    expenseCategoriesCacheRef.current = loaded;
    return loaded;
  }, []);

  const getIncomeCategoriesCached = useCallback(async () => {
    if (incomeCategoriesCacheRef.current.length > 0) {
      return incomeCategoriesCacheRef.current;
    }
    const loaded = await loadCategories('income');
    incomeCategoriesCacheRef.current = loaded;
    return loaded;
  }, []);

  const handleSend = useCallback(async () => {
    if (!quickInputText.trim()) return;
    if (confirmCardData != null) {
      showToast('먼저 생성한 기록을 확인해 주세요.');
      return;
    }
    const message = quickInputText.trim();
    void logEvent('ui', {
      screen_name: '/home',
      target: 'sentence',
    });

    const now = Date.now();
    if (lockEndTimeRef.current > now) {
      const remainingSec = Math.ceil((lockEndTimeRef.current - now) / 1000);
      showToast(`잠시 후 다시 시도해 주세요.(${remainingSec}초)`);
      return;
    }

    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const timestamps = rateLimitTimestampsRef.current.filter((t) => t > windowStart);
    if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      showToast('잠시 후 다시 시도해 주세요.');
      return;
    }
    rateLimitTimestampsRef.current = [...timestamps, now];

    setIsQuickInputSendLoading(true);

    try {
      const [categoryList, incomeCategoryList] = await Promise.all([
        getExpenseCategoriesCached(),
        getIncomeCategoriesCached(),
      ]);
      const categories = [...categoryList, ...incomeCategoryList].map((c) => c.label);
      const paymentSubtypesPromise = getPaymentSubtypesCached();
      const date = new Date();
      const today = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
      if (hasUnresolvablePersonalDateHint(message) && !hasConcreteDateHint(message, today)) {
        showToast(requiredFieldToast('date'));
        return;
      }
      const securityHeaders = await getApiSecurityHeaders();

      const res = await fetch(PARSE_EXPENSE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...securityHeaders,
        },
        body: JSON.stringify({ message, categories, today }),
      });

      const data = (await res.json()) as {
        records?: PendingParseRecord[];
        suggestedCategory?: { label: string; emoji: string } | null;
        reply?: string | null;
      };

      if (!res.ok) {
        showToast(data?.reply ?? '요청에 실패했습니다. 다시 시도해 주세요.');
        return;
      }

      const records = normalizeApiRecords(data.records);
      const suggested = data.suggestedCategory;
      if (records.length === 0) {
        if (data.reply === requiredFieldToast('date')) {
          showToast(data.reply);
          return;
        }
        const validationToast = resolveMessageValidationToast(message, categories, today);
        if (validationToast) {
          showToast(validationToast);
          return;
        }
        nonRecordCountRef.current += 1;
        if (nonRecordCountRef.current >= NON_RECORD_LOCK_THRESHOLD) {
          lockEndTimeRef.current = Date.now() + NON_RECORD_LOCK_MS;
        }
        showToast('지출하신 소비내역을 입력해 주세요.');
        return;
      }

      nonRecordCountRef.current = 0;
      const first = applyMessageFallback(records[0], message);
      const paymentSubtypes = await paymentSubtypesPromise;
      const isIncomeRecord = first.recordType === 'income' || hasIncomeHintInMessage(message);
      const matchedSubtypeForFirst =
        !isIncomeRecord
          ? (
        findBestPaymentSubtypeMatch(
          paymentSubtypes,
          first.paymentMethod,
          first.paymentSubtypeLabel,
        ) ??
        inferSubtypeFromMessage(paymentSubtypes, message, first.paymentMethod)
          )
          : undefined;
      const defaultCreditSubtype = paymentSubtypes.find(
        (item) => item.id === getDefaultSubtypeIdByMethod('credit', paymentSubtypes)
      );
      const resolvedPaymentMethod = isIncomeRecord
        ? undefined
        : first.paymentMethod === 'cash'
        ? 'cash'
        : (matchedSubtypeForFirst?.type ?? first.paymentMethod ?? inferPaymentMethodFromLabel(first.paymentSubtypeLabel) ?? 'credit');
      const normalizedFirstBase: PendingParseRecord = {
        ...first,
        recordType: isIncomeRecord ? 'income' : 'expense',
        paymentMethod: isIncomeRecord ? undefined : resolvedPaymentMethod,
        paymentSubtypeId: isIncomeRecord ? undefined : matchedSubtypeForFirst?.id,
        paymentSubtypeColor: isIncomeRecord ? undefined : matchedSubtypeForFirst?.color,
        paymentSubtypeLabel:
          isIncomeRecord || resolvedPaymentMethod === 'cash'
            ? undefined
            : matchedSubtypeForFirst?.label ?? first.paymentSubtypeLabel ?? defaultCreditSubtype?.label,
        isRecurring: isIncomeRecord ? undefined : first.isRecurring,
        isInstallment: isIncomeRecord ? undefined : first.isInstallment,
        recurringType: isIncomeRecord ? undefined : first.recurringType,
        totalMonths: isIncomeRecord ? undefined : first.totalMonths,
        weekendOption: isIncomeRecord ? undefined : first.weekendOption,
      };
      const relativeDate = resolveRelativeWeekdayDateFromMessage(message, today);
      const normalizedFirstWithRelativeDate: PendingParseRecord = relativeDate
        ? { ...normalizedFirstBase, date: relativeDate }
        : normalizedFirstBase;
      const seriesStartDate =
        !isIncomeRecord && (normalizedFirstWithRelativeDate.isRecurring || normalizedFirstWithRelativeDate.isInstallment)
          ? resolveExpenseSeriesStartDateFromMessage(message, today, normalizedFirstWithRelativeDate.date)
          : null;
      const normalizedFirst: PendingParseRecord = seriesStartDate
        ? { ...normalizedFirstWithRelativeDate, date: seriesStartDate }
        : normalizedFirstWithRelativeDate;
      const parsedAmount = Number(first.amount);
      const normalizedCategory = typeof normalizedFirst.category === 'string' ? normalizedFirst.category.trim() : '';
      if (!normalizedCategory) {
        showToast(requiredFieldToast('category'));
        return;
      }
      if (!isValidPendingDate(normalizedFirst.date) || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        if (!isValidPendingDate(normalizedFirst.date)) {
          showToast('올바른 날짜를 기입해 주세요.');
          return;
        }
        if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
          showToast(requiredFieldToast('amount'));
          return;
        }
        showToast('인식된 기록 정보를 다시 확인해 주세요.');
        return;
      }
      pendingRecordRef.current = normalizedFirst;

      const categoryLabel = normalizedFirst.category ?? suggested?.label ?? '기타';
      const matchedCategory = categoryList.find((c) => c.label === categoryLabel);
      const matchedIncomeCategory = incomeCategoryList.find((c) => c.label === categoryLabel);
      const categoryEmoji = matchedCategory?.emoji ?? suggested?.emoji ?? '';
      const fallbackSubtypeLabel = paymentMethodToLabel(normalizedFirst.paymentMethod);
      const inferredSubtypeLabel = normalizedFirst.paymentSubtypeLabel?.trim();
      const paymentTypeLabel = normalizedFirst.paymentMethod === 'cash'
        ? '현금'
        : (inferredSubtypeLabel || fallbackSubtypeLabel);
      const paymentTypeColor =
        normalizedFirst.paymentMethod === 'cash'
          ? undefined
          : (normalizedFirst.paymentSubtypeColor ?? defaultCreditSubtype?.color);
      const paymentTypeEmoji = normalizedFirst.paymentMethod === 'cash' ? '💰' : undefined;

      setConfirmCardData({
        recordType: normalizedFirst.recordType,
        category: categoryLabel,
        categoryEmoji: (matchedIncomeCategory?.emoji ?? categoryEmoji) || undefined,
        date: formatDateDisplay(normalizedFirst.date),
        amount: formatAmount(parsedAmount),
        paymentType: normalizedFirst.recordType === 'income' ? undefined : paymentTypeLabel,
        paymentTypeColor: normalizedFirst.recordType === 'income' ? undefined : paymentTypeColor,
        paymentTypeEmoji: normalizedFirst.recordType === 'income' ? undefined : paymentTypeEmoji,
        repeatOption1: normalizedFirst.recordType === 'income' ? undefined : getRepeatOption1(normalizedFirst),
        repeatOption2: normalizedFirst.recordType === 'income' ? undefined : getRepeatOption2(normalizedFirst),
        repeatOption3: normalizedFirst.recordType === 'income' ? undefined : getRepeatOption3(normalizedFirst),
      });
    } catch {
      showToast('요청에 실패했습니다. 다시 시도해 주세요.');
      // 토큰 비용 절감: 실패 시 자동 재시도 없음 (사용자가 다시 보내기 시에만 재요청)
    } finally {
      setIsQuickInputSendLoading(false);
    }
  }, [
    quickInputText,
    confirmCardData,
    getExpenseCategoriesCached,
    getIncomeCategoriesCached,
    getPaymentSubtypesCached,
    showToast,
  ]);

  const handleConfirmCardAdd = useCallback(async () => {
    if (isConfirmAddInFlightRef.current || isQuickInputConfirmAdding) {
      return;
    }

    const pending = pendingRecordRef.current;
    if (!pending) {
      setConfirmCardData(null);
      hideQuickInput();
      return;
    }
    void logEvent('btn', {
      screen_name: '/home',
      target: 'sentence-cardadd-confirm',
    });
    isConfirmAddInFlightRef.current = true;
    setIsQuickInputConfirmAdding(true);

    try {
      const dateStr = pending.date;
      const parsedDate = parsePendingDate(dateStr);
      if (!parsedDate) {
        showToast('올바른 날짜를 기입해 주세요.');
        return;
      }
      const { year, month, day } = parsedDate;

      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
      const isWeekday = !isWeekendDay;

      const isRecurring = !!pending.isRecurring;
      const isInstallment = !!pending.isInstallment;
      const isIncomeRecord = pending.recordType === 'income';
      const recurringType = pending.recurringType ?? '매월';
      const totalMonths = Math.max(2, Math.min(12, pending.totalMonths ?? 1));
      const weekendOption = (pending.weekendOption ?? 'weekend') as 'weekend' | 'friday' | 'monday';

      let actualDate = dateStr;
      if (isRecurring && recurringType === '주중' && isWeekendDay) {
        const nextMonday = new Date(dateObj);
        const daysUntilMonday = (8 - dayOfWeek) % 7;
        nextMonday.setDate(nextMonday.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
        actualDate = `${nextMonday.getFullYear()}.${String(nextMonday.getMonth() + 1).padStart(2, '0')}.${String(nextMonday.getDate()).padStart(2, '0')}`;
      } else if (isRecurring && recurringType === '주말' && isWeekday) {
        const thisSaturday = new Date(dateObj);
        const daysUntilSaturday = 6 - dayOfWeek;
        thisSaturday.setDate(thisSaturday.getDate() + daysUntilSaturday);
        actualDate = `${thisSaturday.getFullYear()}.${String(thisSaturday.getMonth() + 1).padStart(2, '0')}.${String(thisSaturday.getDate()).padStart(2, '0')}`;
      } else {
        const shouldIgnore = isRecurring && ['매일', '주중', '주말'].includes(recurringType);
        if ((isRecurring || isInstallment) && isWeekendDay && weekendOption !== 'weekend' && !shouldIgnore) {
          actualDate = adjustWeekendDate(dateStr, weekendOption);
        }
      }

      const newTimestamp = Date.now();
      const recordId = generateRecordId();
      const recurringId = isRecurring ? generateGroupId('recurring') : undefined;
      const installmentId = isInstallment ? generateGroupId('installment') : undefined;
      const allPaymentSubtypes = isIncomeRecord ? [] : await getPaymentSubtypesCached();

      const expenseAmount = Number(pending.amount);
      if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
        showToast('금액을 확인해 주세요.');
        return;
      }

      if (isIncomeRecord) {
        const incomeRecord: IncomeRecord = {
          type: 'income',
          id: generateRecordId(),
          amount: expenseAmount,
          category: pending.category ?? '기타',
          date: actualDate,
          timestamp: Date.now(),
          memo: pending.memo,
          createdVia: 'simple',
        };
        await createIncome(incomeRecord, { simpleCreation: true });
        await refreshWidgetWithCurrentMonth().catch(() => {});
        pendingRecordRef.current = null;
        setConfirmCardData(null);
        hideQuickInput();
        showToast('기록 생성이 완료되었습니다.');
        await refresh();
        calendarRefreshEvent.emit();
        rescheduleDailyReminderIfNeeded().catch(() => {});
        return;
      }

      let monthlyAmount: number;
      if (isInstallment) {
        const baseAmount = Math.floor(expenseAmount / totalMonths);
        const remainder = expenseAmount - baseAmount * totalMonths;
        monthlyAmount = baseAmount + remainder;
      } else {
        monthlyAmount = expenseAmount;
      }

      const recordsToSave: ExpenseRecord[] = [];
      const paymentMethod = (pending.paymentMethod as PaymentMethod) ?? 'credit';
      const paymentSubtypeLabel = pending.paymentSubtypeLabel?.trim() ?? '';
      let paymentSubtypeId: string | undefined;
      if (paymentMethod !== 'cash') {
        const matchedSubtype = pending.paymentSubtypeId
          ? allPaymentSubtypes.find((item) => item.id === pending.paymentSubtypeId)
          : findBestPaymentSubtypeMatch(
              allPaymentSubtypes,
              paymentMethod,
              paymentSubtypeLabel,
            );
        paymentSubtypeId =
          matchedSubtype?.id ?? getDefaultSubtypeIdByMethod(paymentMethod, allPaymentSubtypes);
      }
      const baseRecord: ExpenseRecord = {
        type: 'expense',
        id: recordId,
        amount: monthlyAmount,
        category: pending.category ?? '기타',
        date: actualDate,
        timestamp: newTimestamp,
        paymentMethod,
        paymentSubtypeId,
        memo: pending.memo,
        isRecurring,
        weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
        recurringId,
        installmentId,
        isAutoGenerated: false,
        isInstallment: isInstallment ? true : undefined,
        totalMonths: isRecurring ? totalMonths : undefined,
        installmentMonths: isInstallment ? totalMonths : undefined,
        originalInstallment: isInstallment ? true : undefined,
        recurringType: isRecurring ? recurringType : undefined,
        originalAmount: monthlyAmount,
        originalCategory: pending.category ?? '기타',
        originalDate: actualDate,
        createdVia: 'simple',
      };
      recordsToSave.push(baseRecord);

      if ((isRecurring || isInstallment) && !isRecurring) {
        const [yearNum, monthNum, dayNum] = dateStr.split('.').map(Number);
        for (let i = 1; i < totalMonths; i++) {
          let futureMonth = monthNum + i;
          let futureYear = yearNum;
          while (futureMonth > 12) {
            futureMonth -= 12;
            futureYear += 1;
          }
          const actualDay = getActualDayForMonth(futureYear, futureMonth, dayNum);
          let futureDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
          const futureDateObj = new Date(futureYear, futureMonth - 1, actualDay);
          const futureDayOfWeek = futureDateObj.getDay();
          if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend') {
            futureDate = adjustWeekendDate(futureDate, weekendOption);
          }
          const futureAmount = Math.floor(expenseAmount / totalMonths);
          recordsToSave.push({
            ...baseRecord,
            id: generateRecordId(),
            amount: futureAmount,
            date: futureDate,
            timestamp: newTimestamp + i,
            isAutoGenerated: true,
            originalAmount: futureAmount,
            originalDate: futureDate,
          });
        }
      } else if ((isRecurring || isInstallment) && isRecurring) {
        let iterations: number;
        iterations = calculateRecurringIterations(actualDate, recurringType);
        let currentDate = actualDate;
        const startYear = year;
        for (let iteration = 1; iteration < iterations; iteration++) {
          const nextDate = getNextRecurringDate(currentDate, recurringType, iteration, startYear);
          if (!nextDate) break;
          const isEdgeCaseAdjusted =
            isRecurring &&
            ((recurringType === '주중' && isWeekendDay) || (recurringType === '주말' && isWeekday));
          let futureDate = nextDate;
          if (iteration === 1 && isEdgeCaseAdjusted) {
            const [ny, nm, nd] = nextDate.split('.').map(Number);
            const nextDateObj = new Date(ny, nm - 1, nd);
            const actualDateObj = new Date(
              parseInt(actualDate.split('.')[0], 10),
              parseInt(actualDate.split('.')[1], 10) - 1,
              parseInt(actualDate.split('.')[2], 10)
            );
            if (nextDateObj <= actualDateObj) {
              const nextNext = getNextRecurringDate(nextDate, recurringType, iteration, startYear);
              if (nextNext) futureDate = nextNext;
            }
          }
          const [fy, fm, fd] = futureDate.split('.').map(Number);
          const futureDateObj = new Date(fy, fm - 1, fd);
          const futureDayOfWeek = futureDateObj.getDay();
          const shouldIgnore = ['매일', '주중', '주말'].includes(recurringType);
          if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend' && !shouldIgnore) {
            futureDate = adjustWeekendDate(futureDate, weekendOption);
          }
          const futureAmount = isInstallment ? Math.floor(expenseAmount / totalMonths) : expenseAmount;
          recordsToSave.push({
            ...baseRecord,
            id: generateRecordId(),
            amount: futureAmount,
            date: futureDate,
            timestamp: newTimestamp + iteration,
            isAutoGenerated: true,
            originalAmount: futureAmount,
            originalDate: futureDate,
          });
          currentDate = futureDate;
        }
      }

      await createExpensesBatch(recordsToSave, {
        creationCompletionRepeatCount: recordsToSave.length,
        simpleCreation: true,
      });
      await refreshWidgetWithCurrentMonth().catch(() => {});

      const challengeCategory = pending.category ?? '기타';
      const actualDateKey = actualDate.replace(/\./g, '-');
      const savedDate = new Date(
        parseInt(actualDate.split('.')[0], 10),
        parseInt(actualDate.split('.')[1], 10) - 1,
        parseInt(actualDate.split('.')[2], 10)
      );
      const monthStartDay = await loadMonthStartDay();
      const { year: targetYear, month: targetMonth } = getCustomMonthInfo(savedDate, monthStartDay);
      try {
        await AsyncStorage.setItem(
          'pendingCalendarTarget',
          JSON.stringify({ year: targetYear, month: targetMonth, targetDate: actualDateKey })
        );
        applyPendingCalendarTargetEvent.emit({ year: targetYear, month: targetMonth, targetDate: actualDateKey });
      } catch {
        // ignore
      }

      pendingRecordRef.current = null;
      setConfirmCardData(null);
      hideQuickInput();
      showToast('기록 생성이 완료되었습니다.');

      await refresh();
      calendarRefreshEvent.emit();
      if (challengeCategory) {
        const recordDateObj = new Date(actualDateKey);
        triggerChallengeNotifications(challengeCategory, recordDateObj).catch(() => {});
      }
      rescheduleDailyReminderIfNeeded().catch(() => {});
    } catch {
      showToast('기록 저장에 실패했습니다.');
    } finally {
      setIsQuickInputConfirmAdding(false);
      isConfirmAddInFlightRef.current = false;
    }
  }, [getPaymentSubtypesCached, hideQuickInput, isQuickInputConfirmAdding, refresh, showToast]);

  const handleConfirmCardCancel = useCallback(() => {
    void logEvent('btn', {
      screen_name: '/home',
      target: 'sentence-cardadd-cancel',
    });
    setConfirmCardData(null);
  }, []);

  useEffect(() => {
    if (!confirmCardData) {
      return;
    }
    void logEvent('component', {
      screen_name: '/home',
      target: 'sentence-cardadd',
    });
  }, [confirmCardData]);

  const handleCancel = useCallback(() => {
    setQuickInputText('');
  }, []);

  // 백드롭 딤 애니메이션
  useEffect(() => {
    RNAnimated.timing(quickInputBackdropOpacity, {
      toValue: isQuickInputVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isQuickInputVisible, quickInputBackdropOpacity]);

  useEffect(() => {
    if (isQuickInputVisible) {
      const timer = setTimeout(() => {
        quickInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isQuickInputVisible]);

  // 간편입력 체감 성능 개선: 자주 쓰는 데이터 사전 캐시
  useEffect(() => {
    void Promise.all([
      getExpenseCategoriesCached(),
      getIncomeCategoriesCached(),
      getPaymentSubtypesCached(),
    ]).catch(() => {
      // ignore preload failure
    });
  }, [getExpenseCategoriesCached, getIncomeCategoriesCached, getPaymentSubtypesCached]);

  // measureInWindow 타이밍/키보드 핸들러 레이스 대비: 오버레이 마운트 후 초기 위치 강화
  useEffect(() => {
    if (!isQuickInputVisible) return;
    const id = requestAnimationFrame(() => {
      const bottom = lastShortBottomRef.current;
      shortBottomFromScreen.value = bottom;
      animatedBottom.value = bottom;
    });
    return () => cancelAnimationFrame(id);
  }, [isQuickInputVisible]);

  /** 부모 starScale/starRotate → overlay 값 동기화. 오버레이는 overlay 값만 사용해 새로고침 크래시 방지 */
  useEffect(() => {
    if (!isQuickInputVisible) return;
    const refs = starRefs.current;
    if (!refs) return;
    const { starScale, starRotate } = refs;
    const subScale = starScale.addListener(({ value }) => overlayStarScale.setValue(value));
    const subRotate = starRotate.addListener(({ value }) => overlayStarRotate.setValue(value));
    return () => {
      try {
        starScale.removeListener(subScale);
      } catch {
        /* 부모 언마운트 시 무시 */
      }
      try {
        starRotate.removeListener(subRotate);
      } catch {
        /* 부모 언마운트 시 무시 */
      }
    };
  }, [isQuickInputVisible, overlayStarScale, overlayStarRotate]);

  // 언마운트 시 정리: 새로고침 등으로 Provider가 unmount될 때 크래시 방지
  useEffect(() => {
    return () => {
      starRefs.current = null;
      overlayStarScale.stopAnimation();
      overlayStarRotate.stopAnimation();
    };
  }, [overlayStarScale, overlayStarRotate]);

  const value = useMemo<QuickInputContextValue>(
    () => ({
      isQuickInputVisible,
      showQuickInput,
      hideQuickInput,
      quickInputText,
      setQuickInputText: setQuickInputTextTruncated,
    }),
    [isQuickInputVisible, showQuickInput, hideQuickInput, quickInputText, setQuickInputTextTruncated]
  );

  return (
    <QuickInputContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {isQuickInputVisible && (
          <View style={styles.overlay} pointerEvents="box-none">
              <RNAnimated.View
                pointerEvents="auto"
                style={[styles.backdrop, { opacity: quickInputBackdropOpacity }]}
              >
                <Pressable style={StyleSheet.absoluteFill} onPress={hideQuickInput} />
              </RNAnimated.View>
              {confirmCardData != null && (
                <View style={[styles.confirmCardContainer, { top: insets.top + 8 }]}>
                  <QuickInputConfirmCard
                    data={confirmCardData}
                    onConfirm={handleConfirmCardAdd}
                    onCancel={handleConfirmCardCancel}
                    addLoading={isQuickInputConfirmAdding}
                  />
                </View>
              )}
              <Animated.View style={[styles.container, containerAnimatedStyle]}>
                <QuickInputTipBox />
                <QuickInputField
                  ref={quickInputRef}
                  value={quickInputText}
                  onChangeText={setQuickInputTextTruncated}
                  placeholder={quickInputPlaceholder}
                  starScale={overlayStarScale}
                  starRotate={overlayStarRotate}
                  onSend={handleSend}
                  onCancel={handleCancel}
                  sendLoading={isQuickInputSendLoading}
                  sendDisabled={confirmCardData != null}
                />
              </Animated.View>
            </View>
        )}
      </View>
    </QuickInputContext.Provider>
  );
};

export const useQuickInputContext = (): QuickInputContextValue => {
  const context = useContext(QuickInputContext);
  if (!context) {
    throw new Error('useQuickInputContext must be used within QuickInputProvider');
  }
  return context;
};

export { FAB_OFFSET_ABOVE_TABS };

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  confirmCardContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 102,
  },
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 101,
    /** TIP 박스 ↔ 롱버전 입력창 간격 */
    gap: 12,
  },
});
