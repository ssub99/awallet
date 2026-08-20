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
import { Accordion } from '@/components/ui/accordion';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { CustomKeypadOverlay } from '@/components/ui/custom-keypad-overlay';
import { FieldInputText } from '@/components/ui/field-input-text';
import { Button } from '@/components/ui/button';
import { BottomSheetFlow, type BottomSheetFlowScreen } from '@/components/ui/bottom-sheet-flow';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet, ModalBottomsheetBottomInset } from '@/components/ui/modal-bottomsheet';
import { QuickInputField } from '@/components/ui/quick-input-field';
import { Icon } from '@/components/ui/icon';
import { Radio } from '@/components/ui/radio';
import { SectionTitle } from '@/components/ui/section-title';
import { RecordDatePickerSheet } from '@/components/ui/record-date-picker-sheet';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { PARSE_EXPENSE_API_URL } from '@/constants/api';
import { atomicColors } from '@/constants/atomic-colors';
import { colors } from '@/constants/theme';
import { getCategoriesByType, type Category } from '@/constants/categories';
import { getRandomQuickInputPlaceholder } from '@/constants/quick-input-placeholders';
import { useAppData } from '@/contexts/app-data-context';
import { useToast } from '@/contexts/toast-context';
import { calendarRefreshEvent, publishCalendarTarget } from '@/hooks/calendar-events';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useRecordFormMemoKeyboard } from '@/hooks/use-record-form-memo-keyboard';
import { logEvent } from '@/utils/analytics';
import { getApiSecurityHeaders } from '@/utils/api-security-headers';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import { applySavedOrder, loadCategoryOrder } from '@/utils/category-order';
import { loadCategories } from '@/utils/categories';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import {
    addCalendarMonths,
    adjustWeekendDate,
    calculateRecurringIterations,
    formatRecurringSummaryLabel,
    getActualDayForMonth,
    getDayOfWeekLabel,
    getNextRecurringDate,
    getRecurringWeekendOptionDisplayLabel,
    shouldIgnoreWeekendOptionForRecurringType,
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
import type { QuickInputPendingRecord } from '@/utils/quick-input-pending-record';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import {
  AppState,
  BackHandler,
  Dimensions,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  useWindowDimensions,
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
const CALCULATOR_BAR_HEIGHT = 64;
const CALCULATOR_PANEL_GAP = 12;
const CALCULATOR_ANIMATION_DURATION = 360;
const CALCULATOR_ANIMATION_EASING = Easing.inOut(Easing.cubic);
const CALCULATOR_PANEL_HEIGHT =
  CALCULATOR_BAR_HEIGHT + CALCULATOR_PANEL_GAP + getKeypadHeight(Dimensions.get('window').width);
const EDIT_AMOUNT_KEYPAD_HEIGHT = getKeypadHeight(Dimensions.get('window').width);
const QUICK_INPUT_EDIT_SHEET_ANIMATION_DURATION = 300;
const QUICK_INPUT_EMBEDDED_SHEET_UNMOUNT_DELAY = QUICK_INPUT_EDIT_SHEET_ANIMATION_DURATION + 80;
const QUICK_INPUT_EDIT_RESTORE_DELAY = 180;
const QUICK_INPUT_EDIT_OPENING_ANIMATION_DURATION = 180;
const QUICK_INPUT_EDIT_VIEW_TRANSITION_DURATION = 350;
const QUICK_INPUT_EDIT_VIEW_TRANSITION_EASING = Easing.bezier(0.42, 0, 0.58, 1);
const PAYMENT_SHEET_LIST_BOTTOM_GAP = 16;

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
const QUICK_INPUT_RECURRING_PERIOD_OPTIONS = ['매일', '매주', '매월', '2주', '3주', '4주', '2개월 마다', '3개월 마다', '4개월 마다', '5개월 마다', '6개월 마다', '주중', '주말'];
const QUICK_INPUT_INSTALLMENT_MONTH_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const QUICK_INPUT_WEEKEND_OPTIONS: Array<{ value: 'weekend' | 'friday' | 'monday'; label: string }> = [
  { value: 'weekend', label: '관계없이 주말 기록' },
  { value: 'friday', label: '금주 금요일 기록' },
  { value: 'monday', label: '차주 월요일 기록' },
];

/** parse-expense API가 반환하는 기록 한 건 (확인 카드·기록 생성용) */
type PendingParseRecord = QuickInputPendingRecord;

type QuickInputEditDraft = {
  category: string;
  date: string;
  amount: string;
  memo: string;
  paymentSubtypeLabel: string;
  paymentMethod: 'credit' | 'debit' | 'cash';
  isRecurring: boolean;
  isInstallment: boolean;
  recurringType: string;
  totalMonths: number;
  weekendOption: 'weekend' | 'friday' | 'monday';
};

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
  const matched = date.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
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

function displayDateToIsoDate(date: string): string | null {
  const normalized = date.trim().replace(/\./g, '-');
  const parsed = parsePendingDate(normalized);
  if (!parsed) {
    return null;
  }
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

function isoDateToQuickInputDisplayDate(isoDate: string): string {
  return isoDate.replace(/-/g, '.');
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
  const { height: windowHeight } = useWindowDimensions();
  const router = useRouter();
  const { showToast } = useToast();
  const { refresh } = useAppData();
  const [isQuickInputVisible, setIsQuickInputVisible] = useState(false);
  /** 닫을 때 팁·입력만 즉시 숨김(키보드는 이후 dismiss) */
  const [isQuickInputContentVisible, setIsQuickInputContentVisible] = useState(false);
  const [isQuickInputShortVisible, setIsQuickInputShortVisible] = useState(false);
  const [quickInputText, setQuickInputText] = useState('');
  const [quickInputPlaceholder, setQuickInputPlaceholder] = useState(getRandomQuickInputPlaceholder);
  const [isQuickInputCalculatorVisible, setIsQuickInputCalculatorVisible] = useState(false);
  const [isQuickInputCalculatorMounted, setIsQuickInputCalculatorMounted] = useState(false);
  const [quickInputCalculatorAmount, setQuickInputCalculatorAmount] = useState('');
  const [quickInputCalculatorExpression, setQuickInputCalculatorExpression] = useState<ExpressionToken[]>([]);
  const [confirmCardData, setConfirmCardData] = useState<QuickInputConfirmCardData | null>(null);
  const [quickInputEditSheetVisible, setQuickInputEditSheetVisible] = useState(false);
  const [isQuickInputEditOpening, setIsQuickInputEditOpening] = useState(false);
  const [isQuickInputEditSheetClosing, setIsQuickInputEditSheetClosing] = useState(false);
  const [quickInputEditDraft, setQuickInputEditDraft] = useState<QuickInputEditDraft | null>(null);
  const [quickInputEditView, setQuickInputEditView] = useState<'form' | 'category' | 'recurring'>('form');
  const [quickInputCategorySheetCategories, setQuickInputCategorySheetCategories] = useState<Category[]>(() =>
    getCategoriesByType('expense')
  );
  const [quickInputCategorySheetSelected, setQuickInputCategorySheetSelected] = useState('');
  const [quickInputDateSheetMounted, setQuickInputDateSheetMounted] = useState(false);
  const [quickInputDateSheetVisible, setQuickInputDateSheetVisible] = useState(false);
  const [quickInputDateSheetSelected, setQuickInputDateSheetSelected] = useState<string | null>(null);
  const [quickInputDateSheetMonthStartDay, setQuickInputDateSheetMonthStartDay] = useState(1);
  const [quickInputPaymentSheetMounted, setQuickInputPaymentSheetMounted] = useState(false);
  const [quickInputPaymentSheetVisible, setQuickInputPaymentSheetVisible] = useState(false);
  const [quickInputPaymentSheetFilter, setQuickInputPaymentSheetFilter] = useState<'credit' | 'debit'>('credit');
  const [quickInputPaymentSheetItems, setQuickInputPaymentSheetItems] = useState<PaymentSubtype[]>([]);
  const [quickInputAmountKeypadMounted, setQuickInputAmountKeypadMounted] = useState(false);
  const [quickInputAmountKeypadVisible, setQuickInputAmountKeypadVisible] = useState(false);
  const [quickInputEditAmountExpression, setQuickInputEditAmountExpression] = useState<ExpressionToken[]>([]);
  const [quickInputRecurringDraftIsRecurring, setQuickInputRecurringDraftIsRecurring] = useState(false);
  const [quickInputRecurringDraftIsInstallment, setQuickInputRecurringDraftIsInstallment] = useState(false);
  const [quickInputRecurringDraftHasSelectedInstallment, setQuickInputRecurringDraftHasSelectedInstallment] = useState(false);
  const [quickInputRecurringDraftType, setQuickInputRecurringDraftType] = useState('매월');
  const [quickInputRecurringDraftTotalMonths, setQuickInputRecurringDraftTotalMonths] = useState(2);
  const [quickInputRecurringDraftWeekendOption, setQuickInputRecurringDraftWeekendOption] = useState<'weekend' | 'friday' | 'monday'>('weekend');
  const [quickInputRecurringDraftIsPeriodExpanded, setQuickInputRecurringDraftIsPeriodExpanded] = useState(false);
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
  const editSheetCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSheetRestoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dateSheetUnmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paymentSheetUnmountTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSheetOpenAnimationRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  const editSheetOpenCardTranslateY = useRef(new RNAnimated.Value(0)).current;
  const editSheetOpenCardOpacity = useRef(new RNAnimated.Value(1)).current;
  const editSheetOpenInputTranslateY = useRef(new RNAnimated.Value(0)).current;
  const editSheetOpenInputOpacity = useRef(new RNAnimated.Value(1)).current;
  const calculatorTranslateYRef = useRef(new RNAnimated.Value(CALCULATOR_PANEL_HEIGHT));
  const calculatorAnimationRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  const amountKeypadTranslateYRef = useRef(new RNAnimated.Value(EDIT_AMOUNT_KEYPAD_HEIGHT));
  const amountKeypadAnimationRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  const androidKeyboardSyncRafRef = useRef<number | null>(null);
  /** Android: controller만으로 bottom이 내려가며 깜빡이는 것 방지 */
  const lastAndroidBottomRef = useRef(0);
  const isQuickInputVisibleRef = useRef(false);
  const androidKeyboardWasVisibleRef = useRef(false);
  const hideQuickInputRef = useRef<(options?: HideQuickInputOptions) => void>(() => {});

  const quickInputRef = useRef<TextInput>(null);
  const editSheetScrollRef = useRef<ScrollView>(null);
  const editSheetMemoSectionYRef = useRef(0);
  const editSheetMemoSectionHeightRef = useRef(0);
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

  const {
    memoInputRef: quickInputEditMemoInputRef,
    keyboardPaddingBottom: quickInputEditMemoKeyboardPaddingBottom,
    isMemoSystemKeyboardOpen: isQuickInputEditMemoKeyboardOpen,
    handleMemoFocus: handleQuickInputEditMemoKeyboardFocus,
    handleMemoBlur: handleQuickInputEditMemoKeyboardBlur,
    onMemoScroll: onQuickInputEditMemoScroll,
    memoPointerHandlers: quickInputEditMemoPointerHandlers,
  } = useRecordFormMemoKeyboard({
    scrollViewRef: editSheetScrollRef,
    memoSectionYRef: editSheetMemoSectionYRef,
    memoSectionHeightRef: editSheetMemoSectionHeightRef,
    windowHeight,
    safeAreaBottom: insets.bottom,
  });

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
      calculatorAnimationRef.current?.stop();
      calculatorTranslateYRef.current.setValue(CALCULATOR_PANEL_HEIGHT);
      setIsQuickInputCalculatorVisible(false);
      setIsQuickInputCalculatorMounted(false);
      setQuickInputCalculatorAmount('');
      setQuickInputCalculatorExpression([]);
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

  const handleQuickInputCalculatorPress = useCallback(() => {
    calculatorAnimationRef.current?.stop();
    calculatorTranslateYRef.current.setValue(CALCULATOR_PANEL_HEIGHT);
    setIsQuickInputCalculatorMounted(true);
    setIsQuickInputCalculatorVisible(true);
    setShouldFollowKeyboard(false);
    shortBottomFromScreen.value = 0;
    animatedBottom.value = 0;
    quickInputRef.current?.blur();
    Keyboard.dismiss();
    requestAnimationFrame(() => {
      calculatorAnimationRef.current = RNAnimated.timing(calculatorTranslateYRef.current, {
        toValue: 0,
        duration: CALCULATOR_ANIMATION_DURATION,
        easing: CALCULATOR_ANIMATION_EASING,
        useNativeDriver: true,
      });
      calculatorAnimationRef.current.start();
    });
  }, [animatedBottom, setShouldFollowKeyboard, shortBottomFromScreen]);

  const formatQuickInputCalculatorAmount = useCallback((raw: string) => {
    if (!raw) return '0';
    const numeric = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return raw;
    return numeric.toLocaleString();
  }, []);

  const getQuickInputCalculatorOperatorSymbol = useCallback((operator: CustomKeypadOperator) => {
    switch (operator) {
      case 'add':
        return '+';
      case 'sub':
        return '-';
      case 'mul':
        return '×';
      case 'div':
        return '÷';
      default:
        return '';
    }
  }, []);

  const appendQuickInputCalculatorAmount = useCallback(
    (amountValue?: string) => {
      const normalizedAmount = (amountValue ?? quickInputCalculatorAmount).trim();
      if (!normalizedAmount) {
        return false;
      }
      const amountText = `${normalizedAmount}원`;
      setQuickInputText((current) => {
        const trimmed = current.trimEnd();
        const next = trimmed ? `${trimmed} ${amountText}` : amountText;
        return next.slice(0, MAX_MESSAGE_LENGTH);
      });
      return true;
    },
    [quickInputCalculatorAmount]
  );

  const closeQuickInputCalculator = useCallback(() => {
    calculatorAnimationRef.current?.stop();
    calculatorAnimationRef.current = RNAnimated.timing(calculatorTranslateYRef.current, {
      toValue: CALCULATOR_PANEL_HEIGHT,
      duration: CALCULATOR_ANIMATION_DURATION,
      easing: CALCULATOR_ANIMATION_EASING,
      useNativeDriver: true,
    });
    calculatorAnimationRef.current.start(({ finished }) => {
      if (!finished) return;
      setIsQuickInputCalculatorMounted(false);
      setIsQuickInputCalculatorVisible(false);
      setQuickInputCalculatorAmount('');
      setQuickInputCalculatorExpression([]);
      shortBottomFromScreen.value = lastShortBottomRef.current;
      animatedBottom.value = lastShortBottomRef.current;
      setShouldFollowKeyboard(true);
      requestAnimationFrame(() => {
        quickInputRef.current?.focus();
      });
    });
  }, [animatedBottom, setShouldFollowKeyboard, shortBottomFromScreen]);

  const handleQuickInputCalculatorCopy = useCallback(() => {
    const amountText = `${quickInputCalculatorAmount.trim() || '0'}원`;
    void Clipboard.setStringAsync(amountText)
      .then(() => {
        showToast('정상적으로 복사 되었습니다.');
      })
      .catch(() => {
        showToast('복사에 실패했습니다.');
      });
  }, [quickInputCalculatorAmount, showToast]);

  const handleQuickInputCalculatorConfirm = useCallback(
    (amountValue: string) => {
      appendQuickInputCalculatorAmount(amountValue);
      closeQuickInputCalculator();
    },
    [appendQuickInputCalculatorAmount, closeQuickInputCalculator]
  );

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
    calculatorAnimationRef.current?.stop();
    calculatorTranslateYRef.current.setValue(CALCULATOR_PANEL_HEIGHT);
    setIsQuickInputCalculatorVisible(false);
    setIsQuickInputCalculatorMounted(false);
    setQuickInputCalculatorAmount('');
    setQuickInputCalculatorExpression([]);
    setQuickInputText('');
    setConfirmCardData(null);
    setQuickInputEditSheetVisible(false);
    setIsQuickInputEditOpening(false);
    setIsQuickInputEditSheetClosing(false);
    setQuickInputEditDraft(null);
    setQuickInputEditView('form');
    setQuickInputCategorySheetSelected('');
    setQuickInputDateSheetMounted(false);
    setQuickInputDateSheetVisible(false);
    setQuickInputDateSheetSelected(null);
    setQuickInputPaymentSheetMounted(false);
    setQuickInputPaymentSheetVisible(false);
    amountKeypadAnimationRef.current?.stop();
    amountKeypadTranslateYRef.current.setValue(EDIT_AMOUNT_KEYPAD_HEIGHT);
    setQuickInputAmountKeypadMounted(false);
    setQuickInputAmountKeypadVisible(false);
    setQuickInputEditAmountExpression([]);
    editSheetOpenAnimationRef.current?.stop();
    editSheetOpenCardTranslateY.setValue(0);
    editSheetOpenCardOpacity.setValue(1);
    editSheetOpenInputTranslateY.setValue(0);
    editSheetOpenInputOpacity.setValue(1);
    if (editSheetCloseTimeoutRef.current) {
      clearTimeout(editSheetCloseTimeoutRef.current);
      editSheetCloseTimeoutRef.current = null;
    }
    if (editSheetRestoreTimeoutRef.current) {
      clearTimeout(editSheetRestoreTimeoutRef.current);
      editSheetRestoreTimeoutRef.current = null;
    }
    if (dateSheetUnmountTimeoutRef.current) {
      clearTimeout(dateSheetUnmountTimeoutRef.current);
      dateSheetUnmountTimeoutRef.current = null;
    }
    if (paymentSheetUnmountTimeoutRef.current) {
      clearTimeout(paymentSheetUnmountTimeoutRef.current);
      paymentSheetUnmountTimeoutRef.current = null;
    }
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

  const handleQuickInputCategorySettingPress = useCallback(() => {
    hideQuickInput({ simultaneous: true });
    router.push('/category-setting?type=expense');
  }, [hideQuickInput, router]);

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
      const parsedDate = parsePendingDate(pending.date);
      if (!parsedDate) {
        showToast('올바른 날짜를 기입해 주세요.');
        return;
      }
      const { year, month, day } = parsedDate;
      const dateStr = `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;

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

    if (editSheetCloseTimeoutRef.current) {
      clearTimeout(editSheetCloseTimeoutRef.current);
      editSheetCloseTimeoutRef.current = null;
    }
    if (editSheetRestoreTimeoutRef.current) {
      clearTimeout(editSheetRestoreTimeoutRef.current);
      editSheetRestoreTimeoutRef.current = null;
    }
    editSheetOpenAnimationRef.current?.stop();
    editSheetOpenCardTranslateY.setValue(0);
    editSheetOpenCardOpacity.setValue(1);
    editSheetOpenInputTranslateY.setValue(0);
    editSheetOpenInputOpacity.setValue(1);
    setIsQuickInputEditOpening(true);
    setIsQuickInputEditSheetClosing(false);
    setShouldFollowKeyboard(false);
    quickInputRef.current?.blur();
    Keyboard.dismiss();
    calculatorAnimationRef.current?.stop();
    calculatorTranslateYRef.current.setValue(CALCULATOR_PANEL_HEIGHT);
    setIsQuickInputCalculatorVisible(false);
    setIsQuickInputCalculatorMounted(false);
    setQuickInputCalculatorAmount('');
    setQuickInputCalculatorExpression([]);
    setQuickInputEditDraft({
      category: pending.category ?? '',
      date: pending.date.replace(/-/g, '.'),
      amount: Number.isFinite(pending.amount) ? pending.amount.toLocaleString('ko-KR') : '',
      memo: pending.memo ?? '',
      paymentMethod: pending.paymentMethod ?? 'credit',
      paymentSubtypeLabel: pending.paymentSubtypeLabel ?? paymentMethodToLabel(pending.paymentMethod),
      isRecurring: pending.isRecurring === true,
      isInstallment: pending.isInstallment === true,
      recurringType: pending.recurringType ?? '매월',
      totalMonths: Math.max(2, Math.min(12, pending.totalMonths ?? 2)),
      weekendOption: pending.weekendOption === 'friday' || pending.weekendOption === 'monday' ? pending.weekendOption : 'weekend',
    });
    editSheetOpenAnimationRef.current = RNAnimated.parallel([
      RNAnimated.timing(editSheetOpenCardTranslateY, {
        toValue: -16,
        duration: QUICK_INPUT_EDIT_OPENING_ANIMATION_DURATION,
        easing: CALCULATOR_ANIMATION_EASING,
        useNativeDriver: true,
      }),
      RNAnimated.timing(editSheetOpenCardOpacity, {
        toValue: 0,
        duration: QUICK_INPUT_EDIT_OPENING_ANIMATION_DURATION,
        easing: CALCULATOR_ANIMATION_EASING,
        useNativeDriver: true,
      }),
      RNAnimated.timing(editSheetOpenInputTranslateY, {
        toValue: 120,
        duration: QUICK_INPUT_EDIT_OPENING_ANIMATION_DURATION,
        easing: CALCULATOR_ANIMATION_EASING,
        useNativeDriver: true,
      }),
      RNAnimated.timing(editSheetOpenInputOpacity, {
        toValue: 0,
        duration: QUICK_INPUT_EDIT_OPENING_ANIMATION_DURATION,
        easing: CALCULATOR_ANIMATION_EASING,
        useNativeDriver: true,
      }),
    ]);
    editSheetOpenAnimationRef.current.start(({ finished }) => {
      if (!finished) {
        return;
      }
      setQuickInputEditSheetVisible(true);
      setIsQuickInputEditOpening(false);
    });
  }, [
    editSheetOpenCardOpacity,
    editSheetOpenCardTranslateY,
    editSheetOpenInputOpacity,
    editSheetOpenInputTranslateY,
    setShouldFollowKeyboard,
  ]);

  const updateQuickInputEditDraft = useCallback((patch: Partial<QuickInputEditDraft>) => {
    setQuickInputEditDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const quickInputEditCategoryEmoji = useMemo(() => {
    const categoryLabel = quickInputEditDraft?.category;
    if (!categoryLabel) {
      return undefined;
    }
    const categoryType = pendingRecordRef.current?.recordType === 'income' ? 'income' : 'expense';
    return getCategoriesByType(categoryType).find((category) => category.label === categoryLabel)?.emoji;
  }, [quickInputEditDraft?.category]);

  const quickInputEditRepeatLabel = useMemo(() => {
    if (!quickInputEditDraft) {
      return '반복/할부 설정';
    }
    const weekendText = getRecurringWeekendOptionDisplayLabel(
      quickInputEditDraft.isRecurring ? quickInputEditDraft.recurringType : undefined,
      quickInputEditDraft.weekendOption,
      { isRecurring: quickInputEditDraft.isRecurring },
    );
    if (quickInputEditDraft.isInstallment) {
      return formatRecurringSummaryLabel('할부', `${quickInputEditDraft.totalMonths}개월`, weekendText);
    }
    if (quickInputEditDraft.isRecurring) {
      return formatRecurringSummaryLabel('정기지출', quickInputEditDraft.recurringType, weekendText);
    }
    return '반복/할부 설정';
  }, [quickInputEditDraft]);

  const handleQuickInputEditAmountChange = useCallback((text: string) => {
    const digits = text.replace(/\D/g, '');
    if (!digits) {
      updateQuickInputEditDraft({ amount: '' });
      return;
    }
    const normalized = Number(digits);
    updateQuickInputEditDraft({
      amount: Number.isFinite(normalized) ? normalized.toLocaleString('ko-KR') : '',
    });
  }, [updateQuickInputEditDraft]);

  const closeQuickInputEditAmountKeypad = useCallback((options?: { immediate?: boolean }) => {
    amountKeypadAnimationRef.current?.stop();
    setQuickInputAmountKeypadVisible(false);
    setQuickInputEditAmountExpression([]);

    if (options?.immediate) {
      amountKeypadTranslateYRef.current.setValue(EDIT_AMOUNT_KEYPAD_HEIGHT);
      setQuickInputAmountKeypadMounted(false);
      return;
    }

    amountKeypadAnimationRef.current = RNAnimated.timing(amountKeypadTranslateYRef.current, {
      toValue: EDIT_AMOUNT_KEYPAD_HEIGHT,
      duration: CALCULATOR_ANIMATION_DURATION,
      easing: CALCULATOR_ANIMATION_EASING,
      useNativeDriver: true,
    });
    amountKeypadAnimationRef.current.start(({ finished }) => {
      if (finished) {
        setQuickInputAmountKeypadMounted(false);
      }
    });
  }, []);

  const closeQuickInputDateSheet = useCallback(() => {
    if (!quickInputDateSheetVisible) {
      return;
    }
    setQuickInputDateSheetVisible(false);
    if (dateSheetUnmountTimeoutRef.current) {
      clearTimeout(dateSheetUnmountTimeoutRef.current);
    }
    dateSheetUnmountTimeoutRef.current = setTimeout(() => {
      setQuickInputDateSheetMounted(false);
      dateSheetUnmountTimeoutRef.current = null;
    }, QUICK_INPUT_EMBEDDED_SHEET_UNMOUNT_DELAY);
  }, [quickInputDateSheetVisible]);

  const closeQuickInputPaymentSheet = useCallback(() => {
    if (!quickInputPaymentSheetVisible) {
      return;
    }
    setQuickInputPaymentSheetVisible(false);
    if (paymentSheetUnmountTimeoutRef.current) {
      clearTimeout(paymentSheetUnmountTimeoutRef.current);
    }
    paymentSheetUnmountTimeoutRef.current = setTimeout(() => {
      setQuickInputPaymentSheetMounted(false);
      paymentSheetUnmountTimeoutRef.current = null;
    }, QUICK_INPUT_EMBEDDED_SHEET_UNMOUNT_DELAY);
  }, [quickInputPaymentSheetVisible]);

  const handleQuickInputEditCategoryPress = useCallback(() => {
    const categoryType = pendingRecordRef.current?.recordType === 'income' ? 'income' : 'expense';
    closeQuickInputEditAmountKeypad({ immediate: true });
    setQuickInputCategorySheetSelected(quickInputEditDraft?.category ?? '');
    setQuickInputCategorySheetCategories(getCategoriesByType(categoryType));
    setQuickInputEditView('category');

    void Promise.all([
      loadCategories(categoryType),
      loadCategoryOrder(categoryType),
    ])
      .then(([loadedCategories, savedOrder]) => {
        setQuickInputCategorySheetCategories(
          savedOrder && savedOrder.length > 0
            ? applySavedOrder(loadedCategories, savedOrder)
            : loadedCategories
        );
      })
      .catch(() => {});
  }, [closeQuickInputEditAmountKeypad, quickInputEditDraft?.category]);

  const handleQuickInputCategorySheetClose = useCallback(() => {
    setQuickInputEditView('form');
  }, []);

  const handleQuickInputCategorySheetConfirm = useCallback(() => {
    if (!quickInputCategorySheetSelected) {
      showToast('카테고리를 선택해 주세요.');
      return;
    }
    updateQuickInputEditDraft({ category: quickInputCategorySheetSelected });
    setQuickInputEditView('form');
  }, [quickInputCategorySheetSelected, showToast, updateQuickInputEditDraft]);

  const handleQuickInputEditDatePress = useCallback(() => {
    closeQuickInputEditAmountKeypad({ immediate: true });
    setQuickInputDateSheetSelected(displayDateToIsoDate(quickInputEditDraft?.date ?? '') ?? new Date().toISOString().slice(0, 10));
    if (dateSheetUnmountTimeoutRef.current) {
      clearTimeout(dateSheetUnmountTimeoutRef.current);
      dateSheetUnmountTimeoutRef.current = null;
    }
    setQuickInputDateSheetMounted(true);
    setQuickInputDateSheetVisible(true);
    void loadMonthStartDay()
      .then(setQuickInputDateSheetMonthStartDay)
      .catch(() => {});
  }, [closeQuickInputEditAmountKeypad, quickInputEditDraft?.date]);

  const handleQuickInputDateSheetClose = useCallback(() => {
    closeQuickInputDateSheet();
  }, [closeQuickInputDateSheet]);

  const handleQuickInputDateSheetConfirm = useCallback((isoDate: string) => {
    updateQuickInputEditDraft({ date: isoDateToQuickInputDisplayDate(isoDate) });
    closeQuickInputDateSheet();
  }, [closeQuickInputDateSheet, updateQuickInputEditDraft]);

  const handleQuickInputEditPaymentPress = useCallback(() => {
    const method = quickInputEditDraft?.paymentMethod === 'debit' ? 'debit' : 'credit';
    closeQuickInputEditAmountKeypad({ immediate: true });
    setQuickInputPaymentSheetFilter(method);
    setQuickInputPaymentSheetItems(paymentSubtypesCacheRef.current);
    if (paymentSheetUnmountTimeoutRef.current) {
      clearTimeout(paymentSheetUnmountTimeoutRef.current);
      paymentSheetUnmountTimeoutRef.current = null;
    }
    setQuickInputPaymentSheetMounted(true);
    setQuickInputPaymentSheetVisible(true);
    void getPaymentSubtypesCached()
      .then(setQuickInputPaymentSheetItems)
      .catch(() => {});
  }, [closeQuickInputEditAmountKeypad, getPaymentSubtypesCached, quickInputEditDraft?.paymentMethod]);

  const handleQuickInputPaymentSheetClose = useCallback(() => {
    closeQuickInputPaymentSheet();
  }, [closeQuickInputPaymentSheet]);

  const handleQuickInputPaymentSelect = useCallback((method: 'credit' | 'debit' | 'cash', subtype?: PaymentSubtype) => {
    updateQuickInputEditDraft({
      paymentMethod: method,
      paymentSubtypeLabel: method === 'cash' ? '현금' : subtype?.label ?? paymentMethodToLabel(method),
    });
    if (pendingRecordRef.current) {
      pendingRecordRef.current = {
        ...pendingRecordRef.current,
        paymentMethod: method,
        paymentSubtypeId: method === 'cash' ? undefined : subtype?.id,
        paymentSubtypeColor: method === 'cash' ? undefined : subtype?.color,
        paymentSubtypeLabel: method === 'cash' ? undefined : subtype?.label,
      };
    }
    closeQuickInputPaymentSheet();
  }, [closeQuickInputPaymentSheet, updateQuickInputEditDraft]);

  const handleQuickInputEditAmountPress = useCallback(() => {
    Keyboard.dismiss();
    setQuickInputEditView('form');
    closeQuickInputDateSheet();
    closeQuickInputPaymentSheet();
    amountKeypadAnimationRef.current?.stop();
    amountKeypadTranslateYRef.current.setValue(EDIT_AMOUNT_KEYPAD_HEIGHT);
    setQuickInputAmountKeypadMounted(true);
    setQuickInputAmountKeypadVisible(true);
    amountKeypadAnimationRef.current = RNAnimated.timing(amountKeypadTranslateYRef.current, {
      toValue: 0,
      duration: CALCULATOR_ANIMATION_DURATION,
      easing: CALCULATOR_ANIMATION_EASING,
      useNativeDriver: true,
    });
    amountKeypadAnimationRef.current.start();
  }, [closeQuickInputDateSheet, closeQuickInputPaymentSheet]);

  const handleQuickInputAmountKeypadClose = useCallback(() => {
    closeQuickInputEditAmountKeypad();
  }, [closeQuickInputEditAmountKeypad]);

  const handleQuickInputAmountKeypadConfirm = useCallback((amountValue: string) => {
    handleQuickInputEditAmountChange(amountValue);
    closeQuickInputEditAmountKeypad();
  }, [closeQuickInputEditAmountKeypad, handleQuickInputEditAmountChange]);

  const handleQuickInputEditMemoFocus = useCallback(() => {
    closeQuickInputEditAmountKeypad({ immediate: true });
    handleQuickInputEditMemoKeyboardFocus();
  }, [closeQuickInputEditAmountKeypad, handleQuickInputEditMemoKeyboardFocus]);

  const handleQuickInputEditMemoBlur = useCallback(() => {
    handleQuickInputEditMemoKeyboardBlur();
  }, [handleQuickInputEditMemoKeyboardBlur]);

  const handleQuickInputEditRecurringPress = useCallback(() => {
    closeQuickInputEditAmountKeypad({ immediate: true });
    const source = quickInputEditDraft;
    setQuickInputRecurringDraftIsRecurring(source?.isRecurring ?? false);
    setQuickInputRecurringDraftIsInstallment(source?.isInstallment ?? false);
    setQuickInputRecurringDraftHasSelectedInstallment(source?.isInstallment ?? false);
    setQuickInputRecurringDraftType(source?.recurringType ?? '매월');
    setQuickInputRecurringDraftTotalMonths(source?.totalMonths ?? 2);
    setQuickInputRecurringDraftWeekendOption(source?.weekendOption ?? 'weekend');
    setQuickInputRecurringDraftIsPeriodExpanded(false);
    setQuickInputEditView('recurring');
  }, [closeQuickInputEditAmountKeypad, quickInputEditDraft]);

  const handleQuickInputRecurringSheetClose = useCallback(() => {
    setQuickInputEditView('form');
  }, []);

  const handleQuickInputRecurringConfirm = useCallback(() => {
    updateQuickInputEditDraft({
      isRecurring: quickInputRecurringDraftIsRecurring,
      isInstallment: quickInputRecurringDraftIsInstallment,
      recurringType: quickInputRecurringDraftType,
      totalMonths: quickInputRecurringDraftTotalMonths,
      weekendOption:
        quickInputRecurringDraftIsRecurring && shouldIgnoreWeekendOptionForRecurringType(quickInputRecurringDraftType)
          ? 'weekend'
          : quickInputRecurringDraftWeekendOption,
    });
    setQuickInputEditView('form');
  }, [
    quickInputRecurringDraftIsInstallment,
    quickInputRecurringDraftIsRecurring,
    quickInputRecurringDraftTotalMonths,
    quickInputRecurringDraftType,
    quickInputRecurringDraftWeekendOption,
    updateQuickInputEditDraft,
  ]);

  const handleQuickInputRecurringToggle = useCallback((value: boolean) => {
    setQuickInputRecurringDraftIsRecurring(value);
    if (!value) {
      setQuickInputRecurringDraftTotalMonths(2);
      if (!quickInputRecurringDraftHasSelectedInstallment) {
        setQuickInputRecurringDraftType('매월');
      }
      return;
    }
    setQuickInputRecurringDraftIsInstallment(false);
    setQuickInputRecurringDraftHasSelectedInstallment(false);
    setQuickInputRecurringDraftType('매일');
  }, [quickInputRecurringDraftHasSelectedInstallment]);

  const handleQuickInputInstallmentToggle = useCallback((value: boolean) => {
    setQuickInputRecurringDraftIsInstallment(value);
    if (value) {
      setQuickInputRecurringDraftIsRecurring(false);
      setQuickInputRecurringDraftHasSelectedInstallment(true);
    }
  }, []);

  const handleQuickInputEditSheetClose = useCallback(() => {
    if (isQuickInputEditOpening || isQuickInputEditSheetClosing) {
      return;
    }
    setIsQuickInputEditSheetClosing(true);
    setQuickInputEditSheetVisible(false);
    setQuickInputEditView('form');
    setQuickInputDateSheetVisible(false);
    setQuickInputPaymentSheetVisible(false);
    setQuickInputAmountKeypadVisible(false);
    if (editSheetCloseTimeoutRef.current) {
      clearTimeout(editSheetCloseTimeoutRef.current);
    }
    if (editSheetRestoreTimeoutRef.current) {
      clearTimeout(editSheetRestoreTimeoutRef.current);
      editSheetRestoreTimeoutRef.current = null;
    }
    editSheetCloseTimeoutRef.current = setTimeout(() => {
      editSheetCloseTimeoutRef.current = null;
      setQuickInputEditDraft(null);
      editSheetRestoreTimeoutRef.current = setTimeout(() => {
        editSheetRestoreTimeoutRef.current = null;
        shortBottomFromScreen.value = lastShortBottomRef.current;
        animatedBottom.value = lastShortBottomRef.current;
        setShouldFollowKeyboard(true);
        editSheetOpenCardTranslateY.setValue(0);
        editSheetOpenCardOpacity.setValue(1);
        editSheetOpenInputTranslateY.setValue(0);
        editSheetOpenInputOpacity.setValue(1);
        setIsQuickInputEditSheetClosing(false);
        requestAnimationFrame(() => {
          quickInputRef.current?.focus();
        });
      }, QUICK_INPUT_EDIT_RESTORE_DELAY);
    }, QUICK_INPUT_EDIT_SHEET_ANIMATION_DURATION);
  }, [
    animatedBottom,
    editSheetOpenCardOpacity,
    editSheetOpenCardTranslateY,
    editSheetOpenInputOpacity,
    editSheetOpenInputTranslateY,
    isQuickInputEditOpening,
    isQuickInputEditSheetClosing,
    setShouldFollowKeyboard,
    shortBottomFromScreen,
  ]);

  const handleQuickInputEditSheetConfirm = useCallback(() => {
    const draft = quickInputEditDraft;
    const current = pendingRecordRef.current;
    if (!draft || !current) {
      handleQuickInputEditSheetClose();
      return;
    }

    const amountNumber = Number(draft.amount.replace(/,/g, ''));
    if (!draft.category.trim() || !draft.date.trim() || !Number.isFinite(amountNumber) || amountNumber <= 0) {
      showToast('필수 항목을 입력해 주세요.');
      return;
    }

    const updated: PendingParseRecord = {
      ...current,
      category: draft.category.trim(),
      date: draft.date.trim().replace(/-/g, '.'),
      amount: amountNumber,
      memo: draft.memo.trim() ? draft.memo.trim() : undefined,
      paymentMethod: draft.paymentMethod,
      paymentSubtypeLabel: draft.paymentSubtypeLabel.trim() || undefined,
      isRecurring: draft.isRecurring || undefined,
      isInstallment: draft.isInstallment || undefined,
      recurringType: draft.isRecurring ? draft.recurringType : undefined,
      totalMonths: draft.isRecurring || draft.isInstallment ? draft.totalMonths : undefined,
      weekendOption: draft.isRecurring || draft.isInstallment ? draft.weekendOption : undefined,
    };

    pendingRecordRef.current = updated;
    handleQuickInputEditSheetClose();
    void buildConfirmCardFromPending(updated, {
      getExpenseCategoriesCached,
      getIncomeCategoriesCached,
      getPaymentSubtypesCached,
    }).then(setConfirmCardData).catch(() => {});
  }, [
    getExpenseCategoriesCached,
    getIncomeCategoriesCached,
    getPaymentSubtypesCached,
    handleQuickInputEditSheetClose,
    quickInputEditDraft,
    showToast,
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
      if (editSheetCloseTimeoutRef.current) {
        clearTimeout(editSheetCloseTimeoutRef.current);
        editSheetCloseTimeoutRef.current = null;
      }
      if (editSheetRestoreTimeoutRef.current) {
        clearTimeout(editSheetRestoreTimeoutRef.current);
        editSheetRestoreTimeoutRef.current = null;
      }
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

  const quickInputCalculatorExpressionView = useMemo(() => {
    const isPlaceholderAmount =
      quickInputCalculatorExpression.length === 0 && quickInputCalculatorAmount.length === 0;
    const tokensToRender =
      quickInputCalculatorExpression.length > 0
        ? quickInputCalculatorExpression
        : [{ type: 'number' as const, value: quickInputCalculatorAmount.replace(/,/g, '') || '0' }];

    return (
      <ScrollView
        horizontal
        scrollEnabled={false}
        pointerEvents="none"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.calculatorExpressionContent}
      >
        {tokensToRender.map((token, index) => {
          const textColor = isPlaceholderAmount ? atomicColors.neutral[500] : atomicColors.common[100];
          if (token.type === 'number') {
            return (
              <FieldInputText
                variant="number"
                key={`num-${index}`}
                style={[styles.calculatorAmountText, { color: textColor }]}
              >
                {formatQuickInputCalculatorAmount(token.value)}
              </FieldInputText>
            );
          }

          const symbol = getQuickInputCalculatorOperatorSymbol(token.value as CustomKeypadOperator);
          if (!symbol) return null;

          return (
            <FieldInputText
              variant="number"
              key={`op-${index}`}
              style={styles.calculatorOperatorText}
              accessibilityLabel="연산자"
            >
              {symbol}
            </FieldInputText>
          );
        })}
        <Text
          style={[
            styles.calculatorUnitText,
            { color: isPlaceholderAmount ? atomicColors.neutral[500] : atomicColors.common[100] },
          ]}
        >
          원
        </Text>
      </ScrollView>
    );
  }, [
    formatQuickInputCalculatorAmount,
    getQuickInputCalculatorOperatorSymbol,
    quickInputCalculatorAmount,
    quickInputCalculatorExpression,
  ]);

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
                <Pressable
                  style={StyleSheet.absoluteFill}
                  onPress={
                    quickInputEditSheetVisible || isQuickInputEditSheetClosing || isQuickInputEditOpening
                      ? handleQuickInputEditSheetClose
                      : () => hideQuickInput()
                  }
                />
              </RNAnimated.View>
              {isQuickInputContentVisible && (
                <RNAnimated.View
                  pointerEvents="box-none"
                  style={[styles.longContentLayer, { opacity: quickInputLongOpacity }]}
                >
                  {confirmCardData != null && !quickInputEditSheetVisible && !isQuickInputEditSheetClosing && (
                    <RNAnimated.View
                      style={[
                        styles.confirmCardContainer,
                        {
                          top: insets.top + 8,
                          opacity: editSheetOpenCardOpacity,
                          transform: [{ translateY: editSheetOpenCardTranslateY }],
                        },
                      ]}
                    >
                      <QuickInputConfirmCard
                        data={confirmCardData}
                        onConfirm={handleConfirmCardAdd}
                        onCancel={handleConfirmCardCancel}
                        onChange={handleConfirmCardChange}
                        addLoading={isQuickInputConfirmAdding}
                      />
                    </RNAnimated.View>
                  )}
                  <Animated.View
                    pointerEvents={confirmCardData != null ? 'none' : 'auto'}
                    style={[styles.container, containerAnimatedStyle]}
                  >
                    {!quickInputEditSheetVisible && !isQuickInputEditSheetClosing && !isQuickInputCalculatorVisible && (
                      <RNAnimated.View
                        style={[
                          styles.normalInputStack,
                          {
                            opacity: editSheetOpenInputOpacity,
                            transform: [{ translateY: editSheetOpenInputTranslateY }],
                          },
                        ]}
                      >
                        <View style={styles.edgeContent}>
                          <View style={styles.actionRow}>
                            <Pressable
                              style={styles.actionChip}
                              onPress={handleQuickInputCalculatorPress}
                              accessibilityRole="button"
                              accessibilityLabel="계산기"
                            >
                              <View style={styles.actionIconBox}>
                                <Icon name="calculator" variant="solid" size={24} />
                              </View>
                              <Text style={styles.actionLabel}>계산기</Text>
                            </Pressable>
                            <Pressable
                              style={styles.actionChip}
                              onPress={handleQuickInputCategorySettingPress}
                              accessibilityRole="button"
                              accessibilityLabel="카테고리 설정"
                            >
                              <View style={styles.actionIconBox}>
                                <Icon name="categorySetting" variant="solid" size={24} />
                              </View>
                              <Text style={styles.actionLabel}>카테고리 설정</Text>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.edgeContent}>
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
                        </View>
                      </RNAnimated.View>
                    )}
                    {!quickInputEditSheetVisible && !isQuickInputEditSheetClosing && isQuickInputCalculatorMounted && (
                      <RNAnimated.View
                        style={[
                          styles.calculatorPanel,
                          { transform: [{ translateY: calculatorTranslateYRef.current }] },
                        ]}
                      >
                        <View style={styles.edgeContent}>
                          <View style={styles.calculatorBar}>
                            <View style={styles.calculatorInput}>{quickInputCalculatorExpressionView}</View>
                            <Pressable
                              style={styles.calculatorActionButton}
                              onPress={handleQuickInputCalculatorCopy}
                              accessibilityRole="button"
                              accessibilityLabel="계산 금액 입력"
                            >
                              <Icon name="copy" variant="line" size={24} color={atomicColors.common[100]} />
                            </Pressable>
                            <Pressable
                              style={styles.calculatorActionButton}
                              onPress={closeQuickInputCalculator}
                              accessibilityRole="button"
                              accessibilityLabel="계산기 닫기"
                            >
                              <Icon name="close" variant="line" size={24} color={atomicColors.neutral[800]} />
                            </Pressable>
                          </View>
                        </View>
                        <CustomKeypad
                          value={quickInputCalculatorAmount}
                          onValueChange={setQuickInputCalculatorAmount}
                          onExpressionChange={setQuickInputCalculatorExpression}
                          onConfirm={handleQuickInputCalculatorConfirm}
                        />
                      </RNAnimated.View>
                    )}
                  </Animated.View>
                </RNAnimated.View>
              )}
              <ModalBottomsheet
                visible={quickInputEditSheetVisible}
                title="소비 기록"
                onClose={handleQuickInputEditSheetClose}
                closeOnBackdrop={quickInputEditView === 'form'}
                embedded
                showBackdrop={false}
                showHandle={false}
                hideNavigation
                style={StyleSheet.flatten([styles.editSheet, { height: windowHeight * 0.8 }])}
                contentStyle={styles.editSheetContent}
                noPaddingBottom
              >
                {quickInputEditDraft != null && (
                  <View style={styles.editSheetBody}>
                    <BottomSheetFlow
                      activeKey={quickInputEditView}
                      duration={QUICK_INPUT_EDIT_VIEW_TRANSITION_DURATION}
                      easing={QUICK_INPUT_EDIT_VIEW_TRANSITION_EASING}
                      screens={[
                        {
                          key: 'form',
                          title: '소비 기록',
                          left: 'close',
                          onLeftPress: handleQuickInputEditSheetClose,
                          showHandle: true,
                          content: (
                            <ScrollView
                              ref={editSheetScrollRef}
                              style={styles.editSheetScroll}
                              contentContainerStyle={[
                                styles.editSheetForm,
                                isQuickInputEditMemoKeyboardOpen
                                  ? { paddingBottom: quickInputEditMemoKeyboardPaddingBottom }
                                  : null,
                              ]}
                              showsVerticalScrollIndicator={false}
                              bounces={false}
                              overScrollMode="never"
                              keyboardShouldPersistTaps="handled"
                              onScroll={onQuickInputEditMemoScroll}
                              scrollEventThrottle={16}
                            >
                              <View style={styles.editSection}>
                                <SectionTitle style={styles.editSectionTitle}>
                                  카테고리 <Text style={styles.requiredMark}>*</Text>
                                </SectionTitle>
                                <Input
                                  value={quickInputEditDraft.category}
                                  placeholder="카테고리 선택"
                                  buttonMode
                                  sortationEmoji={quickInputEditCategoryEmoji}
                                  showSortationDot={false}
                                  showRightArrow
                                  onPress={handleQuickInputEditCategoryPress}
                                />
                              </View>
                              <View style={styles.editSection}>
                                <View style={styles.editSectionHeaderRow}>
                                  <SectionTitle style={styles.editSectionTitle}>
                                    날짜 <Text style={styles.requiredMark}>*</Text>
                                  </SectionTitle>
                                  <Pressable
                                    onPress={handleQuickInputEditRecurringPress}
                                    accessibilityRole="button"
                                    accessibilityLabel="반복/할부 설정"
                                  >
                                    <Text style={styles.editRecurringButtonText}>{quickInputEditRepeatLabel}</Text>
                                  </Pressable>
                                </View>
                                <Input
                                  icon="calendarMonth"
                                  value={quickInputEditDraft.date}
                                  placeholder="날짜 선택"
                                  buttonMode
                                  onPress={handleQuickInputEditDatePress}
                                />
                              </View>
                              <View style={styles.editSection}>
                                <SectionTitle style={styles.editSectionTitle}>
                                  금액 <Text style={styles.requiredMark}>*</Text>
                                </SectionTitle>
                                <Input
                                  inputType="number"
                                  unit="원"
                                  value={quickInputEditDraft.amount || '0'}
                                  placeholder="0"
                                  textAlign="right"
                                  editable={false}
                                  caretHidden
                                  valueRenderer={
                                    <View style={styles.editAmountValueWrap}>
                                      <Text style={styles.editAmountValueText}>{quickInputEditDraft.amount || '0'}</Text>
                                    </View>
                                  }
                                  onPress={handleQuickInputEditAmountPress}
                                />
                              </View>
                              <View
                                style={styles.editSection}
                                onLayout={(event) => {
                                  const layout = event.nativeEvent.layout;
                                  editSheetMemoSectionYRef.current = layout.y;
                                  editSheetMemoSectionHeightRef.current = layout.height;
                                }}
                              >
                                <SectionTitle style={styles.editSectionTitle}>메모</SectionTitle>
                                <Input
                                  ref={quickInputEditMemoInputRef}
                                  variant="area"
                                  value={quickInputEditDraft.memo}
                                  onChangeText={(memo) => updateQuickInputEditDraft({ memo: memo.slice(0, 20) })}
                                  onPressIn={() => {
                                    quickInputEditMemoPointerHandlers.onPressIn();
                                    closeQuickInputEditAmountKeypad({ immediate: true });
                                  }}
                                  onPressOut={quickInputEditMemoPointerHandlers.onPressOut}
                                  onFocus={handleQuickInputEditMemoFocus}
                                  onBlur={handleQuickInputEditMemoBlur}
                                  placeholder="메모를 입력해 주세요.(최대 20자)"
                                  maxLength={20}
                                  multiline
                                />
                              </View>
                            </ScrollView>
                          ),
                          footer: (
                            <>
                              <View style={styles.editPaymentSticky}>
                                <Text style={styles.editPaymentLabel}>결제 유형</Text>
                                <View style={styles.editPaymentControl}>
                                  <Input
                                    value={quickInputEditDraft.paymentSubtypeLabel || paymentMethodToLabel(quickInputEditDraft.paymentMethod)}
                                    shortver
                                    sortation
                                    showSortationDot={quickInputEditDraft.paymentMethod !== 'cash'}
                                    sortationColor={pendingRecordRef.current?.paymentSubtypeColor}
                                    sortationEmoji={quickInputEditDraft.paymentMethod === 'cash' ? '💰' : undefined}
                                    rightIcon="arrowDown"
                                    showRightArrow
                                    buttonMode
                                    onPress={handleQuickInputEditPaymentPress}
                                  />
                                </View>
                              </View>
                              <View style={[styles.editSheetCta, { paddingBottom: 16 + insets.bottom }]}>
                                <Button onPress={handleQuickInputEditSheetConfirm}>확인</Button>
                              </View>
                            </>
                          ),
                        },
                        {
                          key: 'category',
                          title: '카테고리 선택',
                          left: 'back',
                          onLeftPress: handleQuickInputCategorySheetClose,
                          right: { label: '확인', onPress: handleQuickInputCategorySheetConfirm },
                          swipeBackEnabled: true,
                          content: (
                            <View style={styles.categorySheetBody}>
                              <View style={styles.categorySheetCard}>
                                <ScrollView
                                  style={styles.categorySheetScroll}
                                  contentContainerStyle={styles.categorySheetScrollContent}
                                  showsVerticalScrollIndicator={false}
                                  bounces={false}
                                  overScrollMode="never"
                                >
                                  {quickInputCategorySheetCategories.map((category, index) => (
                                    <View key={`${category.type}-${category.label}`}>
                                      <Pressable
                                        style={styles.categorySheetItem}
                                        onPress={() => setQuickInputCategorySheetSelected(category.label)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${category.label} 선택`}
                                      >
                                        <View style={styles.categorySheetItemContent}>
                                          <Text style={styles.categorySheetEmoji}>{category.emoji}</Text>
                                          <Text style={styles.categorySheetLabel}>{category.label}</Text>
                                        </View>
                                        {quickInputCategorySheetSelected === category.label ? (
                                          <Icon name="check" variant="line" size={24} color={atomicColors.blue[600]} />
                                        ) : null}
                                      </Pressable>
                                      {index < quickInputCategorySheetCategories.length - 1 ? (
                                        <View style={styles.categorySheetDivider} />
                                      ) : null}
                                    </View>
                                  ))}
                                </ScrollView>
                              </View>
                            </View>
                          ),
                        },
                        {
                          key: 'recurring',
                          title: '반복/할부 설정',
                          left: 'back',
                          onLeftPress: handleQuickInputRecurringSheetClose,
                          right: { label: '확인', onPress: handleQuickInputRecurringConfirm },
                          swipeBackEnabled: true,
                          content: (
                            <ScrollView
                              style={styles.recurringSheetScroll}
                              contentContainerStyle={styles.recurringSheetScrollContent}
                              showsVerticalScrollIndicator
                              bounces={false}
                              overScrollMode="never"
                            >
                              <View style={styles.sheetSection}>
                                <SectionTitle style={styles.editSectionTitle}>
                                  소비 형태
                                </SectionTitle>
                                <View style={styles.recurringCard}>
                                  <View style={styles.recurringSection}>
                                    <View style={styles.recurringTitleRow}>
                                      <UiLineText style={styles.recurringSwitchLabel}>
                                        정기 지출 여부
                                      </UiLineText>
                                      <Switch value={quickInputRecurringDraftIsRecurring} onValueChange={handleQuickInputRecurringToggle} />
                                    </View>
                                    <Text style={styles.recurringCaption}>
                                      현재 월 기준 매달 같은 날에 자동 기록합니다.
                                    </Text>
                                  </View>
                                  <View style={styles.recurringDivider} />
                                  <View style={styles.recurringSection}>
                                    <View style={styles.recurringTitleRow}>
                                      <UiLineText style={styles.recurringSwitchLabel}>
                                        할부 여부
                                      </UiLineText>
                                      <Switch value={quickInputRecurringDraftIsInstallment} onValueChange={handleQuickInputInstallmentToggle} />
                                    </View>
                                    <Text style={styles.recurringCaption}>
                                      할부 기간동안 해당 소비금액을 자동 기록합니다.
                                    </Text>
                                  </View>
                                </View>
                              </View>

                              <View style={styles.sheetSection}>
                                <SectionTitle style={styles.editSectionTitle}>
                                  {quickInputRecurringDraftIsInstallment ? '할부 기간' : '반복 기간'}
                                </SectionTitle>
                                <View style={styles.chipContainer}>
                                  {quickInputRecurringDraftIsRecurring || (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment && !quickInputRecurringDraftHasSelectedInstallment) ? (
                                    <>
                                      {(quickInputRecurringDraftIsPeriodExpanded ? QUICK_INPUT_RECURRING_PERIOD_OPTIONS : QUICK_INPUT_RECURRING_PERIOD_OPTIONS.slice(0, 6)).map((label) => (
                                        <Chip
                                          key={label}
                                          type="option"
                                          label={label}
                                          active={quickInputRecurringDraftType === label}
                                          disabled={!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment}
                                          onPress={() => {
                                            if (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment) return;
                                            setQuickInputRecurringDraftType(label);
                                            if (shouldIgnoreWeekendOptionForRecurringType(label)) {
                                              setQuickInputRecurringDraftWeekendOption('weekend');
                                            }
                                            if (label === '매월') {
                                              setQuickInputRecurringDraftTotalMonths(1);
                                            } else if (label === '2개월 마다') {
                                              setQuickInputRecurringDraftTotalMonths(2);
                                            } else if (label === '3개월 마다') {
                                              setQuickInputRecurringDraftTotalMonths(3);
                                            } else if (label === '4개월 마다') {
                                              setQuickInputRecurringDraftTotalMonths(4);
                                            } else if (label === '5개월 마다') {
                                              setQuickInputRecurringDraftTotalMonths(5);
                                            } else if (label === '6개월 마다') {
                                              setQuickInputRecurringDraftTotalMonths(6);
                                            }
                                          }}
                                          style={styles.periodChip}
                                        />
                                      ))}
                                    </>
                                  ) : (
                                    <>
                                      {(quickInputRecurringDraftIsPeriodExpanded ? QUICK_INPUT_INSTALLMENT_MONTH_OPTIONS : QUICK_INPUT_INSTALLMENT_MONTH_OPTIONS.slice(0, 6)).map((months) => (
                                        <Chip
                                          key={months}
                                          type="option"
                                          label={`${months}개월`}
                                          active={quickInputRecurringDraftTotalMonths === months}
                                          disabled={!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment}
                                          onPress={() => {
                                            if (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment) return;
                                            setQuickInputRecurringDraftTotalMonths(months);
                                          }}
                                          style={styles.periodChip}
                                        />
                                      ))}
                                    </>
                                  )}
                                </View>
                                <Accordion
                                  expanded={quickInputRecurringDraftIsPeriodExpanded}
                                  onToggle={setQuickInputRecurringDraftIsPeriodExpanded}
                                  disabled={!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment}
                                />
                              </View>

                              <View style={styles.sheetSection}>
                                <SectionTitle style={styles.editSectionTitle}>기록일이 주말인 경우</SectionTitle>
                                <View style={styles.recurringCard}>
                                  {QUICK_INPUT_WEEKEND_OPTIONS.map((option, index) => {
                                    const disabled =
                                      (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment) ||
                                      (quickInputRecurringDraftIsRecurring && shouldIgnoreWeekendOptionForRecurringType(quickInputRecurringDraftType));
                                    const active = quickInputRecurringDraftWeekendOption === option.value;
                                    return (
                                      <View key={option.value}>
                                        <Pressable
                                          style={styles.recurringRadioRow}
                                          onPress={() => {
                                            if (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment) return;
                                            if (quickInputRecurringDraftIsRecurring && shouldIgnoreWeekendOptionForRecurringType(quickInputRecurringDraftType)) {
                                              showToast('해당 단위는 주말 옵션을 적용할 수 없습니다.');
                                              return;
                                            }
                                            setQuickInputRecurringDraftWeekendOption(option.value);
                                          }}
                                          disabled={!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment}
                                          accessibilityRole="radio"
                                          accessibilityState={{ selected: active, disabled }}
                                        >
                                          <UiLineText style={styles.weekendOptionText}>
                                            {option.label}
                                          </UiLineText>
                                          <Radio
                                            checked={active}
                                            onPress={() => {
                                              if (!quickInputRecurringDraftIsRecurring && !quickInputRecurringDraftIsInstallment) return;
                                              if (quickInputRecurringDraftIsRecurring && shouldIgnoreWeekendOptionForRecurringType(quickInputRecurringDraftType)) {
                                                showToast('해당 단위는 주말 옵션을 적용할 수 없습니다.');
                                                return;
                                              }
                                              setQuickInputRecurringDraftWeekendOption(option.value);
                                            }}
                                            label={false}
                                            disabled={disabled}
                                          />
                                        </Pressable>
                                        {index < QUICK_INPUT_WEEKEND_OPTIONS.length - 1 ? <View style={styles.recurringDivider} /> : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            </ScrollView>
                          ),
                        },
                      ] satisfies BottomSheetFlowScreen[]}
                    />
                  </View>
                )}
              </ModalBottomsheet>
              {quickInputDateSheetMounted ? (
                <RecordDatePickerSheet
                  visible={quickInputDateSheetVisible}
                  embedded
                  title="소비 기록일 선택"
                  selectedDate={quickInputDateSheetSelected}
                  onSelectedDateChange={setQuickInputDateSheetSelected}
                  onClose={handleQuickInputDateSheetClose}
                  onConfirm={handleQuickInputDateSheetConfirm}
                  monthStartDay={quickInputDateSheetMonthStartDay}
                  embeddedZIndex={100010}
                  navigationLeftIcon="close"
                />
              ) : null}
              {quickInputPaymentSheetMounted ? (
                <ModalBottomsheet
                  visible={quickInputPaymentSheetVisible}
                  title="결제 유형 선택"
                  onClose={handleQuickInputPaymentSheetClose}
                  closeOnBackdrop
                  embedded
                  embeddedZIndex={100010}
                  navigationLeftIcon="close"
                  style={{ height: windowHeight * 0.5 }}
                  contentStyle={styles.paymentSheetContent}
                  noPaddingBottom
                >
                <View style={styles.paymentSheetBody}>
                  <View style={styles.paymentSheetFilterRow}>
                    <Pressable
                      style={[
                        styles.paymentSheetChip,
                        quickInputPaymentSheetFilter === 'credit' && styles.paymentSheetChipActive,
                      ]}
                      onPress={() => setQuickInputPaymentSheetFilter('credit')}
                    >
                      <Text style={[
                        styles.paymentSheetChipText,
                        quickInputPaymentSheetFilter === 'credit' && styles.paymentSheetChipTextActive,
                      ]}>신용카드</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.paymentSheetChip,
                        quickInputPaymentSheetFilter === 'debit' && styles.paymentSheetChipActive,
                      ]}
                      onPress={() => setQuickInputPaymentSheetFilter('debit')}
                    >
                      <Text style={[
                        styles.paymentSheetChipText,
                        quickInputPaymentSheetFilter === 'debit' && styles.paymentSheetChipTextActive,
                      ]}>체크카드</Text>
                    </Pressable>
                    <Pressable
                      style={styles.paymentSheetCashButton}
                      onPress={() => handleQuickInputPaymentSelect('cash')}
                    >
                      <Text style={styles.paymentSheetCashEmoji}>💰</Text>
                      <Text style={styles.paymentSheetCashText}>현금 선택</Text>
                    </Pressable>
                  </View>
                  <View style={styles.paymentSheetListCard}>
                    <ScrollView
                      style={styles.paymentSheetScroll}
                      contentContainerStyle={styles.paymentSheetScrollContent}
                      showsVerticalScrollIndicator={false}
                      bounces={false}
                      overScrollMode="never"
                    >
                      {quickInputPaymentSheetItems
                        .filter((item) => item.type === quickInputPaymentSheetFilter)
                        .map((item, index, arr) => (
                          <View key={item.id}>
                            <Pressable
                              style={styles.paymentSheetItem}
                              onPress={() => handleQuickInputPaymentSelect(item.type, item)}
                            >
                              <View style={styles.paymentSheetItemLeft}>
                                <View style={[styles.paymentSheetDot, { backgroundColor: item.color }]} />
                                <View style={styles.paymentSheetItemTextBlock}>
                                  <Text style={styles.paymentSheetItemLabel} numberOfLines={1}>{item.label}</Text>
                                  {item.description.trim() ? (
                                    <Text style={styles.paymentSheetItemDescription} numberOfLines={1}>
                                      {item.description}
                                    </Text>
                                  ) : null}
                                </View>
                              </View>
                              {quickInputEditDraft?.paymentSubtypeLabel === item.label ? (
                                <Icon name="check" variant="line" size={24} color={atomicColors.blue[600]} />
                              ) : null}
                            </Pressable>
                            {index < arr.length - 1 ? <View style={styles.paymentSheetDivider} /> : null}
                          </View>
                        ))}
                    </ScrollView>
                  </View>
                  <View style={{ height: PAYMENT_SHEET_LIST_BOTTOM_GAP }} />
                  <ModalBottomsheetBottomInset backgroundColor={atomicColors.common[0]} />
                </View>
                </ModalBottomsheet>
              ) : null}
              {quickInputAmountKeypadMounted ? (
                <CustomKeypadOverlay style={styles.editAmountKeypadOverlay}>
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={handleQuickInputAmountKeypadClose}
                    accessibilityRole="button"
                    accessibilityLabel="금액 키패드 닫기"
                  />
                  <RNAnimated.View
                    style={{ transform: [{ translateY: amountKeypadTranslateYRef.current }] }}
                    pointerEvents={quickInputAmountKeypadVisible ? 'auto' : 'none'}
                  >
                    <CustomKeypad
                      value={quickInputEditDraft?.amount?.replace(/,/g, '') ?? ''}
                      onValueChange={handleQuickInputEditAmountChange}
                      onExpressionChange={setQuickInputEditAmountExpression}
                      onConfirm={handleQuickInputAmountKeypadConfirm}
                    />
                  </RNAnimated.View>
                </CustomKeypadOverlay>
              ) : null}
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
    left: 0,
    right: 0,
    bottom: 0,
  },
  normalInputStack: {
    gap: 12,
  },
  calculatorPanel: {
    gap: CALCULATOR_PANEL_GAP,
  },
  edgeContent: {
    marginHorizontal: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionChip: {
    height: 40,
    borderRadius: 24,
    backgroundColor: atomicColors.neutral[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  actionIconBox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  calculatorBar: {
    height: 64,
    borderRadius: 16,
    backgroundColor: atomicColors.neutral[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  calculatorInput: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: atomicColors.common[0],
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  calculatorExpressionContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  calculatorAmountText: {
  },
  calculatorOperatorText: {
    color: atomicColors.neutral[700],
  },
  calculatorUnitText: {
    fontFamily: 'Pretendard-Medium',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  calculatorActionButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: atomicColors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  editSheet: {
    backgroundColor: atomicColors.common[0],
  },
  editSheetContent: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  editSheetBody: {
    flex: 1,
    minHeight: 0,
    backgroundColor: atomicColors.neutral[100],
  },
  editSheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  editSheetForm: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 24,
    gap: 0,
  },
  editSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 8,
  },
  editSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  editSectionTitle: {
    color: atomicColors.common[100],
  },
  editRecurringButtonText: {
    color: colors.light.textAssistive,
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    textDecorationLine: 'underline',
  },
  editAmountValueWrap: {
    flex: 1,
    minHeight: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  editAmountValueText: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    textAlign: 'right',
  },
  requiredMark: {
    color: atomicColors.red[600],
  },
  editPaymentSticky: {
    height: 56,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    backgroundColor: atomicColors.neutral[100],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  editPaymentLabel: {
    color: atomicColors.neutral[900],
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  editPaymentControl: {
    width: 200,
  },
  editSheetCta: {
    backgroundColor: atomicColors.common[0],
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  categorySheet: {
    backgroundColor: atomicColors.common[0],
  },
  categorySheetContent: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  categorySheetBody: {
    flex: 1,
    minHeight: 0,
    backgroundColor: atomicColors.neutral[100],
    padding: 16,
  },
  categorySheetCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    backgroundColor: atomicColors.common[0],
    overflow: 'hidden',
  },
  categorySheetScroll: {
    flex: 1,
  },
  categorySheetScrollContent: {
    paddingBottom: 0,
  },
  categorySheetItem: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categorySheetItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  categorySheetEmoji: {
    width: 24,
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Bold',
    fontSize: 20,
    lineHeight: 30,
    includeFontPadding: false,
    textAlign: 'center',
  },
  categorySheetLabel: {
    flex: 1,
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  categorySheetDivider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: colors.light.border,
  },
  paymentSheetContent: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  paymentSheetBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 0,
    flexDirection: 'column',
    backgroundColor: atomicColors.neutral[100],
  },
  paymentSheetFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  paymentSheetChip: {
    height: 37,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: atomicColors.common[0],
    marginRight: 8,
  },
  paymentSheetChipActive: {
    backgroundColor: atomicColors.blue[600],
  },
  paymentSheetChipText: {
    color: atomicColors.neutral[600],
    fontFamily: 'Pretendard-Medium',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  paymentSheetChipTextActive: {
    color: atomicColors.common[0],
    fontFamily: 'Pretendard-Bold',
  },
  paymentSheetCashButton: {
    marginLeft: 'auto',
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentSheetCashEmoji: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Bold',
    fontSize: 21,
    lineHeight: 32,
    includeFontPadding: false,
  },
  paymentSheetCashText: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
    textDecorationLine: 'underline',
  },
  paymentSheetListCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    backgroundColor: atomicColors.common[0],
    overflow: 'hidden',
  },
  paymentSheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  paymentSheetScrollContent: {
    flexGrow: 1,
    paddingBottom: 0,
  },
  paymentSheetItem: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentSheetItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  paymentSheetDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: atomicColors.neutral[300],
  },
  paymentSheetItemTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  paymentSheetItemLabel: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  paymentSheetItemDescription: {
    color: atomicColors.neutral[600],
    fontFamily: 'Pretendard-Regular',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  paymentSheetDivider: {
    height: 1,
    marginHorizontal: 16,
    backgroundColor: atomicColors.neutral[300],
  },
  editAmountKeypadOverlay: {
    zIndex: 100020,
    elevation: 100020,
  },
  recurringSheetScroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: atomicColors.neutral[100],
  },
  recurringSheetScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 24,
  },
  sheetSection: {
    gap: 8,
  },
  recurringCard: {
    borderRadius: 16,
    backgroundColor: atomicColors.common[0],
    overflow: 'hidden',
  },
  recurringSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  recurringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  recurringSwitchLabel: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  recurringCaption: {
    color: atomicColors.neutral[600],
    fontFamily: 'Pretendard-Regular',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
    marginTop: 0,
  },
  recurringDivider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
    backgroundColor: atomicColors.neutral[300],
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  periodChip: {
    marginBottom: 0,
    width: '31.5%',
    height: 48,
  },
  recurringRadioRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekendOptionText: {
    color: atomicColors.common[100],
    fontFamily: 'Pretendard-Regular',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
});
