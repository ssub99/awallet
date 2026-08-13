/**
 * Quick Input Context
 *
 * 간편입력 오버레이를 탭바 바깥(전체 화면) 레벨에서 렌더링하여
 * 키보드와 동일한 좌표계를 사용하도록 함.
 *
 * iOS: max(키보드+gap, 앵커) + 단조 상승·peak 스파이크 필터.
 * Android: ADJUST_NOTHING(탭바 고정) + controller onMove 추적, metrics는 보조 max.
 */

import { QuickInputConfirmCard, type QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';
import { QuickInputField } from '@/components/ui/quick-input-field';
import { QuickInputTipBox } from '@/components/ui/quick-input-tip-box';
import { PARSE_EXPENSE_API_URL } from '@/constants/api';
import { getRandomQuickInputPlaceholder } from '@/constants/quick-input-placeholders';
import { useAppData } from '@/contexts/app-data-context';
import { useToast } from '@/contexts/toast-context';
import { calendarRefreshEvent, publishCalendarTarget } from '@/hooks/calendar-events';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { getApiSecurityHeaders } from '@/utils/api-security-headers';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import { loadCategories } from '@/utils/categories';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import {
    addCalendarMonths,
    adjustWeekendDate,
    calculateRecurringIterations,
    getActualDayForMonth,
    getDayOfWeekLabel,
    getNextRecurringDate,
    getRecurringWeekendOptionDisplayLabel,
} from '@/utils/expense-calculations';
import { createExpensesBatch, type ExpenseRecord, type PaymentMethod } from '@/utils/expenses';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import { createIncome, type IncomeRecord } from '@/utils/incomes';
import { rescheduleDailyReminderIfNeeded } from '@/utils/notification-scheduler';
import { resolveRelativeWeekdayDateFromMessage } from '@/utils/parse-expense-relative-date';
import {
    hasIncomeHintInMessage,
    reviewDates,
    reviewMemoRuleFallback,
    reviewRecordTypeAndSeries,
} from '@/utils/parse-expense-reviews';
import { getDefaultSubtypeIdByMethod, loadPaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import {
    keyboardMetricsToEndCoordinates,
    QUICK_INPUT_KEYBOARD_GAP,
    resolveIosQuickInputBottomAboveAnchor,
    resolveQuickInputBottomAboveKeyboard,
} from '@/utils/quick-input-keyboard-position';
import {
  beginQuickInputRecordEdit,
} from '@/utils/quick-input-expense-draft-bridge';
import {
  EXPENSE_RECORD_QUICK_INPUT_DRAFT_ROUTE_PARAMS,
} from '@/utils/expense-record-creation-mode';
import type { QuickInputPendingRecord } from '@/utils/quick-input-pending-record';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import {
  AppState,
  BackHandler,
  Keyboard,
  Platform,
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  View,
  type AppStateStatus,
  type KeyboardEvent,
  type TextInput,
} from 'react-native';
import {
    AndroidSoftInputModes,
    KeyboardController,
    useGenericKeyboardHandler,
    useKeyboardContext,
} from 'react-native-keyboard-controller';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AnimatedValue = RNAnimated.Value;

const FAB_OFFSET_ABOVE_TABS = 16;

export type ShowQuickInputOptions = {
  /** 기본 true. false면 롱 입력·키패드 자동 오픈 없음 */
  autoFocus?: boolean;
};

export type HideQuickInputOptions = {
  /** true: 숏 전환·키보드 대기 없이 키보드 dismiss와 오버레이를 동시에 제거 (Android 백 등) */
  simultaneous?: boolean;
};

interface QuickInputContextValue {
  isQuickInputVisible: boolean;
  /** 롱(팁+입력) 노출 중 */
  isQuickInputContentVisible: boolean;
  /** 롱 닫힘과 동시에 숏 표시 여부 (홈 z-index는 앵커 기본값 = 키패드 뒤) */
  isQuickInputShortVisible: boolean;
  showQuickInput: (
    starScale: AnimatedValue,
    starRotate: AnimatedValue,
    shortBottomFromScreen?: number,
    options?: ShowQuickInputOptions
  ) => void;
  hideQuickInput: (options?: HideQuickInputOptions) => void;
  quickInputText: string;
  setQuickInputText: (text: string) => void;
}

const QuickInputContext = createContext<QuickInputContextValue | undefined>(undefined);

const KEYBOARD_GAP = QUICK_INPUT_KEYBOARD_GAP;

function applyIosQuickInputKeyboardFollow(
  animatedBottom: { value: number },
  shortBottomFromScreen: { value: number },
  iosKeyboardHeightPrev: { value: number },
  iosKeyboardPeakHeight: { value: number },
  keyboardHeight: number,
): void {
  'worklet';
  const { bottom, nextPeakKeyboardHeight, nextPreviousHeight } =
    resolveIosQuickInputBottomAboveAnchor(
      keyboardHeight,
      shortBottomFromScreen.value,
      animatedBottom.value,
      iosKeyboardHeightPrev.value,
      iosKeyboardPeakHeight.value,
      KEYBOARD_GAP,
    );
  animatedBottom.value = bottom;
  iosKeyboardPeakHeight.value = nextPeakKeyboardHeight;
  iosKeyboardHeightPrev.value = nextPreviousHeight;
}

/**
 * Android: keyboard-controller IME height → bottom.
 * 열림 애니 중 height 333→14→333 스파이크 시 UI가 내려가지 않도록 단조 상승만 허용.
 */
function applyAndroidQuickInputControllerBottom(
  animatedBottom: { value: number },
  keyboardHeight: number,
  gap: number,
): void {
  'worklet';
  if (!Number.isFinite(keyboardHeight) || keyboardHeight <= 0) {
    return;
  }
  const next = keyboardHeight + gap;
  if (next > animatedBottom.value) {
    animatedBottom.value = next;
  }
}

function readAndroidControllerKeyboardHeight(raw: number): number {
  if (!Number.isFinite(raw) || raw === 0) {
    return 0;
  }
  return Math.abs(raw);
}

/**
 * Android edge-to-edge + adjustResize 시 탭바·캘린더가 키보드와 함께 올라가는 것을 막음.
 * 오버레이 위치는 useKeyboardHandler로 따로 맞춤 (app.json pan만으로는 부족할 수 있음).
 */
function applyAndroidQuickInputKeyboardMode(): void {
  if (Platform.OS !== 'android') return;
  KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
}

function restoreAndroidQuickInputKeyboardMode(): void {
  if (Platform.OS !== 'android') return;
  KeyboardController.setDefaultMode();
}

/** 토큰 비용 절감: 메시지 최대 길이(자). 초과 시 요청 거부 */
const MAX_MESSAGE_LENGTH = 100;
/** 토큰 비용 절감: 호출 간격 제한 (ms). 이 시간 내 최대 RATE_LIMIT_MAX_REQUESTS회만 허용 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
/** 토큰 비용 절감: 비기록 연속 N회 시 API 호출 잠금 */
const NON_RECORD_LOCK_THRESHOLD = 3;
const NON_RECORD_LOCK_MS = 30_000;

/** parse-expense API가 반환하는 기록 한 건 (확인 카드·기록 생성용) */
type PendingParseRecord = QuickInputPendingRecord;

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

function hasExplicitSubtypeRequest(
  subtypes: PaymentSubtype[],
  message: string,
): boolean {
  const normalizedMessage = normalizePaymentSubtypeText(message);
  if (!normalizedMessage) {
    return false;
  }

  for (const { label } of subtypes) {
    if (!label?.trim()) {
      continue;
    }
    const normalizedLabel = normalizePaymentSubtypeText(label);
    // 명시적으로 카드 서브유형명을 언급한 경우만 true.
    // stem/부분 일치까지 허용하면 일반 문장에서 오인식이 발생할 수 있다.
    if (normalizedLabel.length >= 3 && normalizedMessage.includes(normalizedLabel)) {
      return true;
    }
  }

  return false;
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

/**
 * API 응답 1건에 규칙 보정 SSOT 적용 (타입·시리즈·날짜·메모 규칙 fallback).
 * 서버가 이미 적용했어도 idempotent. Simple 경로는 서버 리뷰를 건너뛰므로 클라이언트에서도 동일 유틸 사용.
 */
function applyParseExpenseReviews(
  raw: PendingParseRecord,
  message: string,
  today: string,
): PendingParseRecord {
  const record = normalizePendingRecord(raw);
  const withTypeSeries = reviewRecordTypeAndSeries(message, record);
  const withDates = reviewDates(message, today, withTypeSeries);
  return normalizePendingRecord(reviewMemoRuleFallback(message, withDates));
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

async function buildConfirmCardFromPending(
  pending: PendingParseRecord,
  deps: {
    getExpenseCategoriesCached: () => Promise<{ label: string; emoji: string }[]>;
    getIncomeCategoriesCached: () => Promise<{ label: string; emoji: string }[]>;
    getPaymentSubtypesCached: () => Promise<PaymentSubtype[]>;
  },
): Promise<QuickInputConfirmCardData> {
  const categoryList = await deps.getExpenseCategoriesCached();
  const incomeCategoryList = await deps.getIncomeCategoriesCached();
  const paymentSubtypes = await deps.getPaymentSubtypesCached();
  const parsedAmount = Number(pending.amount);
  const categoryLabel = pending.category ?? '기타';
  const matchedCategory = categoryList.find((c) => c.label === categoryLabel);
  const matchedIncomeCategory = incomeCategoryList.find((c) => c.label === categoryLabel);
  const defaultCreditSubtype = paymentSubtypes.find(
    (item) => item.id === getDefaultSubtypeIdByMethod('credit', paymentSubtypes),
  );
  const fallbackSubtypeLabel = paymentMethodToLabel(pending.paymentMethod);
  const inferredSubtypeLabel = pending.paymentSubtypeLabel?.trim();
  const paymentTypeLabel =
    pending.paymentMethod === 'cash' ? '현금' : inferredSubtypeLabel || fallbackSubtypeLabel;
  const paymentTypeColor =
    pending.paymentMethod === 'cash'
      ? undefined
      : (pending.paymentSubtypeColor ?? defaultCreditSubtype?.color);

  return {
    recordType: pending.recordType,
    category: categoryLabel,
    categoryEmoji: (matchedIncomeCategory?.emoji ?? matchedCategory?.emoji) || undefined,
    date: formatDateDisplay(pending.date),
    amount: formatAmount(parsedAmount),
    paymentType: pending.recordType === 'income' ? undefined : paymentTypeLabel,
    paymentTypeColor: pending.recordType === 'income' ? undefined : paymentTypeColor,
    paymentTypeEmoji: pending.recordType === 'income' ? undefined : pending.paymentMethod === 'cash' ? '💰' : undefined,
    memo: pending.memo,
    repeatOption1: pending.recordType === 'income' ? undefined : getRepeatOption1(pending),
    repeatOption2: pending.recordType === 'income' ? undefined : getRepeatOption2(pending),
    repeatOption3: pending.recordType === 'income' ? undefined : getRepeatOption3(pending),
  };
}

export const QuickInputProvider = ({ children }: PropsWithChildren) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useAppData();
  const [isQuickInputVisible, setIsQuickInputVisible] = useState(false);
  /** 닫을 때 팁·입력만 즉시 숨김(키보드는 이후 dismiss) */
  const [isQuickInputContentVisible, setIsQuickInputContentVisible] = useState(false);
  const [isQuickInputShortVisible, setIsQuickInputShortVisible] = useState(false);
  const [quickInputText, setQuickInputText] = useState('');
  const [quickInputPlaceholder, setQuickInputPlaceholder] = useState(getRandomQuickInputPlaceholder);
  const [confirmCardData, setConfirmCardData] = useState<QuickInputConfirmCardData | null>(null);
  const [isQuickInputSendLoading, setIsQuickInputSendLoading] = useState(false);
  const [isQuickInputConfirmAdding, setIsQuickInputConfirmAdding] = useState(false);
  /** 소비 기록 생성(변경) 화면 진입 중 오버레이 숨김 */
  const [isQuickInputOverlaySuppressed, setIsQuickInputOverlaySuppressed] = useState(false);
  const shortBottomFromScreen = useSharedValue(KEYBOARD_GAP);
  const animatedBottom = useSharedValue(KEYBOARD_GAP);
  const shouldFollowKeyboard = useSharedValue(false);
  /** iOS: 직전 키보드 height — 닫힘 추적 */
  const iosKeyboardHeightPrev = useSharedValue(0);
  /** iOS: 이번 키보드 세션 peak height — 첫 IME 역방향 스파이크 필터 */
  const iosKeyboardPeakHeight = useSharedValue(0);
  const shouldFollowKeyboardRef = useRef(false);
  const lastShortBottomRef = useRef<number>(KEYBOARD_GAP);
  const pendingAutoFocusRef = useRef(false);
  const pendingRecordRef = useRef<PendingParseRecord | null>(null);
  /** 토큰 비용 절감: 최근 요청 시각 목록 (rate limit용) */
  const rateLimitTimestampsRef = useRef<number[]>([]);
  /** 토큰 비용 절감: 비기록 연속 횟수, 잠금 해제 시각 */
  const nonRecordCountRef = useRef(0);
  const lockEndTimeRef = useRef<number>(0);
  /** 간헐적 중복 탭/중복 실행 방지용 in-flight lock */
  const isConfirmAddInFlightRef = useRef(false);
  /** 닫기 중: UI를 키보드와 함께 내린 뒤 언마운트 */
  const isClosingRef = useRef(false);
  const hideFinishTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidKeyboardSyncRafRef = useRef<number | null>(null);
  /** Android: controller만으로 bottom이 내려가며 깜빡이는 것 방지 */
  const lastAndroidBottomRef = useRef(0);
  const isQuickInputVisibleRef = useRef(false);
  const androidKeyboardWasVisibleRef = useRef(false);
  const hideQuickInputRef = useRef<(options?: HideQuickInputOptions) => void>(() => {});

  const quickInputRef = useRef<TextInput>(null);
  const paymentSubtypesCacheRef = useRef<PaymentSubtype[]>([]);
  const expenseCategoriesCacheRef = useRef<{ label: string; emoji: string }[]>([]);
  const incomeCategoriesCacheRef = useRef<{ label: string; emoji: string }[]>([]);
  const quickInputBackdropOpacity = useRef(new RNAnimated.Value(0)).current;
  /** 롱·팁: React 커밋 전에도 즉시 숨김 (딤 페이드와 분리) */
  const quickInputLongOpacity = useRef(new RNAnimated.Value(1)).current;
  /** 숏/롱 동일 애니메이션: 부모 starScale/starRotate 공유. 새로고침 시 크래시 방지를 위해 fallback 보유 */
  const starRefs = useRef<{ starScale: AnimatedValue; starRotate: AnimatedValue } | null>(null);
  const overlayStarScale = useRef(new RNAnimated.Value(1)).current;
  const overlayStarRotate = useRef(new RNAnimated.Value(0)).current;
  const { reanimated: keyboardReanimated } = useKeyboardContext();
  const navigationInsetBottomRef = useRef(insets.bottom);

  useEffect(() => {
    navigationInsetBottomRef.current = insets.bottom;
  }, [insets.bottom]);

  useEffect(() => {
    isQuickInputVisibleRef.current = isQuickInputVisible;
  }, [isQuickInputVisible]);

  const markAndroidKeyboardVisible = useCallback(() => {
    androidKeyboardWasVisibleRef.current = true;
  }, []);

  /** Android: IME가 백을 먼저 먹어 키보드만 내려갈 때 간편입력도 즉시 닫기 */
  const handleAndroidKeyboardDismissed = useCallback(() => {
    if (!isQuickInputVisibleRef.current || isClosingRef.current) {
      return;
    }
    if (!shouldFollowKeyboardRef.current || !androidKeyboardWasVisibleRef.current) {
      return;
    }
    androidKeyboardWasVisibleRef.current = false;
    hideQuickInputRef.current({ simultaneous: true });
  }, []);

  const syncAndroidHandlerBottom = useCallback((bottom: number) => {
    lastAndroidBottomRef.current = Math.max(lastAndroidBottomRef.current, bottom);
  }, []);

  const applyAndroidKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const nativeHeight = readAndroidControllerKeyboardHeight(keyboardReanimated.height.value);
      const fromController =
        nativeHeight > 0 ? nativeHeight + QUICK_INPUT_KEYBOARD_GAP : 0;

      let target = resolveQuickInputBottomAboveKeyboard(
        endCoordinates,
        navigationInsetBottomRef.current,
        nativeHeight,
      );

      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        const fromMetrics = resolveQuickInputBottomAboveKeyboard(
          keyboardMetricsToEndCoordinates(metrics),
          navigationInsetBottomRef.current,
          nativeHeight,
        );
        target = Math.max(target, fromMetrics);
      }
      target = Math.max(target, fromController, animatedBottom.value);

      const previousBottom = lastAndroidBottomRef.current;
      if (target <= previousBottom + 1 && previousBottom > 0) {
        return;
      }

      lastAndroidBottomRef.current = Math.max(previousBottom, target);
      animatedBottom.value = target;
    },
    [animatedBottom, keyboardReanimated]
  );

  /** 삼성 툴바/추천 on·off: controller height + Keyboard.metrics screenY 동기화 */
  const cancelAndroidKeyboardSync = useCallback(() => {
    if (androidKeyboardSyncRafRef.current != null) {
      cancelAnimationFrame(androidKeyboardSyncRafRef.current);
      androidKeyboardSyncRafRef.current = null;
    }
  }, []);

  const scheduleAndroidKeyboardSync = useCallback(() => {
    if (Platform.OS !== 'android' || !shouldFollowKeyboardRef.current) {
      return;
    }
    if (androidKeyboardSyncRafRef.current != null) {
      cancelAnimationFrame(androidKeyboardSyncRafRef.current);
    }
    androidKeyboardSyncRafRef.current = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        androidKeyboardSyncRafRef.current = null;
        if (!shouldFollowKeyboardRef.current) {
          return;
        }
        const metrics = Keyboard.metrics();
        if (metrics && metrics.height > 0) {
          applyAndroidKeyboardGeometry(keyboardMetricsToEndCoordinates(metrics));
        }
      });
    });
  }, [applyAndroidKeyboardGeometry]);

  const setShouldFollowKeyboard = useCallback(
    (follow: boolean) => {
      shouldFollowKeyboardRef.current = follow;
      shouldFollowKeyboard.value = follow;
    },
    [shouldFollowKeyboard]
  );

  useGenericKeyboardHandler(
    {
      onStart: (event) => {
        'worklet';
        if (!shouldFollowKeyboard.value) {
          animatedBottom.value = shortBottomFromScreen.value;
          return;
        }
        const keyboardHeight = Number.isFinite(event.height) ? event.height : 0;
        if (Platform.OS === 'android') {
          if (keyboardHeight > 0) {
            // onStart는 종종 최종 IME 높이를 먼저 줌 → UI만 먼저 올라감. 위치는 onMove/onEnd만.
            runOnJS(markAndroidKeyboardVisible)();
          } else {
            runOnJS(handleAndroidKeyboardDismissed)();
          }
          return;
        }

        if (keyboardHeight <= 0) {
          animatedBottom.value = shortBottomFromScreen.value;
          iosKeyboardHeightPrev.value = 0;
          iosKeyboardPeakHeight.value = 0;
          return;
        }
        applyIosQuickInputKeyboardFollow(
          animatedBottom,
          shortBottomFromScreen,
          iosKeyboardHeightPrev,
          iosKeyboardPeakHeight,
          keyboardHeight,
        );
      },
      onMove: (event) => {
        'worklet';
        if (!shouldFollowKeyboard.value) {
          return;
        }
        const keyboardHeight = Number.isFinite(event.height) ? event.height : 0;
        if (keyboardHeight <= 0) {
          return;
        }

        if (Platform.OS === 'android') {
          applyAndroidQuickInputControllerBottom(animatedBottom, keyboardHeight, KEYBOARD_GAP);
          runOnJS(syncAndroidHandlerBottom)(keyboardHeight + KEYBOARD_GAP);
          runOnJS(markAndroidKeyboardVisible)();
          return;
        }

        applyIosQuickInputKeyboardFollow(
          animatedBottom,
          shortBottomFromScreen,
          iosKeyboardHeightPrev,
          iosKeyboardPeakHeight,
          keyboardHeight,
        );
      },
      onEnd: (event) => {
        'worklet';
        if (!shouldFollowKeyboard.value) {
          animatedBottom.value = shortBottomFromScreen.value;
          return;
        }
        const keyboardHeight = Number.isFinite(event.height) ? event.height : 0;

        if (Platform.OS === 'android') {
          if (keyboardHeight > 0) {
            applyAndroidQuickInputControllerBottom(animatedBottom, keyboardHeight, KEYBOARD_GAP);
            runOnJS(syncAndroidHandlerBottom)(keyboardHeight + KEYBOARD_GAP);
            runOnJS(scheduleAndroidKeyboardSync)();
            runOnJS(markAndroidKeyboardVisible)();
          } else {
            animatedBottom.value = shortBottomFromScreen.value;
            runOnJS(handleAndroidKeyboardDismissed)();
          }
          return;
        }

        if (keyboardHeight <= 0) {
          animatedBottom.value = shortBottomFromScreen.value;
          iosKeyboardHeightPrev.value = 0;
          iosKeyboardPeakHeight.value = 0;
          return;
        }
        applyIosQuickInputKeyboardFollow(
          animatedBottom,
          shortBottomFromScreen,
          iosKeyboardHeightPrev,
          iosKeyboardPeakHeight,
          keyboardHeight,
        );
      },
      onInteractive: (event) => {
        'worklet';
        if (!shouldFollowKeyboard.value || Platform.OS !== 'ios') {
          return;
        }
        const keyboardHeight = Number.isFinite(event.height) ? event.height : 0;
        if (keyboardHeight <= 0) {
          animatedBottom.value = shortBottomFromScreen.value;
          iosKeyboardHeightPrev.value = 0;
          iosKeyboardPeakHeight.value = 0;
          return;
        }
        applyIosQuickInputKeyboardFollow(
          animatedBottom,
          shortBottomFromScreen,
          iosKeyboardHeightPrev,
          iosKeyboardPeakHeight,
          keyboardHeight,
        );
      },
    },
    [handleAndroidKeyboardDismissed, markAndroidKeyboardVisible, scheduleAndroidKeyboardSync, syncAndroidHandlerBottom]
  );

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const shortBottom = shortBottomFromScreen.value;

    if (!shouldFollowKeyboard.value) {
      return { bottom: shortBottom };
    }

    return { bottom: animatedBottom.value };
  });

  const showQuickInput = useCallback(
    (starScale: AnimatedValue, starRotate: AnimatedValue, shortBottom?: number, options?: ShowQuickInputOptions) => {
      if (!isAtLeastVersion(Constants.expoConfig?.version, QUICK_INPUT_MIN_VERSION)) return;
      isClosingRef.current = false;
      androidKeyboardWasVisibleRef.current = false;
      if (hideFinishTimeoutRef.current != null) {
        clearTimeout(hideFinishTimeoutRef.current);
        hideFinishTimeoutRef.current = null;
      }
      const autoFocus = options?.autoFocus ?? true;
      pendingAutoFocusRef.current = autoFocus;
      setShouldFollowKeyboard(autoFocus);
      starRefs.current = { starScale, starRotate };
      const bottom =
        typeof shortBottom === 'number' && Number.isFinite(shortBottom)
          ? Math.max(KEYBOARD_GAP, shortBottom)
          : KEYBOARD_GAP;
      lastShortBottomRef.current = bottom;
      lastAndroidBottomRef.current = 0;
      iosKeyboardHeightPrev.value = 0;
      iosKeyboardPeakHeight.value = 0;
      shortBottomFromScreen.value = bottom;
      animatedBottom.value = bottom;
      applyAndroidQuickInputKeyboardMode();
      setQuickInputPlaceholder(getRandomQuickInputPlaceholder());
      quickInputLongOpacity.setValue(1);
      setIsQuickInputShortVisible(false);
      setIsQuickInputContentVisible(true);
      setIsQuickInputVisible(true);
    },
    [animatedBottom, iosKeyboardHeightPrev, iosKeyboardPeakHeight, setShouldFollowKeyboard, shortBottomFromScreen]
  );

  const handleQuickInputFieldFocus = useCallback(() => {
    setShouldFollowKeyboard(true);
  }, [setShouldFollowKeyboard]);

  const setQuickInputTextTruncated = useCallback((text: string) => {
    setQuickInputText(text.slice(0, MAX_MESSAGE_LENGTH));
  }, []);

  const finishHideQuickInput = useCallback(() => {
    if (hideFinishTimeoutRef.current != null) {
      clearTimeout(hideFinishTimeoutRef.current);
      hideFinishTimeoutRef.current = null;
    }
    if (!isClosingRef.current) {
      return;
    }
    // 4) 오버레이 정리 (숏은 3단계에서 이미 표시됨)
    isClosingRef.current = false;
    cancelAndroidKeyboardSync();
    lastAndroidBottomRef.current = 0;
    iosKeyboardHeightPrev.value = 0;
    iosKeyboardPeakHeight.value = 0;
    restoreAndroidQuickInputKeyboardMode();
    setShouldFollowKeyboard(false);
    pendingAutoFocusRef.current = false;
    overlayStarScale.stopAnimation();
    overlayStarRotate.stopAnimation();
    starRefs.current = null;
    setIsQuickInputVisible(false);
    setIsQuickInputContentVisible(false);
    setIsQuickInputShortVisible(false);
    setQuickInputText('');
    setConfirmCardData(null);
    pendingRecordRef.current = null;
    setIsQuickInputSendLoading(false);
    setIsQuickInputConfirmAdding(false);
  }, [cancelAndroidKeyboardSync, overlayStarScale, overlayStarRotate, setShouldFollowKeyboard]);

  const hideQuickInput = useCallback((options?: HideQuickInputOptions) => {
    if (isClosingRef.current || !isQuickInputVisible) {
      return;
    }
    isClosingRef.current = true;
    pendingAutoFocusRef.current = false;
    setShouldFollowKeyboard(false);
    quickInputRef.current?.blur();

    if (options?.simultaneous) {
      if (hideFinishTimeoutRef.current != null) {
        clearTimeout(hideFinishTimeoutRef.current);
        hideFinishTimeoutRef.current = null;
      }
      cancelAndroidKeyboardSync();
      animatedBottom.value = shortBottomFromScreen.value;
      iosKeyboardHeightPrev.value = 0;
      iosKeyboardPeakHeight.value = 0;
      quickInputLongOpacity.setValue(0);
      quickInputBackdropOpacity.setValue(0);
      setIsQuickInputShortVisible(false);
      setIsQuickInputContentVisible(false);
      finishHideQuickInput();
      if (Platform.OS === 'android') {
        void KeyboardController.dismiss();
      } else {
        Keyboard.dismiss();
      }
      return;
    }

    Keyboard.dismiss();

    // 1) 즉시 — 숏 표시(키패드 뒤) 후 단계적 페이드
    setIsQuickInputShortVisible(true);

    const metrics = Keyboard.metrics();
    const keyboardVisible = metrics != null && metrics.height > 0;

    const hideLongAndDimFade = () => {
      // 2) rAF — 딤 페이드 + 롱·팁 제거
      quickInputLongOpacity.setValue(0);
      setIsQuickInputContentVisible(false);
      RNAnimated.timing(quickInputBackdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    };

    requestAnimationFrame(() => {
      hideLongAndDimFade();

      // 4) 오버레이 정리
      if (!keyboardVisible) {
        hideFinishTimeoutRef.current = setTimeout(() => {
          finishHideQuickInput();
        }, 220);
        return;
      }
      hideFinishTimeoutRef.current = setTimeout(() => {
        finishHideQuickInput();
      }, 600);
    });
  }, [
    animatedBottom,
    cancelAndroidKeyboardSync,
    finishHideQuickInput,
    isQuickInputVisible,
    quickInputBackdropOpacity,
    quickInputLongOpacity,
    setShouldFollowKeyboard,
    shortBottomFromScreen,
  ]);

  hideQuickInputRef.current = hideQuickInput;

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
      const first = applyParseExpenseReviews(records[0], message, today);
      const paymentSubtypes = await paymentSubtypesPromise;
      const isIncomeRecord = first.recordType === 'income' || hasIncomeHintInMessage(message);
      const shouldApplyExplicitSubtype =
        !isIncomeRecord &&
        hasExplicitSubtypeRequest(paymentSubtypes, message);
      const matchedSubtypeForFirst =
        shouldApplyExplicitSubtype
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
      const normalizedFirst: PendingParseRecord = {
        ...first,
        recordType: isIncomeRecord ? 'income' : 'expense',
        paymentMethod: isIncomeRecord ? undefined : resolvedPaymentMethod,
        paymentSubtypeId: isIncomeRecord ? undefined : matchedSubtypeForFirst?.id,
        paymentSubtypeColor: isIncomeRecord ? undefined : matchedSubtypeForFirst?.color,
        paymentSubtypeLabel:
          isIncomeRecord || resolvedPaymentMethod === 'cash'
            ? undefined
            : matchedSubtypeForFirst?.label ??
              (shouldApplyExplicitSubtype ? first.paymentSubtypeLabel : undefined) ??
              defaultCreditSubtype?.label,
        isRecurring: isIncomeRecord ? undefined : first.isRecurring,
        isInstallment: isIncomeRecord ? undefined : first.isInstallment,
        recurringType: isIncomeRecord ? undefined : first.recurringType,
        totalMonths: isIncomeRecord ? undefined : first.totalMonths,
        weekendOption: isIncomeRecord ? undefined : first.weekendOption,
      };
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
        memo: normalizedFirst.memo,
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
        const actualDateKey = actualDate.replace(/\./g, '-');
        const savedDate = new Date(
          parseInt(actualDate.split('.')[0], 10),
          parseInt(actualDate.split('.')[1], 10) - 1,
          parseInt(actualDate.split('.')[2], 10)
        );
        const monthStartDay = await loadMonthStartDay();
        const { year: targetYear, month: targetMonth } = getCustomMonthInfo(savedDate, monthStartDay);
        publishCalendarTarget({
          year: targetYear,
          month: targetMonth,
          targetDate: actualDateKey,
        });
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
          const shifted = addCalendarMonths(yearNum, monthNum, i);
          let futureYear = shifted.year;
          let futureMonth = shifted.month;
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
        const [, , seriesAnchorDay] = dateStr.split('.').map(Number);
        for (let iteration = 1; iteration < iterations; iteration++) {
          const nextDate = getNextRecurringDate(
            currentDate,
            recurringType,
            iteration,
            startYear,
            seriesAnchorDay,
          );
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
              const nextNext = getNextRecurringDate(
                nextDate,
                recurringType,
                iteration,
                startYear,
                seriesAnchorDay,
              );
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
      publishCalendarTarget({
        year: targetYear,
        month: targetMonth,
        targetDate: actualDateKey,
      });

      pendingRecordRef.current = null;
      setConfirmCardData(null);
      hideQuickInput();
      showToast('기록 생성이 완료되었습니다.');

      await refresh();
      calendarRefreshEvent.emit();
      if (challengeCategory) {
        const recordDateObj = new Date(actualDateKey);
        await triggerChallengeNotifications(challengeCategory, recordDateObj).catch((error) => {
          console.error('[quick-input] Failed to trigger challenge notifications:', error);
        });
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
    pendingRecordRef.current = null;
    setConfirmCardData(null);
  }, []);

  const handleConfirmCardChange = useCallback(() => {
    void logEvent('btn', {
      screen_name: '/home',
      target: 'sentence-cardadd-modify',
    });
    const pending = pendingRecordRef.current;
    if (!pending) {
      return;
    }

    const isIncome = pending.recordType === 'income';
    Keyboard.dismiss();
    beginQuickInputRecordEdit(pending, {
      onComplete: (updated) => {
        pendingRecordRef.current = updated;
        void buildConfirmCardFromPending(updated, {
          getExpenseCategoriesCached,
          getIncomeCategoriesCached,
          getPaymentSubtypesCached,
        })
          .then((card) => {
            setConfirmCardData(card);
            setIsQuickInputOverlaySuppressed(false);
            setIsQuickInputContentVisible(true);
          })
          .catch(() => {
            setIsQuickInputOverlaySuppressed(false);
            setIsQuickInputContentVisible(true);
          });
      },
      onCancel: () => {
        setIsQuickInputOverlaySuppressed(false);
        setIsQuickInputContentVisible(true);
      },
    });
    setIsQuickInputOverlaySuppressed(true);
    router.push({
      pathname: isIncome ? '/income-record' : '/expense-record',
      params: isIncome
        ? { quickInputDraft: '1' }
        : EXPENSE_RECORD_QUICK_INPUT_DRAFT_ROUTE_PARAMS,
    });
  }, [
    getExpenseCategoriesCached,
    getIncomeCategoriesCached,
    getPaymentSubtypesCached,
    router,
  ]);

  useEffect(() => {
    if (!confirmCardData) {
      return;
    }
    void logEvent('component', {
      screen_name: '/home',
      target: 'sentence-cardadd',
    });
  }, [confirmCardData]);

  /** Android 하드웨어 뒤로가기: 시스템 키보드 + 간편입력 오버레이 함께 닫기 */
  useEffect(() => {
    if (Platform.OS !== 'android' || !isQuickInputVisible) {
      return;
    }

    const onBackPress = () => {
      hideQuickInput({ simultaneous: true });
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [hideQuickInput, isQuickInputVisible]);

  const handleCancel = useCallback(() => {
    setQuickInputText('');
  }, []);

  // 백드롭 딤 애니메이션 (닫기 중에는 hideQuickInput에서 페이드 처리)
  useEffect(() => {
    if (isClosingRef.current) {
      return;
    }
    RNAnimated.timing(quickInputBackdropOpacity, {
      toValue: isQuickInputVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isQuickInputVisible, quickInputBackdropOpacity]);

  // iOS: 키패드 애니메이션 종료 후 오버레이만 정리
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const onHide = Keyboard.addListener('keyboardDidHide', () => {
        if (isClosingRef.current) {
          finishHideQuickInput();
        }
      });
      return () => onHide.remove();
    }
    return undefined;
  }, [finishHideQuickInput]);

  useEffect(() => {
    if (!isQuickInputVisible || !pendingAutoFocusRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      quickInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [isQuickInputVisible]);

  /**
   * Android ADJUST_NOTHING: generic handler·resize 없이도 IME 추적.
   * 1) keyboard-controller reanimated.height (useAnimatedStyle)
   * 2) RN Keyboard didShow / didChangeFrame (JS fallback)
   */
  useEffect(() => {
    if (Platform.OS !== 'android' || !isQuickInputVisible) {
      return;
    }

    const syncFromMetrics = () => {
      if (!shouldFollowKeyboardRef.current) {
        return;
      }
      // 열림 중 metrics 스냅 방지 — onMove로 이미 올라온 뒤(툴바 등)만 보조
      if (lastAndroidBottomRef.current <= KEYBOARD_GAP + 8) {
        return;
      }
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        applyAndroidKeyboardGeometry(keyboardMetricsToEndCoordinates(metrics));
      }
    };

    const onShow = Keyboard.addListener('keyboardDidShow', () => {
      if (!shouldFollowKeyboardRef.current) {
        return;
      }
      androidKeyboardWasVisibleRef.current = true;
      // RN metrics는 종종 최종 높이를 즉시 반환 → 열림 중 위치는 controller onMove만 사용
    });

    const onFrame = Keyboard.addListener('keyboardDidChangeFrame', (event) => {
      if (!shouldFollowKeyboardRef.current || event.endCoordinates.height <= 0) {
        return;
      }
      // 툴바·추천행 등 열린 뒤 IME 높이 변화만 보조 (이미 올라온 뒤)
      if (lastAndroidBottomRef.current > KEYBOARD_GAP + 8) {
        applyAndroidKeyboardGeometry(event.endCoordinates);
      }
    });

    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      if (isClosingRef.current) {
        finishHideQuickInput();
        return;
      }
      if (isQuickInputVisibleRef.current) {
        handleAndroidKeyboardDismissed();
        return;
      }
      if (!shouldFollowKeyboardRef.current) {
        return;
      }
      animatedBottom.value = shortBottomFromScreen.value;
    });

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === 'active') {
        navigationInsetBottomRef.current = insets.bottom;
        syncFromMetrics();
      }
    };

    const appStateSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      onShow.remove();
      onFrame.remove();
      onHide.remove();
      appStateSub.remove();
    };
  }, [
    animatedBottom,
    applyAndroidKeyboardGeometry,
    finishHideQuickInput,
    handleAndroidKeyboardDismissed,
    insets.bottom,
    isQuickInputVisible,
    scheduleAndroidKeyboardSync,
    shortBottomFromScreen,
  ]);

  useEffect(() => {
    return () => cancelAndroidKeyboardSync();
  }, [cancelAndroidKeyboardSync]);

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
      restoreAndroidQuickInputKeyboardMode();
      starRefs.current = null;
      overlayStarScale.stopAnimation();
      overlayStarRotate.stopAnimation();
    };
  }, [overlayStarScale, overlayStarRotate]);

  const value = useMemo<QuickInputContextValue>(
    () => ({
      isQuickInputVisible,
      isQuickInputContentVisible,
      isQuickInputShortVisible,
      showQuickInput,
      hideQuickInput,
      quickInputText,
      setQuickInputText: setQuickInputTextTruncated,
    }),
    [
      isQuickInputContentVisible,
      isQuickInputShortVisible,
      isQuickInputVisible,
      showQuickInput,
      hideQuickInput,
      quickInputText,
      setQuickInputTextTruncated,
    ]
  );

  return (
    <QuickInputContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {isQuickInputVisible && !isQuickInputOverlaySuppressed && (
          <View style={styles.overlay} pointerEvents="box-none">
              <RNAnimated.View
                pointerEvents="auto"
                style={[styles.backdrop, { opacity: quickInputBackdropOpacity }]}
              >
                <Pressable style={StyleSheet.absoluteFill} onPress={() => hideQuickInput()} />
              </RNAnimated.View>
              {isQuickInputContentVisible && (
                <RNAnimated.View
                  pointerEvents="box-none"
                  style={[styles.longContentLayer, { opacity: quickInputLongOpacity }]}
                >
                  {confirmCardData != null && (
                    <View style={[styles.confirmCardContainer, { top: insets.top + 8 }]}>
                      <QuickInputConfirmCard
                        data={confirmCardData}
                        onConfirm={handleConfirmCardAdd}
                        onCancel={handleConfirmCardCancel}
                        onChange={handleConfirmCardChange}
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
                      onFocus={handleQuickInputFieldFocus}
                      onSend={handleSend}
                      onCancel={handleCancel}
                      sendLoading={isQuickInputSendLoading}
                      sendDisabled={confirmCardData != null}
                    />
                  </Animated.View>
                </RNAnimated.View>
              )}
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
  longContentLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 101,
    justifyContent: 'flex-end',
  },
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    /** TIP 박스 ↔ 롱버전 입력창 간격 */
    gap: 12,
  },
});
