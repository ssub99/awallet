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
import { PARSE_EXPENSE_API_URL } from '@/constants/api';
import { useAppData } from '@/contexts/app-data-context';
import { useToast } from '@/contexts/toast-context';
import { applyPendingCalendarTargetEvent } from '@/hooks/calendar-events';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { isAtLeastVersion, QUICK_INPUT_MIN_VERSION } from '@/utils/app-version';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import {
  adjustWeekendDate,
  calculateRecurringIterations,
  getActualDayForMonth,
  getDayOfWeekLabel,
  getNextRecurringDate,
} from '@/utils/expense-calculations';
import { createExpense, type ExpenseRecord, type PaymentMethod } from '@/utils/expenses';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import { loadCategories } from '@/utils/categories';
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
const MAX_MESSAGE_LENGTH = 30;
/** 토큰 비용 절감: 호출 간격 제한 (ms). 이 시간 내 최대 RATE_LIMIT_MAX_REQUESTS회만 허용 */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
/** 토큰 비용 절감: 비기록 연속 N회 시 API 호출 잠금 */
const NON_RECORD_LOCK_THRESHOLD = 3;
const NON_RECORD_LOCK_MS = 30_000;

/** parse-expense API가 반환하는 기록 한 건 (확인 카드·기록 생성용) */
interface PendingParseRecord {
  category: string | null;
  date: string;
  amount: number;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  memo?: string;
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  totalMonths?: number;
  weekendOption?: 'weekend' | 'friday' | 'monday';
}

function formatDateDisplay(dateStr: string): string {
  const parts = dateStr.split('.');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const year = parseInt(y!, 10);
  const month = parseInt(m!, 10);
  const day = parseInt(d!, 10);
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

/** 메시지에서 정기/할부 의도 추론 후 record에 반영 (API 미반환 시 클라이언트 fallback) */
function applyMessageFallback(raw: PendingParseRecord, message: string): PendingParseRecord {
  const record = normalizePendingRecord(raw);
  const msg = message.trim();
  if (!msg) return record;
  const hasRecurring =
    /구독|매달|매월|월세|정기|매주|매일/.test(msg) || /subscription|monthly|recurring/.test(msg);
  const hasInstallment = /할부|\d+개월\s*할부/.test(msg);
  if (hasRecurring && !toBool(record.isRecurring) && !toBool(record.isInstallment)) {
    let recurringType = record.recurringType;
    if (!recurringType) {
      if (/매주|주간|weekly/.test(msg)) recurringType = '매주';
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
  const shouldIgnore =
    r.isRecurring && r.recurringType && ['매일', '주중', '주말'].includes(r.recurringType);
  if (shouldIgnore) return '주말 관계없이 기록';
  switch (r.weekendOption) {
    case 'friday':
      return '금주 금요일 기록';
    case 'monday':
      return '차주 월요일 기록';
    default:
      return '관계없이 주말 기록';
  }
}

export const QuickInputProvider = ({ children }: PropsWithChildren) => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { refresh } = useAppData();
  const [isQuickInputVisible, setIsQuickInputVisible] = useState(false);
  const [quickInputText, setQuickInputText] = useState('');
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

  const quickInputRef = useRef<TextInput>(null);
  const quickInputBackdropOpacity = useRef(new RNAnimated.Value(0)).current;
  const sendLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        const target = e.height + KEYBOARD_GAP;
        if (e.height > 0) {
          const rawDuration = e.duration > 0 && e.duration <= 1000 ? e.duration : 250;
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
        animatedBottom.value = e.height + KEYBOARD_GAP;
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
    const bottom = shortBottom ?? KEYBOARD_GAP;
    lastShortBottomRef.current = bottom;
    shortBottomFromScreen.value = bottom;
    animatedBottom.value = bottom;
    setIsQuickInputVisible(true);
  }, []);

  const setQuickInputTextTruncated = useCallback((text: string) => {
    setQuickInputText(text.slice(0, MAX_MESSAGE_LENGTH));
  }, []);

  const hideQuickInput = useCallback(() => {
    if (sendLoadingTimerRef.current) {
      clearTimeout(sendLoadingTimerRef.current);
      sendLoadingTimerRef.current = null;
    }
    Keyboard.dismiss();
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

  const handleSend = useCallback(async () => {
    if (!quickInputText.trim()) return;
    if (confirmCardData != null) {
      showToast('먼저 생성한 기록을 확인해 주세요.');
      return;
    }
    const message = quickInputText.trim();

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

    if (sendLoadingTimerRef.current) return;
    setIsQuickInputSendLoading(true);

    try {
      const categoryList = await loadCategories('expense');
      const categories = categoryList.map((c) => c.label);
      const date = new Date();
      const today = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;

      const res = await fetch(PARSE_EXPENSE_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, categories, today }),
      });

      const data = (await res.json()) as {
        records?: PendingParseRecord[];
        suggestedCategory?: { label: string; emoji: string } | null;
        reply?: string | null;
      };

      if (!res.ok) {
        showToast(data?.reply ?? '요청 처리에 실패했습니다.');
        return;
      }

      const records = data.records ?? [];
      const suggested = data.suggestedCategory;

      if (records.length === 0) {
        nonRecordCountRef.current += 1;
        if (nonRecordCountRef.current >= NON_RECORD_LOCK_THRESHOLD) {
          lockEndTimeRef.current = Date.now() + NON_RECORD_LOCK_MS;
        }
        showToast('지출하신 소비내역을 입력해 주세요.');
        return;
      }

      nonRecordCountRef.current = 0;
      const firstRaw = records[0] as PendingParseRecord;
      const first = applyMessageFallback(firstRaw, message);
      pendingRecordRef.current = first;

      const categoryLabel = first.category ?? suggested?.label ?? '기타';
      const matchedCategory = categoryList.find((c) => c.label === categoryLabel);
      const categoryEmoji = matchedCategory?.emoji ?? suggested?.emoji ?? '';

      setConfirmCardData({
        category: categoryLabel,
        categoryEmoji: categoryEmoji || undefined,
        date: formatDateDisplay(first.date),
        amount: formatAmount(first.amount),
        paymentType: paymentMethodToLabel(first.paymentMethod),
        repeatOption1: getRepeatOption1(first),
        repeatOption2: getRepeatOption2(first),
        repeatOption3: getRepeatOption3(first),
      });
    } catch {
      showToast('요청 처리에 실패했습니다.');
      // 토큰 비용 절감: 실패 시 자동 재시도 없음 (사용자가 다시 보내기 시에만 재요청)
    } finally {
      setIsQuickInputSendLoading(false);
    }
  }, [quickInputText, confirmCardData, showToast]);

  const handleConfirmCardAdd = useCallback(async () => {
    const pending = pendingRecordRef.current;
    if (!pending) {
      setConfirmCardData(null);
      hideQuickInput();
      return;
    }
    setIsQuickInputConfirmAdding(true);
    try {
      const dateStr = pending.date;
      const [y, m, d] = dateStr.split('.');
      const year = parseInt(y ?? '0', 10);
      const month = parseInt(m ?? '0', 10);
      const day = parseInt(d ?? '0', 10);
      const dateObj = new Date(year, month - 1, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
      const isWeekday = !isWeekendDay;

      const isRecurring = !!pending.isRecurring;
      const isInstallment = !!pending.isInstallment;
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

      const expenseAmount = pending.amount;
      let monthlyAmount: number;
      if (isInstallment) {
        const baseAmount = Math.floor(expenseAmount / totalMonths);
        const remainder = expenseAmount - baseAmount * totalMonths;
        monthlyAmount = baseAmount + remainder;
      } else {
        monthlyAmount = expenseAmount;
      }

      const recordsToSave: ExpenseRecord[] = [];
      const baseRecord: ExpenseRecord = {
        type: 'expense',
        id: recordId,
        amount: monthlyAmount,
        category: pending.category ?? '기타',
        date: actualDate,
        timestamp: newTimestamp,
        paymentMethod: (pending.paymentMethod as PaymentMethod) ?? 'credit',
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

      for (const record of recordsToSave) {
        await createExpense(record);
      }
      await refresh();
      await refreshWidgetWithCurrentMonth().catch(() => {});

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
        applyPendingCalendarTargetEvent.emit();
      } catch {
        // ignore
      }

      pendingRecordRef.current = null;
      setConfirmCardData(null);
      hideQuickInput();
      showToast('기록 생성이 완료되었습니다.');
    } catch {
      showToast('기록 저장에 실패했습니다.');
    } finally {
      setIsQuickInputConfirmAdding(false);
    }
  }, [hideQuickInput, refresh, showToast]);

  const handleConfirmCardCancel = useCallback(() => {
    setConfirmCardData(null);
  }, []);

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
                <View style={[styles.confirmCardContainer, { top: insets.top + 16 }]}>
                  <QuickInputConfirmCard
                    data={confirmCardData}
                    onConfirm={handleConfirmCardAdd}
                    onCancel={handleConfirmCardCancel}
                    addLoading={isQuickInputConfirmAdding}
                  />
                </View>
              )}
              <Animated.View style={[styles.container, containerAnimatedStyle]}>
                <QuickInputField
                  ref={quickInputRef}
                  value={quickInputText}
                  onChangeText={setQuickInputTextTruncated}
                  placeholder="메세지 입력(카테고리, 날짜, 금액)"
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
  },
});
