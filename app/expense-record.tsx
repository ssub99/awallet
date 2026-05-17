/**
 * Expense Record Screen
 * 
 * Allows users to create or edit an expense record.
 * Supports both create and edit modes.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Accordion } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { BasicCalendarDaySelect } from '@/components/ui/calendar-day-basic';
import { CalendarDaySelect } from '@/components/ui/calendar-day-select';
import { Chip } from '@/components/ui/chip';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { PrepaymentModal } from '@/components/ui/prepayment-modal';
import { Radio } from '@/components/ui/radio';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent, logExpenseAdjustment, logExpenseCreateComplete, mapRefundOptionToAnalytics } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { getCustomMonthInfo } from '@/utils/custom-month';
import { getRecurringWeekendOptionDisplayLabel } from '@/utils/expense-calculations';
import { initializePaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import {
  buildExpenseCreationCompletionPayload,
  buildExpenseLifecycleAnalyticsPayload,
  createExpense,
  deleteExpense,
  deleteExpensesByGroup,
  expenseCreationVariantFromInstallmentFlags,
  expenseCreationVariantFromRecord,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  type ExpenseRecord as ExpenseRecordType,
  type PaymentMethod,
} from '@/utils/expenses';
import { extractTimestampFromId, generateGroupId, generateRecordId } from '@/utils/id-generator';
import { getAllIncomes } from '@/utils/incomes';
import { rescheduleDailyReminderIfNeeded } from '@/utils/notification-scheduler';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Keyboard,
    Modal,
    NativeSyntheticEvent,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInputKeyPressEventData,
    useWindowDimensions,
    View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

interface ExpenseRecordProps {
  mode?: 'create' | 'edit';
  editData?: any;
}

type CalendarBucket = {
  totalExpense: number;
  totalIncome: number;
  records: any[];
};

/**
 * 해당 월의 실제 일자 계산 (월말 처리)
 * 예: 2월 31일 → 2월 28일 (마지막 날)
 */
function getActualDayForMonth(year: number, month: number, desiredDay: number): number {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return Math.min(desiredDay, lastDayOfMonth);
}

/**
 * 해당 년도 내에 있는지 확인
 */
function isWithinYear(dateString: string, targetYear: number): boolean {
  const [year] = dateString.split('.').map(Number);
  return year === targetYear;
}

/**
 * recurringType에 따른 다음 날짜 계산
 * @param currentDate 현재 날짜 (YYYY.MM.DD 형식)
 * @param recurringType 반복 타입
 * @param iteration 현재 반복 횟수 (0부터 시작, 현재는 사용하지 않음)
 * @param startYear 시작 년도 (해당 년도 내에서만 생성)
 * @returns 다음 날짜 (YYYY.MM.DD 형식) 또는 null (해당 년도 초과 시)
 */
function getNextRecurringDate(
  currentDate: string,
  recurringType: string,
  iteration: number,
  startYear: number
): string | null {
  const [year, month, day] = currentDate.split('.').map(Number);
  const dateObj = new Date(year, month - 1, day);
  
  let nextDate: Date;
  
  switch (recurringType) {
    case '매일':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 1);
      break;
    case '매주':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 7);
      break;
    case '2주':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 14);
      break;
    case '3주':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 21);
      break;
    case '4주':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 28);
      break;
    case '매월':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 1);
      break;
    case '2개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 2);
      break;
    case '4개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 4);
      break;
    case '6개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 6);
      break;
    case '주중':
      // 다음 평일 찾기 (월~금)
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 1);
      while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
    case '주말':
      // 다음 주말 찾기 (토~일)
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 1);
      while (nextDate.getDay() !== 0 && nextDate.getDay() !== 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
    default:
      // 기본값: 매월
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 1);
      break;
  }
  
  // 해당 년도 내에 있는지 확인
  const nextYear = nextDate.getFullYear();
  if (nextYear > startYear) {
    return null; // 해당 년도 초과
  }
  
  const nextYearNum = nextDate.getFullYear();
  const nextMonthNum = nextDate.getMonth() + 1;
  const nextDayNum = nextDate.getDate();
  
  // 월말 처리
  const actualDay = getActualDayForMonth(nextYearNum, nextMonthNum, nextDayNum);
  
  return `${nextYearNum}.${String(nextMonthNum).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
}

/**
 * recurringType에 따른 반복 횟수 계산 (해당 년도 내에서)
 * @param startDate 시작 날짜 (YYYY.MM.DD 형식)
 * @param recurringType 반복 타입
 * @returns 반복 횟수
 */
function calculateRecurringIterations(startDate: string, recurringType: string): number {
  const [startYear, startMonth, startDay] = startDate.split('.').map(Number);
  const startDateObj = new Date(startYear, startMonth - 1, startDay);
  const endOfYear = new Date(startYear, 11, 31); // 12월 31일
  
  let iterations = 0;
  let currentDate = new Date(startDateObj);
  
  // 시작일 포함하여 계산
  while (currentDate <= endOfYear) {
    iterations++;
    
    // 다음 날짜 계산
    switch (recurringType) {
      case '매일':
        currentDate.setDate(currentDate.getDate() + 1);
        break;
      case '매주':
        currentDate.setDate(currentDate.getDate() + 7);
        break;
      case '2주':
        currentDate.setDate(currentDate.getDate() + 14);
        break;
      case '3주':
        currentDate.setDate(currentDate.getDate() + 21);
        break;
      case '4주':
        currentDate.setDate(currentDate.getDate() + 28);
        break;
      case '매월':
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
      case '2개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 2);
        break;
      case '4개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 4);
        break;
      case '6개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 6);
        break;
      case '주중':
        // 다음 평일 찾기
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate <= endOfYear && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        break;
      case '주말':
        // 다음 주말 찾기
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate <= endOfYear && currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        break;
      default:
        // 기본값: 매월
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
    }
    
    // 년도 초과 확인
    if (currentDate.getFullYear() > startYear) {
      break;
    }
  }
  
  return iterations;
}

// ===== 삭제 기능 유틸리티 함수들 =====

/**
 * 개발 환경 로그 유틸은 현재 사용되지 않음 (정리)
 */

/**
 * 날짜 형식 변환 유틸리티
 */
const formatDateKey = (date: string): string => date.replace(/\./g, '-');

const parseRecordDate = (dateValue?: string, fallback?: Date): Date => {
  if (typeof dateValue === 'string' && dateValue.trim().length > 0) {
    const normalized = dateValue.replace(/\./g, '-');
    const [yearStr, monthStr, dayStr] = normalized.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return new Date(year, month - 1, day, 12, 0, 0);
    }
  }

  if (fallback && !Number.isNaN(fallback.getTime())) {
    return new Date(fallback.getTime());
  }

  return new Date();
};

/**
 * 정기 기록 기간 계산 유틸리티
 */
const calcPeriod = (editData: any, totalMonths: number) => {
  // 정기기록 또는 할부 기록의 실제 원본 시작일은 ID(timestamp)를 기준으로 계산
  // 정기 기록: recurringId, 할부 기록: installmentId
  const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
  
  const fallbackTimestamp =
    typeof editData.createdAt === 'number' ? editData.createdAt :
    typeof editData.timestamp === 'number' ? editData.timestamp :
    Date.now();

  const extractedTimestamp = extractTimestampFromId(idToUse);
  const originalStartDate = new Date(extractedTimestamp ?? fallbackTimestamp);

  if (Number.isNaN(originalStartDate.getTime())) {
    const editDate = parseRecordDate(editData.date, new Date(fallbackTimestamp));
    const editYear = editDate.getFullYear();
    const editMonth = editDate.getMonth() + 1;

    return {
      startYear: editYear,
      startMonth: editMonth,
      editYear,
      editMonth,
      totalMonths,
      originalStartDate: editDate,
      originalStartYear: editYear,
      originalStartMonth: editMonth
    };
  }

  const originalStartYear = originalStartDate.getFullYear();
  const originalStartMonth = originalStartDate.getMonth() + 1;
  
  const editDate = parseRecordDate(editData.date, originalStartDate);
  const editYear = editDate.getFullYear();
  const editMonth = editDate.getMonth() + 1;
  
  // "오늘만 삭제"의 경우 편집 시도 일자를 새로운 시작일로 설정
  // 다른 경우에는 원본 시작일을 유지
  const startYear = originalStartYear;
  const startMonth = originalStartMonth;
  
  return { 
    startYear, 
    startMonth, 
    editYear, 
    editMonth, 
    totalMonths: totalMonths,
    originalStartDate,
    originalStartYear,
    originalStartMonth
  };
};

/**
 * 정기 기록의 마지막 날짜 계산
 * @param startYear 시작 년도
 * @param startMonth 시작 월
 * @param totalMonths 총 개월 수
 * @param recurringType 반복 타입 (선택적, 있으면 해당 년도 12월 31일까지)
 */
const calcEndDate = (startYear: number, startMonth: number, totalMonths: number, recurringType?: string) => {
  // recurringType이 있고, 매일/매주/2주/3주/4주/주중/주말인 경우 해당 년도 12월 31일까지
  if (recurringType && ['매일', '매주', '2주', '3주', '4주', '주중', '주말'].includes(recurringType)) {
    return { actualEndYear: startYear, actualEndMonth: 12 };
  }
  
  // 기존 로직: totalMonths 기반 계산
  const actualEndYear = startYear + Math.floor((startMonth + totalMonths - 2) / 12);
  const actualEndMonth = ((startMonth + totalMonths - 2) % 12) + 1;
  return { actualEndYear, actualEndMonth };
};

/**
 * 요일 계산 유틸리티
 */
const getWeekdayLabel = (date: Date): string => {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return weekdays[date.getDay()];
};

/**
 * 날짜 비교 유틸리티
 */
const isSameDate = (recordDate: string, currentDate: Date): boolean => {
  const recordDateKey = formatDateKey(recordDate);
  const currentDateKey = currentDate.toISOString().split('T')[0];
  return recordDateKey === currentDateKey;
};

// 사용되지 않는 미래 날짜 확인 유틸 제거

/**
 * 삭제 옵션별 기록 필터링
 */
const shouldMatchScope = (
  record: any, 
  deleteOption: 'all' | 'today' | 'future', 
  currentDate: Date,
  startYear: number,
  startMonth: number,
  editYear?: number,
  editMonth?: number,
  editDay?: number
): boolean => {
  switch (deleteOption) {
    case 'all':
      return true;
    case 'today':
      // 편집하려는 날짜와 비교 (editYear, editMonth, editDay가 있으면 사용)
      if (editYear && editMonth && editDay) {
        // 로컬 시간대로 편집 날짜 생성 (시간대 문제 방지)
        const editDate = new Date(editYear, editMonth - 1, editDay, 12, 0, 0); // 정오로 설정하여 시간대 문제 방지
        const result = isSameDate(record.date, editDate);
        
        
        
        return result;
      } else {
        const result = isSameDate(record.date, currentDate);
        
        
        
        return result;
      }
    case 'future':
      // 편집 중인 날짜가 있으면 그 날짜를 기준으로, 없으면 현재 날짜를 기준으로
      const baseYear = editYear || currentDate.getFullYear();
      const baseMonth = editMonth || (currentDate.getMonth() + 1);
      const baseDay = editDay || currentDate.getDate();
      
      const isFirstData = baseYear === startYear && baseMonth === startMonth;
      
      if (isFirstData) {
        return true; // 첫 번째 데이터에서는 전체 삭제와 동일
      } else {
        // 편집 중인 날짜를 문자열로 변환하여 비교 (YYYY-MM-DD 형식)
        const editDateKey = `${baseYear}-${String(baseMonth).padStart(2, '0')}-${String(baseDay).padStart(2, '0')}`;
        const recordDateKey = formatDateKey(record.date);
        const shouldDeleteRecord = recordDateKey >= editDateKey;
        
        
        
        return shouldDeleteRecord;
      }
    default:
      return false;
  }
};

// 사용되지 않는 상수 제거

/**
 * 정기 기록의 기간을 계산하는 함수
 * @param startDate 시작 날짜 (YYYY.MM.DD 형식)
 * @param months 총 개월 수
 * @param recurringType 반복 타입 (선택적, 있으면 해당 년도 12월까지)
 */
function getRecurringPeriod(startDate: string, months: number, recurringType?: string): string {
  const [year, month, day] = startDate.split('.').map(Number);
  const start = new Date(year, month - 1, day);
  
  let end: Date;
  
  // recurringType이 있고, 매일/매주/2주/3주/4주/주중/주말인 경우 해당 년도 12월까지
  if (recurringType && ['매일', '매주', '2주', '3주', '4주', '주중', '주말'].includes(recurringType)) {
    end = new Date(year, 11, 31); // 12월 31일
  } else {
    // 기존 로직: months - 1을 빼서 정확한 개월 수 계산
    end = new Date(year, month - 1 + months - 1, day);
  }
  
  const startStr = `${String(start.getFullYear()).slice(-2)}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${String(end.getFullYear()).slice(-2)}/${String(end.getMonth() + 1).padStart(2, '0')}`;
  
  return `${startStr} - ${endStr}`;
}

export default function ExpenseRecordScreen({ mode = 'create', editData }: ExpenseRecordProps = {}) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const KEYPAD_HEIGHT = getKeypadHeight(windowWidth);
  const { setLoading } = useLoading();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ 
    category?: string; 
    selectedDate?: string;
    calendarYear?: string;
    calendarMonth?: string;
    dateKey?: string;
  }>();
  const analyticsScreenName = mode === 'edit' ? '/expense-edit' : '/expense-record';
  const scrollViewRef = useRef<ScrollView>(null);

  // Form state
  const today = new Date();
  const formattedToday = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
  
  // 선택된 날짜가 있으면 해당 날짜를 사용, 없으면 오늘 날짜 사용
  const getInitialDate = () => {
    if (params.selectedDate) {

      // "2025-01-15" 형식을 "2025.01.15" 형식으로 변환
      return params.selectedDate.replace(/-/g, '.');
    }
    return formattedToday;
  };
  
  const [category, setCategory] = useState<string>(params.category || '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit');
  const [selectedPaymentSubtypeId, setSelectedPaymentSubtypeId] = useState<string>('');

  interface GoHomeOptions {
    year: number;
    month: number;
    targetDate: string;
    refresh?: boolean;
  }

  // 공통: 홈으로 이동 + 지정 날짜 포커스 (네비 혼용/레이스 방지)
  const goHomeWithFocus = useCallback(
    async ({ year, month, targetDate, refresh = true }: GoHomeOptions) => {
      console.log('[NAV] goHomeWithFocus:start', { year, month, targetDate, refresh });
      try {
        await AsyncStorage.setItem(
          'pendingCalendarTarget',
          JSON.stringify({ year, month, targetDate })
        );
        console.log('[NAV] goHomeWithFocus:pendingCalendarTarget:stored');
      } catch (error) {
        console.warn('[NAV] goHomeWithFocus:pendingCalendarTarget:error', error);
      }

      (navigation as any).reset({
        index: 0,
        routes: [
          {
            name: '(tabs)',
            params: {
              screen: 'home',
              params: {
                targetYear: year.toString(),
                targetMonth: month.toString(),
                targetDate,
                periodType: 'month',
              },
            },
          },
        ],
      });
      console.log('[NAV] goHomeWithFocus:navigation.reset:called');

      if (refresh) {
        // InteractionManager 제거 - 즉시 새로고침하여 지연 방지
        console.log('[NAV] goHomeWithFocus:emit refresh');
        calendarRefreshEvent.emit();
      }
    },
    [navigation]
  );

  /** 수정 저장 후: 스택을 (tabs)+타임라인 2단만 두고 타임라인을 최상단으로 (push 누적 없음) */
  const goTimelineWithFocusAfterSave = useCallback(
    async ({ year, month, targetDate, refresh = true }: GoHomeOptions) => {
      try {
        await AsyncStorage.setItem(
          'pendingCalendarTarget',
          JSON.stringify({ year, month, targetDate })
        );
      } catch (error) {
        console.warn('[NAV] goTimelineWithFocusAfterSave:pendingCalendarTarget:error', error);
      }

      (navigation as any).reset({
        index: 1,
        routes: [
          {
            name: '(tabs)',
            params: {
              screen: 'home',
              params: {
                targetYear: year.toString(),
                targetMonth: month.toString(),
                targetDate,
                periodType: 'month',
              },
            },
          },
          {
            name: 'monthly-expense-timeline',
            params: {
              year: year.toString(),
              month: month.toString(),
              selectedDate: targetDate,
            },
          },
        ],
      });

      if (refresh) {
        calendarRefreshEvent.emit();
      }
    },
    [navigation]
  );

  const goTimelineWithFocus = useCallback(async (_dateKey: string) => {
    calendarRefreshEvent.emit();
    router.back();
  }, [router]);
  
  // 카테고리 state 변경 감지
  useEffect(() => {
    // 카테고리 변경 시 필요한 로직이 있다면 여기에 추가
  }, [category]);
  const [amount, setAmount] = useState<string>('');
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const keypadTranslateY = useRef(new Animated.Value(KEYPAD_HEIGHT)).current;
  const keypadBackdropOpacity = useRef(new Animated.Value(0)).current;
  const [isMemoFocused, setIsMemoFocused] = useState(false);
  
  // 금액 입력 시 처리하는 함수 (Input 컴포넌트에서 이미 포맷팅됨)
  const handleAmountChange = (text: string) => {
    // 콤마 제거 후 숫자만 추출
    const numbersOnly = text.replace(/,/g, '');
    
    // 빈 문자열이면 그대로 설정
    if (!numbersOnly) {
      setAmount('');
      return;
    }
    
    // 숫자로 변환
    const num = parseInt(numbersOnly, 10);
    
    // 최대값 제한: 10억 (1,000,000,000)
    const MAX_AMOUNT = 1000000000;
    if (num > MAX_AMOUNT) {
      // 최대값으로 제한
      setAmount(MAX_AMOUNT.toLocaleString());
      return;
    }
    
    // 포맷팅된 값으로 설정
    setAmount(num.toLocaleString());
  };

  const formatAmountDisplay = useCallback((raw: string) => {
    if (!raw) return '0';
    const numeric = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(numeric)) return raw;
    return numeric.toLocaleString();
  }, []);

  const getRgbaColor = useCallback((hex: string, opacity: number) => {
    const normalized = hex.replace('#', '');
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }, []);

  const keypadTintColor = useMemo(
    () => getRgbaColor(AtomicColors.neutral[300], 0.8),
    [getRgbaColor]
  );

  const getOperatorSymbol = useCallback((operator: CustomKeypadOperator) => {
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

  const amountExpressionView = useMemo(() => {
    const tokensToRender =
      amountExpression.length > 0
        ? amountExpression
        : [{ type: 'number', value: amount.replace(/,/g, '') || '0' }];

    // 할부/환불 기록 수정 모드에서 disabled 상태 확인
    const isAmountDisabled =
      mode === 'edit' &&
      (
        editData?.isInstallment ||
        (!!editData?.isRefunded && !editData?.isInstallment) ||
        !!editData?.isSettled
      );
    const textColor = isAmountDisabled ? colors.textDisabled : colors.text;
    const operatorColor = isAmountDisabled ? colors.textDisabled : colors.textNeutral;

    return (
      <ScrollView
        horizontal
        scrollEnabled={false}
        pointerEvents="none"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.amountExpression}
      >
        {tokensToRender.map((token, index) => {
          if (token.type === 'number') {
            return (
              <Text key={`num-${index}`} style={[styles.amountExpressionText, { color: textColor }]}>
                {formatAmountDisplay(token.value)}
              </Text>
            );
          }

          const symbol = getOperatorSymbol(token.value as CustomKeypadOperator);
          if (!symbol) return null;

          return (
            <Text
              key={`op-${index}`}
              style={[styles.amountExpressionOperator, { color: operatorColor }]}
              accessibilityLabel="연산자"
            >
              {symbol}
            </Text>
          );
        })}
      </ScrollView>
    );
  }, [
    amount,
    amountExpression,
    colors.text,
    colors.textDisabled,
    colors.textNeutral,
    formatAmountDisplay,
    getOperatorSymbol,
    mode,
    editData?.isInstallment,
    editData?.isRefunded,
    editData?.isSettled,
  ]);

  useEffect(() => {
    if (isKeypadVisible) {
      setIsKeypadMounted(true);
      keypadTranslateY.setValue(KEYPAD_HEIGHT);
      keypadBackdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(keypadTranslateY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(keypadBackdropOpacity, {
          toValue: 1,
          duration: 100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (isKeypadMounted) {
      Animated.parallel([
        Animated.timing(keypadTranslateY, {
          toValue: KEYPAD_HEIGHT,
          duration: 300,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(keypadBackdropOpacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setIsKeypadMounted(false);
        }
      });
    }
  }, [isKeypadMounted, isKeypadVisible, keypadBackdropOpacity, keypadTranslateY]);
  const [date, setDate] = useState<string>(getInitialDate());
  const [displayDate, setDisplayDate] = useState<string>(getInitialDate());
  const [prepaymentDate, setPrepaymentDate] = useState<string>(getInitialDate());
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [memo, setMemo] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  // 정기 기록과 할부 기록 모두에서 사용하는 기간 개월수 (상호 배타적)
  const [totalMonths, setTotalMonths] = useState<number>(2); // 2개월~12개월
  const [isInstallment, setIsInstallment] = useState<boolean>(false); // 할부
  const [hasSelectedInstallment, setHasSelectedInstallment] = useState<boolean>(false); // 할부 옵션을 한 번이라도 선택했는지 추적
  const [isPeriodExpanded, setIsPeriodExpanded] = useState(false);
  const [weekendOption, setWeekendOption] = useState<'weekend' | 'friday' | 'monday'>('weekend');
  // 정기 옵션의 반복 형태 (매일, 매주, 2주, 3주, 4주, 매월, 2개월 마다, 4개월 마다, 6개월 마다, 주중, 주말)
  const [recurringType, setRecurringType] = useState<string>('매월');
  const recurringPeriodOptions = useMemo(
    () => ['매일', '매주', '매월', '2주', '3주', '4주', '2개월 마다', '4개월 마다', '6개월 마다', '주중', '주말'],
    []
  );
  const installmentPeriodOptions = useMemo(() => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], []);
  
  // 반복/할부 설정 바텀시트 표시 여부
  const [showRecurringInstallmentSheet, setShowRecurringInstallmentSheet] = useState<boolean>(false);
  const [showPaymentTypeSheet, setShowPaymentTypeSheet] = useState<boolean>(false);
  const [paymentTypeSheetFilter, setPaymentTypeSheetFilter] = useState<'credit' | 'debit'>('credit');
  const PAYMENT_TYPE_SHEET_NAV_HEIGHT = 56;
  const PAYMENT_TYPE_SHEET_FILTER_ROW_HEIGHT = 37;
  const PAYMENT_TYPE_SHEET_TOP_PADDING = 16;
  const PAYMENT_TYPE_SHEET_FILTER_LIST_GAP = 16;
  const PAYMENT_TYPE_SHEET_LIST_HOME_GAP = 16;
  const PAYMENT_TYPE_SHEET_HOME_INDICATOR_HEIGHT = 34;
  const paymentTypeSheetHeight = useMemo(() => windowHeight * 0.5, [windowHeight]);
  const paymentTypeSheetContentHeight = useMemo(
    () => Math.max(0, paymentTypeSheetHeight - PAYMENT_TYPE_SHEET_NAV_HEIGHT),
    [paymentTypeSheetHeight]
  );

  // date state 변경 감지
  useEffect(() => {
    // 날짜 변경 시 tempSelectedDate 동기화 (바텀시트가 닫힌 상태에서만)
    if (showDatePicker) {
      return;
    }
    setTempSelectedDate(date.replace(/\./g, '-'));
  }, [date, showDatePicker]);

  // 반복/할부 바텀시트 열릴 때 main → draft 동기화 (확인 전에는 main 변경 없음)
  useEffect(() => {
    if (showRecurringInstallmentSheet) {
      setDraftIsRecurring(isRecurring);
      setDraftIsInstallment(isInstallment);
      setDraftHasSelectedInstallment(hasSelectedInstallment);
      setDraftRecurringType(recurringType);
      setDraftTotalMonths(totalMonths);
      setDraftWeekendOption(weekendOption);
      setDraftSelectedDay(selectedDay);
      setDraftIsPeriodExpanded(isPeriodExpanded);
    }
  }, [showRecurringInstallmentSheet]);

  // 반복/할부 바텀시트 내부 드래프트 (확인 시에만 main에 반영)
  const [draftIsRecurring, setDraftIsRecurring] = useState<boolean>(false);
  const [draftIsInstallment, setDraftIsInstallment] = useState<boolean>(false);
  const [draftHasSelectedInstallment, setDraftHasSelectedInstallment] = useState<boolean>(false);
  const [draftRecurringType, setDraftRecurringType] = useState<string>('매월');
  const [draftTotalMonths, setDraftTotalMonths] = useState<number>(2);
  const [draftWeekendOption, setDraftWeekendOption] = useState<'weekend' | 'friday' | 'monday'>('weekend');
  const [draftSelectedDay, setDraftSelectedDay] = useState<number>(new Date().getDate());
  const [draftIsPeriodExpanded, setDraftIsPeriodExpanded] = useState(false);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [showDayPicker, setShowDayPicker] = useState<boolean>(false);
  const [tempSelectedDate, setTempSelectedDate] = useState<string>(date.replace(/\./g, '-'));
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    // 수정 모드이고 editData가 있으면 해당 날짜의 일자 사용
    if (mode === 'edit' && editData?.date) {
      const editDate = new Date(editData.date);
      return editDate.getDate();
    }
    
    // 캘린더에서 선택한 날짜가 있으면 해당 날짜의 일자 사용
    if (params.selectedDate) {
      const selectedDateObj = new Date(params.selectedDate);
      return selectedDateObj.getDate();
    }
    
    // 기본값은 오늘 일자
    return new Date().getDate();
  });
  const [showAmountAlert, setShowAmountAlert] = useState<boolean>(false);
  const [showWeekendConfirm, setShowWeekendConfirm] = useState<boolean>(false);
  // showPeriodNativePicker는 더 이상 사용하지 않음 (Selectbox로 대체)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [showNoChangesModal, setShowNoChangesModal] = useState<boolean>(false);
  const [showEditConfirmModal, setShowEditConfirmModal] = useState<boolean>(false);
  const [editConfirmMessage, setEditConfirmMessage] = useState<string>('');
  const [showRefundEditConfirmModal, setShowRefundEditConfirmModal] = useState<boolean>(false);
  const [refundEditConfirmMessage, setRefundEditConfirmMessage] = useState<string>('');
  const [showRecurringToast, setShowRecurringToast] = useState<boolean>(false);
  const [recurringToastMessage, setRecurringToastMessage] = useState<string>('');
  const [showCategoryToast, setShowCategoryToast] = useState<boolean>(false);
  const [categoryToastMessage, setCategoryToastMessage] = useState<string>('');
  const [showDateSelectToast, setShowDateSelectToast] = useState<boolean>(false);
  const [dateSelectToastMessage, setDateSelectToastMessage] = useState<string>('');
  const [showPrepaymentToast, setShowPrepaymentToast] = useState<boolean>(false);
  const [prepaymentToastMessage, setPrepaymentToastMessage] = useState<string>('');
  const [showWeekendOptionToast, setShowWeekendOptionToast] = useState<boolean>(false);
  
  // 할부 기록 환불 처리 옵션 모달
  const [showRefundOptions, setShowRefundOptions] = useState<boolean>(false);
  const [refundOption, setRefundOption] = useState<'all' | 'today' | 'future'>('all');
  const [refundRestoreOption, setRefundRestoreOption] = useState<'all' | 'today' | 'future'>('all');
  
  // 환불 처리 복구 모달
  const [showRefundRestore, setShowRefundRestore] = useState<boolean>(false);
  // 결산 처리 복구 모달
  const [showSettlementRestore, setShowSettlementRestore] = useState<boolean>(false);
  // 일반 기록 환불 처리 확인 모달
  const [showSingleRefundConfirm, setShowSingleRefundConfirm] = useState<boolean>(false);
  // 선결제 처리 복구 모달
  const [showPrepaymentRestore, setShowPrepaymentRestore] = useState<boolean>(false);
  // 선결제 모달
  const [showPrepaymentModal, setShowPrepaymentModal] = useState<boolean>(false);
  // 결산 처리 안내 모달
  const [showSettlementConfirmModal, setShowSettlementConfirmModal] = useState<boolean>(false);

  useEffect(() => {
    if (!showNoChangesModal) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'none',
    });
  }, [analyticsScreenName, showNoChangesModal]);

  const applyPaymentMethod = useCallback((val: PaymentMethod) => {
    setPaymentMethod(val);
  }, []);

  const handleOpenPaymentTypeSheet = useCallback(() => {
    void logEvent('ui', {
      screen_name: analyticsScreenName,
      target: 'payment',
    });
    void logEvent('sheet_view', {
      screen_name: analyticsScreenName,
      target: 'payment',
    });
    setPaymentTypeSheetFilter(paymentMethod === 'debit' ? 'debit' : 'credit');
    setShowPaymentTypeSheet(true);
  }, [analyticsScreenName, paymentMethod]);

  const handlePaymentTypeSheetClose = useCallback(() => {
    void logEvent('btn', {
      screen_name: analyticsScreenName,
      target: 'payment-close',
    });
    setShowPaymentTypeSheet(false);
  }, [analyticsScreenName]);

  const handlePaymentTypeSelect = useCallback((val: PaymentMethod, subtypeId?: string) => {
    if (val === 'cash') {
      void logEvent('btn', {
        screen_name: analyticsScreenName,
        target: 'payment-cash',
      });
    } else {
      void logEvent('list', {
        screen_name: analyticsScreenName,
        target: val === 'credit' ? 'payment-credit' : 'payment-debit',
      });
    }
    applyPaymentMethod(val);
    if (subtypeId) {
      setSelectedPaymentSubtypeId(subtypeId);
    }
    setShowPaymentTypeSheet(false);
  }, [analyticsScreenName, applyPaymentMethod]);

  const [paymentTypeSheetItems, setPaymentTypeSheetItems] = useState<
    Array<{ id: string; type: 'credit' | 'debit'; label: string; description: string; color: string }>
  >([]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const loadItems = async () => {
        try {
          const subtypes = await initializePaymentSubtypes();
          if (!isActive) return;
          setPaymentTypeSheetItems(
            subtypes.map((item: PaymentSubtype) => ({
              id: item.id,
              type: item.type,
              label: item.label,
              description: item.description,
              color: item.color,
            }))
          );
        } catch (error) {
          console.error('결제 유형 목록 로드 실패:', error);
        }
      };
      void loadItems();
      return () => {
        isActive = false;
      };
    }, [])
  );

  const defaultCreditSubtypeId = useMemo(
    () => paymentTypeSheetItems.find((item) => item.type === 'credit')?.id ?? 'credit-default',
    [paymentTypeSheetItems]
  );
  const defaultDebitSubtypeId = useMemo(
    () => paymentTypeSheetItems.find((item) => item.type === 'debit')?.id ?? 'debit-default',
    [paymentTypeSheetItems]
  );
  const selectedPaymentSubtype = useMemo(
    () => paymentTypeSheetItems.find((item) => item.id === selectedPaymentSubtypeId),
    [paymentTypeSheetItems, selectedPaymentSubtypeId]
  );

  useEffect(() => {
    if (paymentMethod === 'credit' && selectedPaymentSubtype?.type !== 'credit') {
      setSelectedPaymentSubtypeId(defaultCreditSubtypeId);
      return;
    }
    if (paymentMethod === 'debit' && selectedPaymentSubtype?.type !== 'debit') {
      setSelectedPaymentSubtypeId(defaultDebitSubtypeId);
    }
  }, [defaultCreditSubtypeId, defaultDebitSubtypeId, paymentMethod, selectedPaymentSubtype]);

  const stickyPaymentTypeDisplay = useMemo(() => {
    if (paymentMethod === 'debit') {
      return {
        label: selectedPaymentSubtype?.type === 'debit' ? selectedPaymentSubtype.label : '체크카드',
        emoji: undefined,
        color: selectedPaymentSubtype?.type === 'debit' ? selectedPaymentSubtype.color : AtomicColors.green[500],
        showDot: true,
      };
    }

    if (paymentMethod === 'cash') {
      return {
        label: '현금',
        emoji: '💰',
        color: AtomicColors.blue[500],
        showDot: false,
      };
    }

    return {
      label: selectedPaymentSubtype?.type === 'credit' ? selectedPaymentSubtype.label : '신용카드',
      emoji: undefined,
      color: selectedPaymentSubtype?.type === 'credit' ? selectedPaymentSubtype.color : AtomicColors.blue[500],
      showDot: true,
    };
  }, [paymentMethod, selectedPaymentSubtype]);

  useEffect(() => {
    if (!showPrepaymentModal) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'prepayment',
    });
  }, [analyticsScreenName, showPrepaymentModal]);

  useEffect(() => {
    if (!showRefundOptions && !showSingleRefundConfirm) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'refund',
    });
  }, [analyticsScreenName, showRefundOptions, showSingleRefundConfirm]);

  useEffect(() => {
    if (!showSettlementConfirmModal) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'settlement',
    });
  }, [analyticsScreenName, showSettlementConfirmModal]);
  // 정산 처리 드롭다운 메뉴 (선결제/환불/결산)
  const [showSettlementMenu, setShowSettlementMenu] = useState<boolean>(false);
  const [settlementMenuLayout, setSettlementMenuLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const settlementButtonRef = useRef<View>(null);
  const settlementActionLockRef = useRef<boolean>(false);
  const settlementMenuOpacity = useRef(new Animated.Value(0)).current;
  const settlementMenuScale = useRef(new Animated.Value(0.94)).current;

  const settlementBaseAmount = useMemo(() => {
    const parsedAmount = amount ? Number(amount.replace(/,/g, '')) : NaN;
    if (!Number.isNaN(parsedAmount)) {
      return parsedAmount;
    }
    return Number(editData?.amount ?? 0);
  }, [amount, editData?.amount]);

  const settlementAmountText = useMemo(() => `${settlementBaseAmount.toLocaleString()}원`, [settlementBaseAmount]);
  const settlementRestoreAmountText = useMemo(() => {
    const restoredAmount = Number(editData?.originalAmountBeforeSettlement ?? editData?.amount ?? 0);
    return `${restoredAmount.toLocaleString()}원`;
  }, [editData?.amount, editData?.originalAmountBeforeSettlement]);

  const settlementPeriodText = useMemo(() => {
    const sourceDate = editData?.date || date;
    if (!sourceDate) {
      return '';
    }

    if (sourceDate.includes('.')) {
      const [yearStr, monthStr, dayStr] = sourceDate.split('.');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      const parsedDate = new Date(year, month - 1, day);
      return `기간 : ${yearStr}.${monthStr}.${dayStr}(${getWeekdayLabel(parsedDate)})`;
    }

    if (sourceDate.includes('-')) {
      const [yearStr, monthStr, dayStr] = sourceDate.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      const parsedDate = new Date(year, month - 1, day);
      return `기간 : ${yearStr}.${monthStr}.${dayStr}(${getWeekdayLabel(parsedDate)})`;
    }

    return `기간 : ${sourceDate}`;
  }, [date, editData?.date]);

  const applySettlementAction = useCallback((label: '선결제' | '환불' | '결산') => {
    if (label === '선결제') {
      void logEvent('btn', {
        screen_name: analyticsScreenName,
        target: 'prepayment',
      });
      const today = new Date();
      const todayFormatted = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
      setPrepaymentDate(todayFormatted);
      setTempSelectedDate(todayFormatted.replace(/\./g, '-'));
      setShowPrepaymentModal(true);
      return;
    }

    if (label === '환불') {
      void logEvent('btn', {
        screen_name: analyticsScreenName,
        target: 'refund',
      });
      if (editData?.isRecurring || editData?.isInstallment) {
        setShowRefundOptions(true);
      } else {
        setShowSingleRefundConfirm(true);
      }
      return;
    }

    void logEvent('btn', {
      screen_name: analyticsScreenName,
      target: 'settlement',
    });
    setShowSettlementConfirmModal(true);
  }, [analyticsScreenName, editData?.isInstallment, editData?.isRecurring]);

  const closeSettlementMenu = useCallback(
    (onClosed?: () => void) => {
      Animated.parallel([
        Animated.timing(settlementMenuOpacity, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
        Animated.timing(settlementMenuScale, {
          toValue: 0.94,
          duration: 100,
          useNativeDriver: true,
          easing: Easing.in(Easing.cubic),
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShowSettlementMenu(false);
          setSettlementMenuLayout(null);
          onClosed?.();
        }
      });
    },
    [settlementMenuOpacity, settlementMenuScale]
  );

  const handleSettlementMenuSelect = useCallback(
    (label: '선결제' | '환불' | '결산') => {
      if (settlementActionLockRef.current) {
        return;
      }
      settlementActionLockRef.current = true;
      closeSettlementMenu(() => {
        requestAnimationFrame(() => {
          applySettlementAction(label);
          requestAnimationFrame(() => {
            settlementActionLockRef.current = false;
          });
        });
      });
    },
    [applySettlementAction, closeSettlementMenu]
  );

  // 정산 처리 드롭다운 등장 애니메이션
  useEffect(() => {
    if (showSettlementMenu && settlementMenuLayout) {
      settlementMenuOpacity.setValue(0);
      settlementMenuScale.setValue(0.94);
      Animated.parallel([
        Animated.timing(settlementMenuOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(settlementMenuScale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    }
  }, [showSettlementMenu, settlementMenuLayout, settlementMenuOpacity, settlementMenuScale]);

  useEffect(() => {
    if (!showRecurringToast) {
      return;
    }
    showToast(recurringToastMessage);
    setShowRecurringToast(false);
  }, [recurringToastMessage, showRecurringToast, showToast]);

  useEffect(() => {
    if (!showCategoryToast) {
      return;
    }
    showToast(categoryToastMessage);
    setShowCategoryToast(false);
  }, [categoryToastMessage, showCategoryToast, showToast]);

  useEffect(() => {
    if (!showDateSelectToast) {
      return;
    }
    showToast(dateSelectToastMessage);
    setShowDateSelectToast(false);
  }, [dateSelectToastMessage, showDateSelectToast, showToast]);

  useEffect(() => {
    if (!showPrepaymentToast) {
      return;
    }
    showToast(prepaymentToastMessage);
    setShowPrepaymentToast(false);
  }, [prepaymentToastMessage, showPrepaymentToast, showToast]);

  useEffect(() => {
    if (!showWeekendOptionToast) {
      return;
    }
    showToast('해당 단위는 주말 옵션을 적용할 수 없습니다.');
    setShowWeekendOptionToast(false);
  }, [showToast, showWeekendOptionToast]);
  
  useEffect(() => {
    if (!showPrepaymentRestore) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'prepayment-restoration',
    });
  }, [analyticsScreenName, showPrepaymentRestore]);

  useEffect(() => {
    if (!showRefundRestore) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'refund-restoration',
    });
  }, [analyticsScreenName, showRefundRestore]);

  useEffect(() => {
    if (!showSettlementRestore) {
      return;
    }
    void logEvent('modal', {
      screen_name: analyticsScreenName,
      target: 'settlement-restoration',
    });
  }, [analyticsScreenName, showSettlementRestore]);
  
  // 실제 존재하는 기록 개수 (삭제된 기록 제외)
  const [actualRecordCount, setActualRecordCount] = useState<number>(0);
  // 실제 존재하는 기록의 총 금액 (할부 기록 삭제 시 정확한 금액 계산용)
  const [actualTotalAmount, setActualTotalAmount] = useState<number>(0);
  // 할부 기록 "오늘 포함 이후" 금액 (실제 기록 기준)
  const [actualFutureAmount, setActualFutureAmount] = useState<number>(0);
  // 환불 복구 모달 금액 계산용 (환불된 기록의 복구 대상 금액)
  const [actualRefundRestoreTotalAmount, setActualRefundRestoreTotalAmount] = useState<number>(0);
  const [actualRefundRestoreTodayAmount, setActualRefundRestoreTodayAmount] = useState<number>(0);
  const [actualRefundRestoreFutureAmount, setActualRefundRestoreFutureAmount] = useState<number>(0);
  // 정기/할부 그룹의 실제 마지막 년/월 (기간 표기 안정화용)
  const [actualEndYearMonth, setActualEndYearMonth] = useState<{ year: number; month: number } | null>(null);
  
  // Keyboard height tracking
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  // Section/Input position tracking
  // Remove amount auto-scroll states per request
  const [memoSectionY, setMemoSectionY] = useState(0);
  const [amountSectionY, setAmountSectionY] = useState(0);
  const [amountSectionHeight, setAmountSectionHeight] = useState(0);
  const handleMemoChange = useCallback((text: string) => {
    setMemo(text.replace(/[\r\n]/g, ''));
  }, []);

  const handleMemoKeyPress = useCallback((event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (event.nativeEvent.key === 'Enter') {
      Keyboard.dismiss();
    }
  }, []);

  const handleMemoSubmitEditing = useCallback(() => {
    Keyboard.dismiss();
  }, []);
  
  // 월 시작일 로드
  useEffect(() => {
    const loadMonthStart = async () => {
      const startDay = await loadMonthStartDay();
      setMonthStartDay(startDay);
    };
    loadMonthStart();
  }, []);
  
  // 실제 존재하는 기록 개수 계산 (삭제된 기록 제외)
  useEffect(() => {
    const calculateActualRecordCount = async () => {
      if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)) {
        try {
          const storedData = await AsyncStorage.getItem('calendarData');
          if (!storedData) return;
          
          const calendarData = JSON.parse(storedData);
          const idToUse = editData.isRecurring ? editData.recurringId : editData.installmentId;
          if (!idToUse) return;
          
          let actualCount = 0;
          let totalAmount = 0;
          let futureAmount = 0;
          let restoreTotalAmount = 0;
          let restoreTodayAmount = 0;
          let restoreFutureAmount = 0;
          let maxYearMonth: { year: number; month: number } | null = null;
          
          // 편집 날짜 기준으로 future 계산
          const editDate = parseRecordDate(editData.date, new Date());
          const editYear = editDate.getFullYear();
          const editMonth = editDate.getMonth() + 1;
          const editDay = editDate.getDate();
          
          // 시작일 계산
          const { startYear, startMonth } = calcPeriod(editData, totalMonths);
          
          Object.keys(calendarData).forEach(dateKey => {
            if (calendarData[dateKey].records) {
              const relatedRecords = calendarData[dateKey].records.filter(
                (r: any) => {
                  if (editData.isRecurring) {
                    return r.recurringId === idToUse && !r.isDeleted && !r.isPrepaid;
                  } else {
                    return r.installmentId === idToUse && !r.isDeleted && !r.isPrepaid;
                  }
                }
              );
              actualCount += relatedRecords.length;
              // 금액 합산
              relatedRecords.forEach((record: any) => {
                totalAmount += record.amount || 0;
                const recordDate = parseRecordDate(record.date, new Date());
                const recordYear = recordDate.getFullYear();
                const recordMonth = recordDate.getMonth() + 1;
                if (!maxYearMonth) {
                  maxYearMonth = { year: recordYear, month: recordMonth };
                } else {
                  const currentKey = maxYearMonth.year * 100 + maxYearMonth.month;
                  const nextKey = recordYear * 100 + recordMonth;
                  if (nextKey > currentKey) {
                    maxYearMonth = { year: recordYear, month: recordMonth };
                  }
                }
                
                // future 금액 계산 (환불 옵션이 'future'일 때)
                if (refundOption === 'future' || refundRestoreOption === 'future') {
                  const shouldDeleteRecord = shouldMatchScope(record, 'future', new Date(), startYear, startMonth, editYear, editMonth, editDay);
                  if (shouldDeleteRecord) {
                    futureAmount += record.amount || 0;
                  }
                }

                // 환불 복구 금액 계산 (환불된 기록 기준)
                if (record.isRefunded) {
                  const restoreAmount =
                    (typeof record.originalAmountBeforeRefund === 'number' && record.originalAmountBeforeRefund >= 0)
                      ? record.originalAmountBeforeRefund
                      : (record.originalAmount ?? record.amount ?? 0);

                  restoreTotalAmount += restoreAmount;

                  const shouldRestoreToday = shouldMatchScope(
                    record,
                    'today',
                    new Date(),
                    startYear,
                    startMonth,
                    editYear,
                    editMonth,
                    editDay,
                  );
                  if (shouldRestoreToday) {
                    restoreTodayAmount += restoreAmount;
                  }

                  const shouldRestoreFuture = shouldMatchScope(
                    record,
                    'future',
                    new Date(),
                    startYear,
                    startMonth,
                    editYear,
                    editMonth,
                    editDay,
                  );
                  if (shouldRestoreFuture) {
                    restoreFutureAmount += restoreAmount;
                  }
                }
              });
            }
          });
          
          setActualRecordCount(actualCount);
          setActualTotalAmount(totalAmount);
          setActualFutureAmount(futureAmount);
          setActualRefundRestoreTotalAmount(restoreTotalAmount);
          setActualRefundRestoreTodayAmount(restoreTodayAmount);
          setActualRefundRestoreFutureAmount(restoreFutureAmount);
          setActualEndYearMonth(maxYearMonth);
        } catch {
        }
      }
    };
    
    calculateActualRecordCount();
  }, [mode, editData, refundOption, refundRestoreOption, totalMonths]);

  // Edit mode: Initialize with edit data
  useEffect(() => {
    if (mode === 'edit' && editData) {
      setCategory(editData.category || '');
      // 금액에 콤마 포맷팅 적용
      const initialAmount = editData.amount?.toString() || '';
      if (initialAmount && !isNaN(Number(initialAmount))) {
        setAmount(Number(initialAmount).toLocaleString());
      } else {
        setAmount(initialAmount);
      }
      // 날짜 형식을 점(.) 구분자로 통일
      const editDate = editData.date || formattedToday;
      const normalizedDate = editDate.replace(/-/g, '.');

      setDate(normalizedDate);
      setDisplayDate(normalizedDate);

      // selectedDay도 함께 업데이트
      if (editData.date) {
        const editDateObj = new Date(editData.date);
        const day = editDateObj.getDate();
        setSelectedDay(day);
      }
      setMemo(editData.memo || '');
      setIsRecurring(editData.isRecurring || false);
      
      // 정기 기록의 경우 recurringType 먼저 복원
      if (editData.isRecurring) {
        // ✅ 새 구조: "기준 옵션 텍스트(recurringType)"는 절대값이다.
        // - 있으면 그대로 사용하고,
        // - 없으면 더 이상 totalMonths로 역추론해서 덮어쓰지 않는다.
        // editData.recurringType이 명시적으로 있는지 확인 (undefined, null, 빈 문자열 모두 체크)
        if (editData.recurringType && editData.recurringType.trim() !== '') {
          setRecurringType(editData.recurringType);

          // 매월/개월 단위 옵션만 totalMonths와 동기화 (표시/계산용)
          // 매일/매주/주중/주말 계열은 반복 로직이 recurringType 기반이라 totalMonths와 분리
          if (editData.recurringType === '매월') {
            setTotalMonths(1);
          } else if (editData.recurringType === '2개월 마다') {
            setTotalMonths(2);
          } else if (editData.recurringType === '4개월 마다') {
            setTotalMonths(4);
          } else if (editData.recurringType === '6개월 마다') {
            setTotalMonths(6);
          } else {
            // 매일, 매주, 2주, 3주, 4주, 주중, 주말:
            // - recurringType 텍스트만 사용
            // - totalMonths는 기존 값 유지(또는 기본값 2)지만, 기준 옵션 표기에는 절대 사용하지 않음
            const finalRecurringMonths = editData.totalMonths || 2;
            setTotalMonths(finalRecurringMonths);
          }
        } else {
          // 🔁 레거시 데이터 (recurringType이 저장되지 않았던 과거 기록)
          // - totalMonths는 그대로 복원해서 기간 계산 등에만 사용
          // - 기준 옵션 텍스트는 "역으로" 만들지 않고, 현재 state(기본값 '매월')를 유지
          // ⚠️ 하지만 이 경우에도 기본값 '매월'을 명시적으로 설정 (표기 일관성)
          setRecurringType('매월');
          const finalRecurringMonths = editData.totalMonths || 2;
          setTotalMonths(finalRecurringMonths);
          // ❌ 더 이상 여기서 totalMonths로 recurringType을 역추론하지 않음
        }

      } else {
        // 정기 기록이 아닌 경우
        // 할부 기록 개월수 설정 (installmentMonths 우선, 없으면 totalMonths 사용)
        let finalInstallmentMonths = editData.installmentMonths || editData.totalMonths || 2;
        setTotalMonths(editData.isInstallment ? finalInstallmentMonths : 2);
        setRecurringType('매월'); // 기본값
      }
      
      // 정기 기록: totalMonths가 없는 경우, recurringId로 관련 기록들을 찾아서 개월수 추론
      if (editData.isRecurring && !editData.totalMonths && editData.recurringId) {
        const inferRecurringMonths = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // 같은 recurringId를 가진 모든 기록 찾기
            let relatedRecordsCount = 0;
            Object.keys(calendarData).forEach(dateKey => {
              if (calendarData[dateKey].records) {
                const relatedRecords = calendarData[dateKey].records.filter(
                  (r: any) => r.recurringId === editData.recurringId
                );
                relatedRecordsCount += relatedRecords.length;
              }
            });
            
            if (relatedRecordsCount > 0) {
              setTotalMonths(relatedRecordsCount);
            }
          } catch {
          }
        };
        
        inferRecurringMonths();
      }
      
      // 할부 기록: installmentMonths가 없는 경우, installmentId로 관련 기록들을 찾아서 개월수 추론
      if (editData.isInstallment && !editData.installmentMonths && editData.installmentId) {
        const inferInstallmentMonths = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // 같은 installmentId를 가진 모든 기록 찾기
            let relatedRecordsCount = 0;
            Object.keys(calendarData).forEach(dateKey => {
              if (calendarData[dateKey].records) {
                const relatedRecords = calendarData[dateKey].records.filter(
                  (r: any) => r.installmentId === editData.installmentId
                );
                relatedRecordsCount += relatedRecords.length;
              }
            });
            
            if (relatedRecordsCount > 0) {
              setTotalMonths(relatedRecordsCount);
            }
          } catch {
          }
        };
        
        inferInstallmentMonths();
      }
      // 할부 기록 여부 설정
      setIsInstallment(editData.isInstallment === true);

      setWeekendOption(editData.weekendOption || 'weekend');

      // 결제 유형 초기값 설정 (기존 기록에는 없을 수 있으므로 기본값은 신용카드)
      const initialPaymentMethod: PaymentMethod =
        editData.paymentMethod === 'debit' || editData.paymentMethod === 'cash'
          ? editData.paymentMethod
          : 'credit';
      setPaymentMethod(initialPaymentMethod);
      const hasStoredSubtypeId =
        initialPaymentMethod !== 'cash' &&
        typeof editData.paymentSubtypeId === 'string' &&
        editData.paymentSubtypeId.length > 0;
      if (hasStoredSubtypeId) {
        setSelectedPaymentSubtypeId(editData.paymentSubtypeId as string);
      } else if (initialPaymentMethod === 'credit') {
        setSelectedPaymentSubtypeId(defaultCreditSubtypeId);
      } else if (initialPaymentMethod === 'debit') {
        setSelectedPaymentSubtypeId(defaultDebitSubtypeId);
      }
      
      // 환불 처리된 기록인데 refundedAt이 없으면 AsyncStorage에서 찾아서 업데이트
      if (editData.isRefunded && !editData.refundedAt) {
        const ensureRefundedAt = async () => {
          try {
            const storedData = await AsyncStorage.getItem('calendarData');
            const calendarData = storedData ? JSON.parse(storedData) : {};
            
            // editData의 timestamp나 installmentId로 기록 찾기
            const findRecord = (record: any) => {
              if (editData.timestamp && record.timestamp === editData.timestamp) {
                return true;
              }
              if (editData.isInstallment && editData.installmentId && 
                  record.isInstallment && record.installmentId === editData.installmentId &&
                  record.date === editData.date) {
                return true;
              }
              return false;
            };
            
            // 모든 날짜 데이터에서 기록 찾기
            for (const dateKey of Object.keys(calendarData)) {
              if (calendarData[dateKey].records) {
                const foundRecord = calendarData[dateKey].records.find(findRecord);
                if (foundRecord && foundRecord.isRefunded) {
                  // refundedAt이 없으면 현재 날짜로 추가
                  if (!foundRecord.refundedAt) {
                    foundRecord.refundedAt = new Date().toISOString();
                    await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));
                    calendarRefreshEvent.emit();
                    // editData도 업데이트 (화면에 반영되도록)
                    editData.refundedAt = foundRecord.refundedAt;
                  }
                  break;
                }
              }
            }
          } catch {
          }
        };
        
        ensureRefundedAt();
      }
      
      // Parse date for day selection
      if (editData.date) {
        const dateParts = editData.date.split('.');
        if (dateParts.length === 3) {
          setSelectedDay(parseInt(dateParts[2]));
        }
      }
    }
  }, [defaultCreditSubtypeId, defaultDebitSubtypeId, mode, editData, formattedToday]);
  
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  // Update category when returning from category selection screen
  useFocusEffect(
    useCallback(() => {
      const updateCategory = async () => {
        let nextCategory: string | null = null;

        // AsyncStorage에서 선택된 카테고리 확인 (카테고리 선택 화면에서 돌아온 경우)
        try {

          const selectedCategoryFromStorage = await AsyncStorage.getItem('selectedCategory');

          if (selectedCategoryFromStorage) {

            setCategory(selectedCategoryFromStorage);
            // 사용 후 AsyncStorage에서 제거
            await AsyncStorage.removeItem('selectedCategory');
            nextCategory = selectedCategoryFromStorage;

          } else if (params.category) {
            // URL 파라미터에서 카테고리 설정 (초기 로드 시)

            setCategory(params.category);
            nextCategory = params.category;
          }
        } catch {

          // 에러 발생 시 URL 파라미터 사용
          if (params.category) {
            setCategory(params.category);
            nextCategory = params.category;
          }
        }

      };
      
      updateCategory();
    }, [mode, params.category])
  );
  
  // Check if selected date is weekend
  const isWeekend = useCallback(() => {
    // Parse date format "2025.09.28" to Date object
    const parts = date.split('.');
    if (parts.length !== 3) return false;
    
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
    const day = parseInt(parts[2], 10);
    
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }, [date]);

  // 정기 기록/할부 기록 전체 수정 (기존 데이터 삭제 후 새로 생성)
  const handleMultipleRecordsBulkUpdate = async (
    calendarData: any,
    editData: any,
    newRecord: any,
    actualDateKey: string,
    monthlyAmount: number,
    currentRecurringType?: string // 현재 선택된 recurringType 전달
  ): Promise<{
    deletedRecords: { id?: string; timestamp: number }[];
    upsertRecords: ExpenseRecordType[];
  }> => {
    const isInstallmentGroup = !!editData.isInstallment;
    const isRecurringGroup = !!editData.isRecurring;
    const groupId = isRecurringGroup ? editData.recurringId : editData.installmentId;

    if (!groupId) {
      throw new Error('할부/정기 기록 전체 수정은 ID가 필요합니다.');
    }

    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    const debugLog = (...args: unknown[]) => {
      if (isDev) {
        // eslint-disable-next-line no-console
        console.log(...args);
      }
    };

    debugLog('[expense][bulk-update:start]', {
      groupId,
      actualDateKey,
      monthlyAmount,
      isInstallmentGroup,
      isRecurringGroup,
    });

    const parseDateKey = (key: string) => {
      const [y, m, d] = key.split('-').map(Number);
      return { year: y, month: m, day: d };
    };

    const recalcBucketTotals = (bucket: any) => {
      let totalExpense = 0;
      let totalIncome = 0;
      (bucket.records || []).forEach((record: any) => {
        if (record.type === 'expense' && record.isRefunded !== true) {
          totalExpense += record.amount || 0;
        } else if (record.type === 'income') {
          totalIncome += record.amount || 0;
        }
      });
      bucket.totalExpense = totalExpense;
      bucket.totalIncome = totalIncome;
    };

    const preservedByTimestamp = new Map<number, { dateKey: string; record: any }>();
    const deletedTimestampSet = new Set<number>();
    const deletedRecords: { id?: string; timestamp: number }[] = [];
    const upsertRecords: ExpenseRecordType[] = [];
    // 기존 기록의 날짜를 추적 (timestamp -> 원래 dateKey)
    const originalDateByTimestamp = new Map<number, string>();
    // 삭제 전에 원래 시작일의 timestamp를 찾기 위한 배열
    const allGroupTimestamps: number[] = [];

    const toExpenseRecord = (record: any): ExpenseRecordType => ({
      ...record,
      type: 'expense',
    });

    // 1) 기존 기록을 분류 (선결제/환불은 유지, 나머지는 제거)
    Object.keys(calendarData).forEach((dateKey) => {
      const bucket = calendarData[dateKey];
      if (!bucket?.records) {
        return;
      }

      const remaining: any[] = [];

      bucket.records.forEach((record: any) => {
        const belongsToGroup = isRecurringGroup
          ? record.recurringId === groupId
          : record.installmentId === groupId;

        if (!belongsToGroup) {
          remaining.push(record);
          return;
        }

        if (isDev) {
          // eslint-disable-next-line no-console
          console.log('[expense][bulk-update:match]', {
            dateKey,
            recordTimestamp: record.timestamp,
            recurringId: record.recurringId,
            installmentId: record.installmentId,
          });
        }

        if (record.isPrepaid || record.isRefunded) {
          preservedByTimestamp.set(record.timestamp, { dateKey, record });
          remaining.push(record);
          upsertRecords.push(toExpenseRecord(record));
          return;
        }

        // 제거 대상 - 원래 날짜 추적
        originalDateByTimestamp.set(record.timestamp, dateKey);
        allGroupTimestamps.push(record.timestamp); // 원래 시작일 찾기 위해 수집
        deletedTimestampSet.add(record.timestamp);
        deletedRecords.push({
          id: typeof record.id === 'string' ? record.id : undefined,
          timestamp: record.timestamp,
        });
      });

      if (remaining.length === 0) {
        delete calendarData[dateKey];
      } else {
        bucket.records = remaining;
        recalcBucketTotals(bucket);
      }
    });

    // 2) 새 스케줄 정보 계산
    let totalIterations: number;
    
    if (isRecurringGroup && currentRecurringType) {
      // 정기 옵션: recurringType 기반으로 반복 횟수 계산
      const baseDateStr = actualDateKey.replace(/-/g, '.');
      totalIterations = calculateRecurringIterations(baseDateStr, currentRecurringType);
      // 보존된 기록 수와 비교하여 더 큰 값 사용
      totalIterations = Math.max(totalIterations, preservedByTimestamp.size || 0);
    } else {
      // 할부 옵션 또는 recurringType이 없는 경우: 기존 로직 사용
      const requestedTotalMonths = isInstallmentGroup
        ? newRecord.installmentMonths ?? editData.installmentMonths ?? editData.totalMonths ?? 1
        : newRecord.totalMonths ?? editData.totalMonths ?? 1;
      totalIterations = Math.max(1, requestedTotalMonths, preservedByTimestamp.size || 0);
    }

    // 원래 시작일의 timestamp 추출
    // 1순위: groupId에서 추출 (원래 시작일의 timestamp가 ID에 포함됨)
    let baseTimestamp: number | null = extractTimestampFromId(groupId);
    
    // 2순위: 기존 기록들 중 가장 작은 timestamp (원래 시작일)
    // 삭제 전에 수집한 모든 timestamp 중 최소값이 원래 시작일
    if (baseTimestamp === null || !Number.isFinite(baseTimestamp)) {
      if (allGroupTimestamps.length > 0) {
        baseTimestamp = Math.min(...allGroupTimestamps);
      } else {
        // 3순위: 삭제된 기록들 중 가장 작은 timestamp
        const deletedTimestamps = Array.from(deletedTimestampSet);
        if (deletedTimestamps.length > 0) {
          baseTimestamp = Math.min(...deletedTimestamps);
        } else {
          // 4순위: 보존된 기록 중 가장 작은 timestamp
          const preservedExample = preservedByTimestamp.keys().next();
          if (!preservedExample.done) {
            baseTimestamp = preservedExample.value;
          } else {
            // 5순위: fallback
            baseTimestamp = typeof newRecord.timestamp === 'number' ? newRecord.timestamp : Date.now();
          }
        }
      }
    }

    // baseTimestamp가 null이면 에러
    if (baseTimestamp === null || !Number.isFinite(baseTimestamp)) {
      throw new Error('Invalid baseTimestamp for bulk update');
    }

    // 원래 시작일을 기준으로 재생성 (전체 수정 시에는 편집 날짜가 아닌 원래 시작일 사용)
    const originalStartDate = new Date(baseTimestamp);
    const originalStartYear = originalStartDate.getFullYear();
    const originalStartMonth = originalStartDate.getMonth() + 1;
    
    // 새로 입력한 날짜의 일(day) 추출 (사용자가 변경한 날짜 사용)
    const newDateInfo = parseDateKey(actualDateKey);
    const newDay = newDateInfo.day;
    
    // 원래 시작일의 년/월 + 새로 입력한 일 = 새로운 baseDate
    const baseDate = new Date(originalStartYear, originalStartMonth - 1, newDay);
    const baseDay = newDay;

    debugLog('[expense][bulk-update:base]', {
      baseTimestamp,
      baseDate: baseDate.toISOString(),
      totalIterations,
    });

    const computeTargetDate = (index: number): { dot: string; key: string } | null => {
      // index가 0이면 baseDate 반환
      if (index === 0) {
        const baseDateStr = `${originalStartYear}.${String(originalStartMonth).padStart(2, '0')}.${String(baseDay).padStart(2, '0')}`;
        const baseDateObj = new Date(originalStartYear, originalStartMonth - 1, baseDay);
        const baseDayOfWeek = baseDateObj.getDay();
        let adjustedBaseDate = baseDateStr;
        // 매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시
        const shouldIgnoreWeekendOption = isRecurringGroup && currentRecurringType && ['매일', '주중', '주말'].includes(currentRecurringType);
        if ((baseDayOfWeek === 0 || baseDayOfWeek === 6) && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
          adjustedBaseDate = getAdjustedWeekendDate(baseDateStr, weekendOption);
        }
        return { dot: adjustedBaseDate, key: adjustedBaseDate.replace(/\./g, '-') };
      }
      
      // 정기 옵션인 경우 recurringType에 따라 날짜 계산
      if (isRecurringGroup && currentRecurringType) {
        // 시작 날짜
        let currentDate = `${originalStartYear}.${String(originalStartMonth).padStart(2, '0')}.${String(baseDay).padStart(2, '0')}`;
        
        // index만큼 반복하여 날짜 계산 (index가 0이면 시작일 반환)
        for (let j = 0; j < index; j++) {
          const nextDate = getNextRecurringDate(currentDate, currentRecurringType, j, originalStartYear);
          if (!nextDate) {
            // 해당 년도 초과 시 null 반환
            return null;
          }
          currentDate = nextDate;
        }
        
        // 주말 조정 (매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시)
        const shouldIgnoreWeekendOption = ['매일', '주중', '주말'].includes(currentRecurringType);
        const [year, month, day] = currentDate.split('.').map(Number);
        const futureDateObj = new Date(year, month - 1, day);
        const futureDayOfWeek = futureDateObj.getDay();
        let futureDate = currentDate;
        if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
          futureDate = getAdjustedWeekendDate(futureDate, weekendOption);
        }
        
        return { dot: futureDate, key: futureDate.replace(/\./g, '-') };
      }
      
      // 할부 옵션 또는 기본 로직: 월 단위로 증가
      const target = new Date(baseDate);
      target.setMonth(baseDate.getMonth() + index);

      const futureYear = target.getFullYear();
      const futureMonth = target.getMonth() + 1;
      
      // 해당 년도 초과 시 null 반환
      if (futureYear > originalStartYear) {
        return null;
      }
      
      const actualDay = getActualDayForMonth(futureYear, futureMonth, baseDay);

      let futureDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;

      const futureDateObj = new Date(futureYear, futureMonth - 1, actualDay);
      const futureDayOfWeek = futureDateObj.getDay();
      if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend') {
        futureDate = getAdjustedWeekendDate(futureDate, weekendOption);
      }

      return { dot: futureDate, key: futureDate.replace(/\./g, '-') };
    };

    // 3) 재생성
    for (let i = 0; i < totalIterations; i++) {
      const recordTimestamp = baseTimestamp + i;

      if (preservedByTimestamp.has(recordTimestamp)) {
        const preserved = preservedByTimestamp.get(recordTimestamp)!;
        const bucket = calendarData[preserved.dateKey];
        if (bucket?.records) {
          bucket.records = bucket.records.map((record: any) => {
            if (record.timestamp !== recordTimestamp) {
              return record;
            }
            if (isInstallmentGroup) {
              record.totalMonths = totalIterations;
              record.installmentMonths = totalIterations;
            } else if (isRecurringGroup) {
              record.totalMonths = totalIterations;
              // recurringType도 업데이트 (currentRecurringType이 있으면 사용)
              if (currentRecurringType) {
                record.recurringType = currentRecurringType;
              }
            }
            return record;
          });
          const updatedRecord = bucket.records.find((record: any) => record.timestamp === recordTimestamp);
          if (updatedRecord) {
            upsertRecords.push(toExpenseRecord(updatedRecord));
          }
          recalcBucketTotals(bucket);
        }
        continue;
      }

      const targetDate = computeTargetDate(i);
      
      // 해당 년도 초과 시 중단
      if (!targetDate) {
        break;
      }

      // targetDate가 null이 아님을 확인했으므로 이후 사용 가능
      const targetDateKey = targetDate.key;
      const targetDateDot = targetDate.dot;

      if (!calendarData[targetDateKey]) {
        calendarData[targetDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }

      const bucket = calendarData[targetDateKey];

      const normalizedMonthlyAmount = Number.isFinite(monthlyAmount) ? monthlyAmount : 0;

      const generatedRecord = {
        ...newRecord,
        id: generateRecordId(),
        date: targetDateDot,
        timestamp: recordTimestamp,
        amount: normalizedMonthlyAmount,
        recurringId: isRecurringGroup ? groupId : undefined,
        installmentId: isInstallmentGroup ? groupId : undefined,
        isAutoGenerated: i > 0,
        isInstallment: isInstallmentGroup ? true : undefined,
        totalMonths: isRecurringGroup ? totalIterations : undefined,
        installmentMonths: isInstallmentGroup ? totalIterations : undefined,
        originalInstallment: isInstallmentGroup && i === 0 ? true : undefined,
        recurringType: isRecurringGroup ? (currentRecurringType || newRecord.recurringType) : undefined, // 정기 기록의 반복 타입 저장
        originalAmount: normalizedMonthlyAmount,
        originalCategory: category,
        originalDate: targetDateDot,
        isPrepaid: false,
        isRefunded: false,
        installmentOriginDate: undefined,
      };

      bucket.records.push(generatedRecord);
      recalcBucketTotals(bucket);

      // 재생성된 기록의 원래 날짜와 새 날짜를 비교
      const originalDateKey = originalDateByTimestamp.get(recordTimestamp);
      if (originalDateKey && originalDateKey === targetDateKey) {
        // 날짜가 동일한 경우에만 삭제 리스트에서 제거 (같은 위치에 재생성)
        deletedTimestampSet.delete(recordTimestamp);
        // deletedRecords에서도 제거
        const index = deletedRecords.findIndex(dr => dr.timestamp === recordTimestamp);
        if (index !== -1) {
          deletedRecords.splice(index, 1);
        }
      }
      // 날짜가 변경된 경우 삭제 리스트에 남겨둠 (기존 기록은 삭제되어야 함)

      upsertRecords.push(toExpenseRecord(generatedRecord));
    }

    // 최종적으로 삭제 리스트에 남은 기록들만 deletedRecords에 포함
    const finalDeletedRecords = deletedRecords.filter(dr => deletedTimestampSet.has(dr.timestamp));

    debugLog('[expense][bulk-update:result]', {
      deletedCount: finalDeletedRecords.length,
      upsertCount: upsertRecords.length,
      preservedCount: preservedByTimestamp.size,
      sampleDeleted: finalDeletedRecords.slice(0, 3),
    });

    return {
      deletedRecords: finalDeletedRecords,
      upsertRecords,
    };
  };

  // 정기/할부 기록 오늘만 수정 (완전 삭제 후 ID 유지하여 재생성)
  const handleSingleRecordUpdate = async (
    calendarData: any, 
    editData: any, 
    newRecord: any, 
    actualDateKey: string, 
    monthlyAmount: number
  ) => {
    
    const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;



    // 기존 데이터 완전 삭제
    
    
    // 할부 기록의 경우 installmentId로도 찾을 수 있도록 함
    let foundRecord: any = null;
    let foundDateKey: string | null = null;
    let foundRecordIndex: number = -1;
    
    // 먼저 originalDateKey에서 찾기 시도
    if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
      const recordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => {
          // timestamp로 우선 찾기
          if (r.timestamp === editData.timestamp) return true;
          // 할부 기록의 경우 installmentId도 확인
          if (editData.isInstallment && editData.installmentId && r.installmentId === editData.installmentId && r.date === editData.date) return true;
          // 정기 기록의 경우 recurringId도 확인
          if (editData.isRecurring && editData.recurringId && r.recurringId === editData.recurringId && r.date === editData.date) return true;
          return false;
        }
      );
      
      if (recordIndex !== -1) {
        foundRecord = calendarData[originalDateKey].records[recordIndex];
        foundDateKey = originalDateKey;
        foundRecordIndex = recordIndex;
      }
    }
    
    // originalDateKey에서 못 찾은 경우, 모든 날짜에서 찾기 (날짜가 이미 변경된 경우)
    if (!foundRecord && (editData.isInstallment || editData.isRecurring)) {
      const idToUse = editData.isInstallment ? editData.installmentId : editData.recurringId;
      if (idToUse) {
        Object.keys(calendarData).forEach(dateKey => {
          if (calendarData[dateKey].records) {
            const recordIndex = calendarData[dateKey].records.findIndex(
              (r: any) => {
                if (editData.isInstallment) {
                  return r.installmentId === idToUse && r.timestamp === editData.timestamp;
                } else {
                  return r.recurringId === idToUse && r.timestamp === editData.timestamp;
                }
              }
            );
            if (recordIndex !== -1) {
              foundRecord = calendarData[dateKey].records[recordIndex];
              foundDateKey = dateKey;
              foundRecordIndex = recordIndex;
            }
          }
        });
      }
    }
    
    if (foundRecord && foundDateKey !== null && foundRecordIndex !== -1) {
      
      // 기록 완전 삭제
      calendarData[foundDateKey].records.splice(foundRecordIndex, 1);
      
      // 기존 날짜의 총액에서 차감
      if (foundRecord.type === 'expense') {
        calendarData[foundDateKey].totalExpense = Math.max(0, 
          (calendarData[foundDateKey].totalExpense || 0) - (foundRecord.amount || 0)
        );
      }
      
      // 빈 날짜 데이터 정리
      if (calendarData[foundDateKey].records.length === 0) {
        delete calendarData[foundDateKey];
      }
    } else {
    }
    
    // 새 위치에 기록 재생성 (ID 유지)
    

    // 할부 기록 수정 시에는 기존 금액 그대로 사용 (재할부 방지)
    const finalAmount = (editData.isInstallment && editData.originalInstallment) 
      ? editData.amount  // 할부 기록은 기존 금액 유지
      : monthlyAmount;    // 일반 기록은 새 금액 사용

    // actualDateKey를 date 형식으로 변환 (2025-11-11 -> 2025.11.11)
    const actualDate = actualDateKey.replace(/-/g, '.');

    // 새 위치에 데이터 구조 생성 (날짜 데이터가 없으면 초기화)
    if (!calendarData[actualDateKey]) {
      calendarData[actualDateKey] = {
        totalExpense: 0,
        totalIncome: 0,
        records: [],
      };
    }

    const refundPreserve: Partial<ExpenseRecordType> = {};
    if (foundRecord?.isRefunded === true || editData.isRefunded === true) {
      refundPreserve.isRefunded = true;
      const ra = foundRecord?.refundedAt ?? editData.refundedAt;
      if (typeof ra === 'string') {
        refundPreserve.refundedAt = ra;
      }
      const oar =
        typeof foundRecord?.originalAmountBeforeRefund === 'number'
          ? foundRecord.originalAmountBeforeRefund
          : typeof editData.originalAmountBeforeRefund === 'number'
            ? editData.originalAmountBeforeRefund
            : undefined;
      if (typeof oar === 'number') {
        refundPreserve.originalAmountBeforeRefund = oar;
      }
    }

    const settlementPreserve: Partial<ExpenseRecordType> = {};
    if (foundRecord?.isSettled === true || editData.isSettled === true) {
      settlementPreserve.isSettled = true;
      const sa = foundRecord?.settledAt ?? editData.settledAt;
      if (typeof sa === 'string') {
        settlementPreserve.settledAt = sa;
      }
      const oas =
        typeof foundRecord?.originalAmountBeforeSettlement === 'number'
          ? foundRecord.originalAmountBeforeSettlement
          : typeof editData.originalAmountBeforeSettlement === 'number'
            ? editData.originalAmountBeforeSettlement
            : undefined;
      if (typeof oas === 'number') {
        settlementPreserve.originalAmountBeforeSettlement = oas;
      }
    }

    const updatedRecord = {
      ...newRecord,
      date: actualDate, // 날짜 변경 시 실제 날짜로 업데이트
      recurringId: editData.isRecurring ? editData.recurringId : undefined,
      installmentId: editData.isInstallment ? editData.installmentId : undefined,
      timestamp: editData.timestamp, // 기존 timestamp 유지
      amount: finalAmount, // 할부 기록 수정 시 기존 금액 사용
      ...refundPreserve,
      ...settlementPreserve,
      ...(editData.isRecurring && refundPreserve.isRefunded !== true
        ? { originalAmountBeforeRefund: monthlyAmount }
        : {}),
    };

    calendarData[actualDateKey].records.push(updatedRecord);
    calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + finalAmount;
    
    
  };

  const handleCategoryPress = () => {
    void logEvent('ui', {
      screen_name: analyticsScreenName,
      target: 'category',
    });

    // 정기/할부 기록은 카테고리 변경 잠금 (일반 기록만 변경 허용)
    if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)) {
      setCategoryToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
      setShowCategoryToast(true);
      return;
    }

    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    
    // 카테고리 선택 화면으로 이동 (현재 선택된 카테고리 전달)
    router.push({
      pathname: '/expense-category',
      params: { 
        selectedCategory: category,
        fromEdit: 'true',
      },
    });
  };

  const handleDatePress = () => {
    void logEvent('ui', {
      screen_name: analyticsScreenName,
      target: 'calendar',
    });

    // 이미 열려있으면 무시
    if (showDatePicker) {
      return;
    }
    // 선결제 처리된 기록은 날짜 변경 불가
    if (mode === 'edit' && editData?.isPrepaid) {
      showToast('변경할 수 없습니다. 새로 생성해 주세요.');
      return;
    }
    // 키패드가 열려있으면 닫기
    Keyboard.dismiss();
    // 캘린더 바텀시트를 열어 날짜 선택 (생성/수정 모드 모두 허용)
    setTempSelectedDate(date.replace(/\./g, '-'));
    void logEvent('sheet_view', {
      screen_name: analyticsScreenName,
      target: 'calendar',
    });
    setShowDatePicker(true);
  };

  const handleDatePickerClose = useCallback(() => {
    if (!showDatePicker) {
      return;
    }
    void logEvent('btn', {
      screen_name: analyticsScreenName,
      target: 'calendar-close',
    });
    setShowDatePicker(false);
  }, [showDatePicker]);
  
  // 선결제 처리 함수
  const handlePrepaymentConfirm = async () => {
    if (!editData) {
      return;
    }

    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};

      // 선결제 날짜 (사용자가 선택한 날짜)
      const prepaidDateStr = prepaymentDate.replace(/\./g, '-');
      const prepaidDateKey = prepaidDateStr;
      const prepaidDateFormatted = prepaymentDate; // "YYYY.MM.DD" 형식

      // 원래 기록의 날짜와 위치 찾기
      const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
      if (!originalDateKey || !calendarData[originalDateKey]) {
        return;
      }

      const groupId = editData.isInstallment ? editData.installmentId : editData.recurringId;
      const groupKey = editData.isInstallment ? 'installmentId' : 'recurringId';

      // 기존 기록 찾기 (timestamp/id 또는 groupId로)
      let recordIndex = -1;
      let originalRecord: any = null;

      if (calendarData[originalDateKey].records) {
        recordIndex = calendarData[originalDateKey].records.findIndex((r: any) => {
          if (r.id === editData.id || r.timestamp === editData.timestamp) {
            return true;
          }
          if (groupId && r[groupKey] === groupId && !r.isPrepaid) {
            const dateMatches = r.date === editData.date || r.originalDate === editData.date || r.installmentOriginDate === editData.date;
            if (dateMatches) return true;
          }
          return false;
        });

        if (recordIndex !== -1) {
          originalRecord = calendarData[originalDateKey].records[recordIndex];
        }
      }

      if (!originalRecord) {
        setLoading(false);
        return;
      }

      // 이미 선결제 처리된 기록인지 확인
      if (originalRecord.isPrepaid) {
        setLoading(false);
        return;
      }

      // 기존 기록 삭제
      calendarData[originalDateKey].totalExpense = Math.max(0, 
        calendarData[originalDateKey].totalExpense - originalRecord.amount
      );
      calendarData[originalDateKey].records.splice(recordIndex, 1);

      // 빈 날짜 정리
      if (calendarData[originalDateKey].records.length === 0) {
        delete calendarData[originalDateKey];
      }

      // 선결제 날짜에 데이터 구조 생성
      if (!calendarData[prepaidDateKey]) {
        calendarData[prepaidDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }

      // 선결제 기록 생성 (기존 ID 유지)
      // 선결제 시: originalDate에 원래 예정일 저장 (복구 시 사용)
      const prepaidRecord = {
        ...originalRecord,
        date: prepaidDateFormatted,
        isPrepaid: true,
        prepaidDate: prepaidDateFormatted,
        originalDate: originalRecord.originalDate || originalRecord.date,
        timestamp: originalRecord.timestamp, // 기존 timestamp 유지
        ...(editData.isInstallment
          ? { installmentOriginDate: originalRecord.date }
          : {}),
      };

      calendarData[prepaidDateKey].records.push(prepaidRecord);
      calendarData[prepaidDateKey].totalExpense += originalRecord.amount;

      // 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 선결제 기록 업데이트 (반드시 완료 대기)
      const primaryRecordId = prepaidRecord.id;
      const timestampRecordId = prepaidRecord.timestamp.toString();
      const updatePayload: Partial<ExpenseRecordType> = {
        date: prepaidDateFormatted,
        isPrepaid: true,
        prepaidDate: prepaidDateFormatted,
        ...(editData.isInstallment ? { installmentOriginDate: originalRecord.date } : {}),
        originalDate: originalRecord.originalDate || originalRecord.date,
      };

      try {
        let updatedRecord: ExpenseRecordType | null = null;

        if (primaryRecordId) {
          updatedRecord = await updateExpense(primaryRecordId, updatePayload);
        }

        if (!updatedRecord) {
          updatedRecord = await updateExpense(timestampRecordId, updatePayload);
        }
        
        // updateExpense 완료 후 AsyncStorage 쓰기 완료 보장을 위한 추가 대기
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (_error) {
        // updateExpense 실패 시에도 calendarData는 이미 저장되었으므로 계속 진행
        // 하지만 사용자에게 알림을 줄 수도 있음
      }
      
      // rebuildCalendarData 실행 (최신 데이터 반영 보장)
      await rebuildCalendarData();
      
      // rebuildCalendarData 완료 후 추가 지연 (데이터 동기화 보장)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 새로고침 이벤트 발생
      calendarRefreshEvent.emit();

      try {
        logExpenseAdjustment({
          adjustment: 'isprepaid',
          state: 'applied',
          refund_scope: null,
          expense_variant: expenseCreationVariantFromInstallmentFlags(
            prepaidRecord.isInstallment,
            prepaidRecord.isRecurring,
          ),
        });
      } catch {
        // analytics only
      }

      // 모달 닫기
      setShowPrepaymentModal(false);
      showToast('정상적으로 선결제 처리가 완료 되었습니다.');
      await goTimelineWithFocus(prepaidDateKey);

    } catch (error) {
      console.error('선결제 처리 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // amount auto-scroll removed per request
  
  // amount auto-scroll removed per request

  const handleKeypadDismiss = useCallback(() => {
    if (!isKeypadVisible) return;
    setIsKeypadVisible(false);
    setAmountExpression([]);
  }, [isKeypadVisible]);

  const isScrollingRef = useRef(false);
  const ignoreNextTouchEndRef = useRef(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMemoFocusedRef = useRef(false);
  const skipNextDismissRef = useRef(false);

  const clearDismissTimeout = useCallback(() => {
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
  }, []);

  const handleMemoFocus = () => {
    void logEvent('ui', {
      screen_name: analyticsScreenName,
      target: 'memo',
    });

    clearDismissTimeout();
    setIsMemoFocused(true);
    isMemoFocusedRef.current = true;
    handleKeypadDismiss();
    // 메모 섹션 위치로 스크롤 (하단 버튼 제외)
    // 기기 화면 높이에 비례하여 스크롤 오프셋 계산
    // 아이폰 13 미니(812pt)에서 216px이 최적 → 약 26.6%
    setTimeout(() => {
      if (memoSectionY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const scrollOffset = windowHeight * 0.266; // 화면 높이의 26.6%
        scrollViewRef.current?.scrollTo({ 
          y: memoSectionY - scrollOffset, 
          animated: true 
        });
      }
    }, 350);
  };

  const handleAmountFocus = () => {
    // 금액 섹션 위치로 스크롤 (하단 버튼 제외)
    // 메모와 동일한 오프셋 기준 적용
    setTimeout(() => {
      if (amountSectionY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const scrollOffset = windowHeight * 0.4; // 화면 높이의 39.5%
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, amountSectionY - scrollOffset),
          animated: true,
        });
      }
    }, 350);
  };


  // 변경사항이 있는지 확인하는 함수
  const hasChanges = () => {
    if (mode !== 'edit' || !editData) {
      return true; // 새로 생성하는 경우는 항상 변경사항이 있음
    }

    // 현재 입력된 값들
    const currentAmount = parseFloat(amount.replace(/,/g, ''));
    const originalAmount = parseFloat(editData.amount?.toString() || '0');
    
    // 날짜 비교 (실제 날짜 값으로 비교)
    const currentDate = date;
    const originalDate = editData.date ? editData.date.replace(/-/g, '.') : '';
    
    // 날짜 변경 감지를 위한 디버깅 로그

    // 변경사항 확인
    const categoryChanged = category !== editData.category;
    const amountChanged = currentAmount !== originalAmount;
    const dateChanged = currentDate !== originalDate;
    const memoChanged = memo !== (editData.memo || '');
    const recurringChanged = isRecurring !== (editData.isRecurring || false);
    const totalMonthsChanged = totalMonths !== (editData.totalMonths || 2);
    const installmentChanged = isInstallment !== (editData.isInstallment || false);
    const weekendOptionChanged = weekendOption !== (editData.weekendOption || 'weekend');
    const paymentMethodChanged =
      paymentMethod !== ((editData.paymentMethod as PaymentMethod | undefined) ?? 'credit');
    const originalPaymentSubtypeId =
      editData.paymentMethod === 'cash'
        ? undefined
        : (editData.paymentSubtypeId as string | undefined) ??
          ((editData.paymentMethod as PaymentMethod | undefined) === 'debit'
            ? defaultDebitSubtypeId
            : defaultCreditSubtypeId);
    const currentPaymentSubtypeId =
      paymentMethod === 'cash'
        ? undefined
        : selectedPaymentSubtype?.id ?? (paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId);
    const paymentSubtypeChanged = currentPaymentSubtypeId !== originalPaymentSubtypeId;

    return (
      categoryChanged ||
      amountChanged ||
      dateChanged ||
      memoChanged ||
      recurringChanged ||
      totalMonthsChanged ||
      installmentChanged ||
      weekendOptionChanged ||
      paymentMethodChanged ||
      paymentSubtypeChanged
    );
  };

  const handleConfirm = async () => {
    // 필수값 검증
    if (!category) {
      setCategoryToastMessage('카테고리를 선택해 주세요.');
      setShowCategoryToast(true);
      return;
    }

    if (!paymentMethod) {
      setRecurringToastMessage('결제 유형을 선택해 주세요.');
      setShowRecurringToast(true);
      return;
    }
    
    const isRefundedRecord = mode === 'edit' && !!editData?.isRefunded;
    const isSettledRecord = mode === 'edit' && !!editData?.isSettled;
    /** 정기·할부 중 환불/선결제/결산 처리된 건: 저장 시 이 회차만 바뀐다는 확인 */
    const isAdjustedRecurringOrInstallment =
      mode === 'edit' &&
      (!!editData?.isRecurring || !!editData?.isInstallment) &&
      (!!editData?.isRefunded || !!editData?.isPrepaid || !!editData?.isSettled);

    // 금액 필수 검증: 환불·결산 처리 기록은 0원/미입력 허용
    if (!isRefundedRecord && !isSettledRecord) {
      if (!amount || amount === '0' || amount.trim() === '') {
        setShowAmountAlert(true);
        return;
      }
    }
    
    if (isAdjustedRecurringOrInstallment) {
      setRefundEditConfirmMessage('현재 데이터만 변경 됩니다.\n진행하시겠어요?');
      setShowRefundEditConfirmModal(true);
      return;
    }

    // 할부 기록 수정모드에서 확인 모달 표시 (환불 기록, 선결제 기록은 제외)
    if (!isRefundedRecord && mode === 'edit' && editData?.isInstallment && !editData?.isPrepaid) {
    setEditConfirmMessage('매달 마다 자동으로 기록되는 데이터 중\n오늘 데이터만 수정하시겠어요?');
      setShowEditConfirmModal(true);
      return;
    }
    
    if (mode === 'edit' && !hasChanges()) {
      setShowNoChangesModal(true);
      return;
    }
    
    // 정기 지출 또는 할부 옵션 + 주말인 경우 확인 모달 표시 ('관계없이 주말 기록' 제외)
    // 매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시하므로 모달 표시 안 함
    const shouldIgnoreWeekendOption = isRecurring && ['매일', '주중', '주말'].includes(recurringType);
    if ((isRecurring || isInstallment) && isWeekend() && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
      setShowWeekendConfirm(true);
      return;
    }
    
    // 실제 저장 진행
    await saveExpenseRecord();
  };

  const handleBottomCtaConfirmPress = () => {
    void logEvent('btn', {
      screen_name: analyticsScreenName,
      target: 'cta',
    });
    void handleConfirm();
  };

  const saveExpenseRecord = async () => {
    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      const isRefundedRecordForSave = mode === 'edit' && !!editData?.isRefunded;
      const isSettledRecordForSave = mode === 'edit' && !!editData?.isSettled;
      let expenseAmount = parseFloat(amount.replace(/,/g, ''));
      if (!Number.isFinite(expenseAmount) && (isRefundedRecordForSave || isSettledRecordForSave)) {
        expenseAmount = 0;
      }
      
      // 1. 실제 저장될 날짜 계산 (주말 옵션 적용)
      // 선결제 기록 날짜 변경 체크는 handleConfirm에서 이미 처리됨
      let actualDate = date;
      
      // 주말 체크
      const parts = date.split('.');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const dateObj = new Date(year, month, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;
      const isWeekday = !isWeekendDay;

      // 엣지 케이스 처리: 반복 기간에 따라 시작일 조정
      if (isRecurring && recurringType === '주중' && isWeekendDay) {
        // 주말 날짜 선택 + 주중 반복: 차주 주중(월요일)부터 기록
        const nextMonday = new Date(dateObj);
        const daysUntilMonday = (8 - dayOfWeek) % 7; // 일요일(0)일 때 1일, 토요일(6)일 때 2일
        nextMonday.setDate(nextMonday.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
        actualDate = `${nextMonday.getFullYear()}.${String(nextMonday.getMonth() + 1).padStart(2, '0')}.${String(nextMonday.getDate()).padStart(2, '0')}`;
      } else if (isRecurring && recurringType === '주말' && isWeekday) {
        // 주중 날짜 선택 + 주말 반복: 금주 주말(토요일)부터 기록
        const thisSaturday = new Date(dateObj);
        const daysUntilSaturday = 6 - dayOfWeek; // 월요일(1)일 때 5일, 금요일(5)일 때 1일
        thisSaturday.setDate(thisSaturday.getDate() + daysUntilSaturday);
        actualDate = `${thisSaturday.getFullYear()}.${String(thisSaturday.getMonth() + 1).padStart(2, '0')}.${String(thisSaturday.getDate()).padStart(2, '0')}`;
      } else {
        // 매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시
        const shouldIgnoreWeekendOption = isRecurring && ['매일', '주중', '주말'].includes(recurringType);
        if ((isRecurring || isInstallment) && isWeekendDay && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
          actualDate = getAdjustedWeekendDate(date, weekendOption);

        } else if ((isRecurring || isInstallment) && isWeekendDay && weekendOption === 'weekend') {

        }
      }
      
      const actualDateKey = actualDate.replace(/\./g, '-');

      // 2. 날짜에 데이터 구조 생성
      if (!calendarData[actualDateKey]) {
        calendarData[actualDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }
      
      // 3. 새 기록 추가
      // 오늘만 수정 모드에서는 기존 timestamp, id, recurringId 유지
      const newTimestamp = (mode === 'edit' && editData) 
        ? editData.timestamp 
        : new Date().getTime();
      
      // 고유 ID 생성 (UUID)
      const recordId = (mode === 'edit' && editData)
        ? editData.id
        : generateRecordId();
      
      // 정기 기록 전용 그룹 ID (recurring_UUID 형식)
      const recurringId = isRecurring 
        ? ((mode === 'edit' && editData) 
          ? editData.recurringId 
          : generateGroupId('recurring'))
        : undefined;

      // 할부 기록 전용 그룹 ID (installment_UUID 형식)
      const installmentId = isInstallment 
        ? ((mode === 'edit' && editData) 
          ? editData.installmentId
          : generateGroupId('installment'))
        : undefined;

      // 할부 옵션이 켜져 있으면 월별 금액 계산 (정기 옵션과 무관하게)
      let monthlyAmount: number;
      if (isInstallment) {
        // 수정 모드이고 할부 기록인 경우: 기존 금액 그대로 사용 (재할부 방지)
        if (mode === 'edit' && (editData?.isRecurring || editData?.isInstallment) && editData?.isInstallment) {
          monthlyAmount = parseFloat(amount.replace(/,/g, ''));

        } else {
          // 생성 모드: 할부 계산
          const baseAmount = Math.floor(expenseAmount / totalMonths);  // 소수점 제거하여 정수로 계산
          const remainder = expenseAmount - (baseAmount * totalMonths);  // 나머지 금액 계산
          monthlyAmount = baseAmount + remainder;  // 원본 기록에는 나머지 금액 추가
        }
      } else {
        monthlyAmount = expenseAmount;
      }

      const newRecord = {
        id: recordId, // UUID
        type: 'expense' as const,
        amount: monthlyAmount,
        category,
        memo,
        date: actualDate,
        timestamp: newTimestamp,
        paymentMethod,
        paymentSubtypeId:
          paymentMethod === 'cash'
            ? undefined
            : selectedPaymentSubtype?.id ?? (paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId),
        isRecurring,
        weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
        recurringId: isRecurring ? recurringId : undefined, // 정기 기록 전용
        installmentId: isInstallment ? installmentId : undefined, // 할부 기록 전용
        isAutoGenerated: false, // 원본 기록은 자동생성이 아님
        isInstallment: isInstallment ? true : undefined, // 할부 여부 저장
        totalMonths: isRecurring ? totalMonths : undefined, // 정기 기록 개월 수 저장
        installmentMonths: isInstallment ? totalMonths : undefined, // 할부 기록 개월 수 저장
        originalInstallment: isInstallment ? true : undefined, // 최초 생성 시 할부 설정 저장
        recurringType: isRecurring ? recurringType : undefined, // 정기 기록의 반복 타입 저장
        // 원본 데이터 초기화: 최초 생성 시 현재 값 = 원본 값
        originalAmount: monthlyAmount,
        originalCategory: category,
        originalDate: actualDate,
        createdVia: 'screen' as const,
      };

      const recordsToSave: ExpenseRecordType[] = [];

      if (mode === 'edit' && editData) {
        // Edit mode: 선결제 기록은 단순 필드 업데이트
        if (editData.isPrepaid && editData.isInstallment) {
          // 선결제 기록 수정: 삭제 후 재생성 없이 필드만 업데이트
          const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
          const isDateChanged = originalDateKey !== actualDateKey;

          // 기존 위치에서 기록 찾기
          if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
            const recordIndex = calendarData[originalDateKey].records.findIndex(
              (r: any) => r.timestamp === editData.timestamp || 
                (r.isPrepaid && r.installmentId === editData.installmentId && r.date === editData.date)
            );

            if (recordIndex !== -1) {
              const existingRecord = calendarData[originalDateKey].records[recordIndex];

              // 날짜가 변경된 경우
              if (isDateChanged) {
                // 기존 위치에서 제거
                calendarData[originalDateKey].records.splice(recordIndex, 1);
                calendarData[originalDateKey].totalExpense = Math.max(0, 
                  (calendarData[originalDateKey].totalExpense || 0) - (existingRecord.amount || 0)
                );

                // 빈 날짜 데이터 정리
                if (calendarData[originalDateKey].records.length === 0) {
                  delete calendarData[originalDateKey];
                }

                // 새 위치에 데이터 구조 생성
                if (!calendarData[actualDateKey]) {
                  calendarData[actualDateKey] = {
                    totalExpense: 0,
                    totalIncome: 0,
                    records: [],
                  };
                }

                // 새 위치에 기록 추가 (선결제 필드 유지)
                calendarData[actualDateKey].records.push({
                  ...existingRecord,
                  ...newRecord,
                  date: actualDate,
                  prepaidDate: actualDate, // 선결제 일자도 업데이트
                  isPrepaid: true,
                  originalDate: existingRecord.originalDate || editData.originalDate, // 원래 예정일 유지
                  timestamp: editData.timestamp, // 유지
                  installmentId: editData.installmentId, // 유지
                });
                calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + monthlyAmount;
              } else {
                // 날짜 변경 없이 다른 필드만 업데이트
                calendarData[originalDateKey].records[recordIndex] = {
                  ...existingRecord,
                  ...newRecord,
                  date: actualDate,
                  prepaidDate: existingRecord.prepaidDate || actualDate, // 선결제 일자는 유지 (날짜 변경 없으면)
                  isPrepaid: true,
                  originalDate: existingRecord.originalDate || editData.originalDate, // 원래 예정일 유지
                  timestamp: editData.timestamp, // 유지
                  installmentId: editData.installmentId, // 유지
                };
              }
            }
          }
        } else if (editData.isRecurring || editData.isInstallment) {
          // 정기 기록 또는 할부 기록 수정 (선결제 기록 제외)
          // 개별 수정: 해당 건만 수정 (부모/자식 관계 유지)
          // 할부 기록 수정 시에는 기존 금액을 사용하여 재할부 방지
          const singleUpdateAmount =
            editData.isRefunded || editData.isSettled
              ? 0
              : editData.isInstallment && editData.originalInstallment
                ? editData.amount // 할부 기록은 기존 금액 사용
                : monthlyAmount; // 일반 기록은 새 금액 사용

          await handleSingleRecordUpdate(calendarData, editData, newRecord, actualDateKey, singleUpdateAmount);

          if (editData.isRecurring && !editData.isPrepaid) {
            try {
              const recordKey = editData.timestamp
                ? editData.timestamp.toString()
                : (typeof editData.id === 'string' ? editData.id : null);
              if (recordKey) {
                const isRefundedRecurringEdit = editData.isRefunded === true;
                const isSettledRecurringEdit = editData.isSettled === true;
                const persistedAmount =
                  isRefundedRecurringEdit || isSettledRecurringEdit ? 0 : monthlyAmount;
                const updateData: Partial<ExpenseRecordType> = {
                  type: 'expense',
                  amount: persistedAmount,
                  category,
                  memo,
                  date: actualDate,
                  timestamp: editData.timestamp,
                  isRecurring,
                  weekendOption,
                  recurringId,
                  isAutoGenerated: false,
                  totalMonths,
                  recurringType,
                  isPrepaid: editData.isPrepaid,
                  prepaidDate: editData.prepaidDate,
                  originalDate: editData.originalDate,
                  paymentMethod,
                  paymentSubtypeId:
                    paymentMethod === 'cash'
                      ? undefined
                      : selectedPaymentSubtype?.id ??
                        (paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId),
                };
                if (isSettledRecurringEdit) {
                  updateData.isSettled = true;
                  if (typeof editData.settledAt === 'string') {
                    updateData.settledAt = editData.settledAt;
                  }
                  if (typeof editData.originalAmountBeforeSettlement === 'number') {
                    updateData.originalAmountBeforeSettlement = editData.originalAmountBeforeSettlement;
                  }
                } else if (isRefundedRecurringEdit) {
                  updateData.isRefunded = true;
                  if (typeof editData.refundedAt === 'string') {
                    updateData.refundedAt = editData.refundedAt;
                  }
                  if (typeof editData.originalAmountBeforeRefund === 'number') {
                    updateData.originalAmountBeforeRefund = editData.originalAmountBeforeRefund;
                  }
                } else if (editData.isRecurring) {
                  updateData.originalAmountBeforeRefund = monthlyAmount;
                }
                await updateExpense(recordKey, updateData);
              }
            } catch (error) {
              console.error('[expense-record] recurring single update failed:', error);
            }

            const calendarDataString = JSON.stringify(calendarData, (key, value) => {
              if (key === 'recurringType' && value === undefined) {
                return null;
              }
              return value;
            });
            await AsyncStorage.setItem('calendarData', calendarDataString);

            if (category) {
              const recordDateObj = new Date(actualDateKey);
              triggerChallengeNotifications(category, recordDateObj).catch((_error) => {});
            }
            
            // 소비 기록 저장 후 일일 리마인더 정책 재적용
            rescheduleDailyReminderIfNeeded().catch((_error) => {});

            let targetDateKey = actualDateKey;
            const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
            targetDateKey = originalDateKey !== actualDateKey ? actualDateKey : originalDateKey;
            if (params.dateKey) {
              targetDateKey = params.dateKey;
            }
            const [yearNum, monthNum, dayNum] = targetDateKey.split('-').map(Number);
            const savedDate = new Date(yearNum, monthNum - 1, dayNum);
            const currentMonthStartDay = await loadMonthStartDay();
            const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
            if (mode === 'edit') {
              await goTimelineWithFocusAfterSave({
                year: customMonthInfo.year,
                month: customMonthInfo.month,
                targetDate: targetDateKey,
              });
            } else {
              await goHomeWithFocus({
                year: customMonthInfo.year,
                month: customMonthInfo.month,
                targetDate: targetDateKey,
              });
            }
            return;
          }
        } else {
          // 일반 기록 수정 (기존 로직)
          const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
          let preservedAdjustmentForGeneral: Record<string, unknown> = {};

          // 기존 위치에서 기록 삭제 (날짜 변경 여부와 상관없이)
          if (calendarData[originalDateKey] && calendarData[originalDateKey].records) {
            // actualRecordIndex가 있으면 직접 사용, 없으면 timestamp로 찾기
            let originalRecordIndex = -1;
            
            if (editData.actualRecordIndex !== undefined && editData.actualRecordIndex !== null) {
              // actualRecordIndex 사용 (타임라인에서 전달받은 정확한 인덱스)
              originalRecordIndex = editData.actualRecordIndex;

            } else {
              // timestamp로 찾기 (legacy 호환)
              originalRecordIndex = calendarData[originalDateKey].records.findIndex(
                (r: any) => r.timestamp === editData.timestamp
              );

            }
            
            if (originalRecordIndex !== -1 && originalRecordIndex < calendarData[originalDateKey].records.length) {
              const originalRecord = calendarData[originalDateKey].records[originalRecordIndex];

              if (originalRecord.isRefunded === true) {
                preservedAdjustmentForGeneral.isRefunded = true;
                if (typeof originalRecord.refundedAt === 'string') {
                  preservedAdjustmentForGeneral.refundedAt = originalRecord.refundedAt;
                }
                if (typeof originalRecord.originalAmountBeforeRefund === 'number') {
                  preservedAdjustmentForGeneral.originalAmountBeforeRefund =
                    originalRecord.originalAmountBeforeRefund;
                }
              }
              if (originalRecord.isSettled === true) {
                preservedAdjustmentForGeneral.isSettled = true;
                if (typeof originalRecord.settledAt === 'string') {
                  preservedAdjustmentForGeneral.settledAt = originalRecord.settledAt;
                }
                if (typeof originalRecord.originalAmountBeforeSettlement === 'number') {
                  preservedAdjustmentForGeneral.originalAmountBeforeSettlement =
                    originalRecord.originalAmountBeforeSettlement;
                }
              }

              calendarData[originalDateKey].records.splice(originalRecordIndex, 1);
              
              // 기존 날짜의 총액에서 차감
              if (originalRecord.type === 'expense') {
                calendarData[originalDateKey].totalExpense = Math.max(0, 
                  (calendarData[originalDateKey].totalExpense || 0) - (originalRecord.amount || 0)
                );
              } else if (originalRecord.type === 'income') {
                calendarData[originalDateKey].totalIncome = Math.max(0, 
                  (calendarData[originalDateKey].totalIncome || 0) - (originalRecord.amount || 0)
                );
              }
              
              // 빈 날짜 데이터 정리
              if (calendarData[originalDateKey].records.length === 0) {
                delete calendarData[originalDateKey];
              }

            } else {

            }
          }
          
          // 새 위치에 기록 추가 (날짜 데이터가 없으면 초기화)
          if (!calendarData[actualDateKey]) {
            calendarData[actualDateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };

          }
          
          calendarData[actualDateKey].records.push({
            ...newRecord,
            timestamp: editData.timestamp, // Keep original timestamp
            ...preservedAdjustmentForGeneral,
          });
          calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + monthlyAmount;

        }
      } else {
        // Create mode: Add new record
        calendarData[actualDateKey].records.push(newRecord);
        calendarData[actualDateKey].totalExpense = (calendarData[actualDateKey].totalExpense || 0) + monthlyAmount;

      }

      // 4. 정기 지출 또는 할부 옵션인 경우 다음 달들에도 기록 생성 (생성 모드에서만)
      if ((isRecurring || isInstallment) && mode !== 'edit') {

      // 정기 지출 또는 할부 옵션 시 월별 금액 계산 (미래 기록용)
      let futureMonthlyAmount: number;
      if (isInstallment) {
        futureMonthlyAmount = Math.floor(expenseAmount / totalMonths);  // 소수점 제거하여 정수로 계산
      } else {
        futureMonthlyAmount = expenseAmount;
      }
        
        // 엣지 케이스: 주말→주중 / 주중→주말 조정 여부
        const isEdgeCaseAdjusted = isRecurring && (
          (recurringType === '주중' && isWeekendDay) ||
          (recurringType === '주말' && isWeekday)
        );

        // 기본은 기존 로직(조정된 actualDate 기준). 엣지 케이스만 원본 날짜 기준으로 계산
        const startDateForIterations = isEdgeCaseAdjusted ? date : actualDate;
        const [yearNum, monthNum, dayNum] = startDateForIterations.split('.').map(Number);
        const startYear = yearNum;
        
        // 정기 옵션인 경우 recurringType에 따라 반복 횟수 계산
        let iterations: number;
        if (isRecurring) {
          // 정기 옵션: recurringType 기반으로 반복 횟수 계산 (엣지 케이스만 원본 날짜 기준)
          iterations = calculateRecurringIterations(startDateForIterations, recurringType);
        } else {
          // 할부 옵션: totalMonths 사용 (기존 로직 유지)
          iterations = totalMonths;
        }
        
        // 반복 날짜 계산 시작점 (엣지 케이스만 원본 날짜 기준)
        let currentDate = startDateForIterations;
        let iteration = 0;
        
        // 반복 생성 (시작일 제외, i=1부터 시작)
        while (iteration < iterations - 1) {
          iteration++;
          
          // 다음 날짜 계산
          let nextDate: string | null;
          if (isRecurring) {
            // 정기 옵션: recurringType에 따라 다음 날짜 계산
            nextDate = getNextRecurringDate(currentDate, recurringType, iteration, startYear);
            if (!nextDate) {
              // 해당 년도 초과 시 중단
              break;
            }
          } else {
            // 할부 옵션: 월 단위로 증가 (기존 로직)
            let futureMonth = monthNum + iteration;
            let futureYear = yearNum;
            
            // 월이 12를 넘으면 연도 증가
            while (futureMonth > 12) {
              futureMonth -= 12;
              futureYear += 1;
            }
            
            // 해당 년도 초과 시 중단
            if (futureYear > startYear) {
              break;
            }
            
            // 월말 처리: 해당 월의 실제 일자 계산
            const actualDay = getActualDayForMonth(futureYear, futureMonth, dayNum);
            
            // 미래 날짜 생성
            nextDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
          }
          
          if (!nextDate) {
            break;
          }
          
          // 엣지 케이스 처리: 첫 번째 반복 날짜가 actualDate와 겹치지 않도록 보장
          // 원본 날짜 기준으로 계산했지만, 엣지 케이스로 조정된 경우 첫 반복 날짜가 actualDate 이하이면 한 번 더 건너뛰기
          if (iteration === 1 && isRecurring && isEdgeCaseAdjusted) {
            const [nextYearCheck, nextMonthCheck, nextDayCheck] = nextDate.split('.').map(Number);
            const [actualYear, actualMonth, actualDay] = actualDate.split('.').map(Number);
            const nextDateObj = new Date(nextYearCheck, nextMonthCheck - 1, nextDayCheck);
            const actualDateObj = new Date(actualYear, actualMonth - 1, actualDay);
            
            // 첫 번째 반복 날짜가 actualDate 이하이면 한 번 더 건너뛰기
            if (nextDateObj <= actualDateObj) {
              // nextDate를 기준으로 다음 반복 날짜를 다시 계산
              const nextNextDate = getNextRecurringDate(nextDate, recurringType, iteration, startYear);
              if (!nextNextDate) {
                // 다음 날짜가 없으면 중단
                break;
              }
              nextDate = nextNextDate;
            }
          }
          
          // 주말이면 조정 (단, 'weekend' 옵션이 아닐 때만)
          // 매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시
          const shouldIgnoreWeekendOption = isRecurring && ['매일', '주중', '주말'].includes(recurringType);
          const [nextYear, nextMonth, nextDay] = nextDate.split('.').map(Number);
          const futureDateObj = new Date(nextYear, nextMonth - 1, nextDay);
          const futureDayOfWeek = futureDateObj.getDay();
          
          let futureDate = nextDate;
          if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
            futureDate = getAdjustedWeekendDate(futureDate, weekendOption);
          }
          
          const futureDateKey = futureDate.replace(/\./g, '-');
          
          // 미래 날짜에 데이터 구조 생성
          if (!calendarData[futureDateKey]) {
            calendarData[futureDateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };
          }
          
          // 미래 기록 추가 (자동생성 표시)
          const futureRecord = {
            ...newRecord,
            id: generateRecordId(), // 각 기록마다 고유한 UUID
            amount: futureMonthlyAmount,
            date: futureDate,
            timestamp: newTimestamp + iteration,
            recurringId: isRecurring ? recurringId : undefined, // 정기 기록만
            installmentId: isInstallment ? installmentId : undefined, // 할부 기록만
            isAutoGenerated: true,
            isInstallment: isInstallment, // 할부 여부 저장
            totalMonths: isRecurring ? totalMonths : undefined, // 정기 기록 개월 수 저장
            installmentMonths: isInstallment ? totalMonths : undefined, // 할부 개월 수 저장
            originalInstallment: isInstallment, // 최초 생성 시 할부 설정 저장
            recurringType: isRecurring ? recurringType : undefined, // 정기 기록의 반복 타입 저장
            // 자동 생성 기록도 원본 데이터 초기화 (생성 시점의 값)
            originalAmount: futureMonthlyAmount,
            originalCategory: category,
            originalDate: futureDate,
          };
          
          calendarData[futureDateKey].records.push(futureRecord);
          
          calendarData[futureDateKey].totalExpense = (calendarData[futureDateKey].totalExpense || 0) + futureMonthlyAmount;
          
          // 다음 반복은 보정 전 날짜(nextDate)를 기준으로 계산해 드리프트를 방지
          currentDate = nextDate;
        }

      }

      // 6. 지출 기록 저장
      try {
        const recordsToSave: ExpenseRecordType[] = [];
        
        if (mode === 'edit' && editData) {
          // 수정 모드: 수정된 기록만 저장
          const updatedRecord: ExpenseRecordType = {
            type: 'expense',
            amount: monthlyAmount,
            category,
            memo,
            date: actualDate,
            timestamp: editData.timestamp, // 기존 timestamp 유지
            paymentMethod,
            paymentSubtypeId:
              paymentMethod === 'cash'
                ? undefined
                : selectedPaymentSubtype?.id ?? (paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId),
            isRecurring,
            weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
            recurringId: isRecurring ? recurringId : undefined,
            installmentId: isInstallment ? installmentId : undefined,
            isAutoGenerated: false,
            isInstallment: isInstallment ? true : undefined,
            totalMonths: isRecurring ? totalMonths : undefined,
            installmentMonths: isInstallment ? totalMonths : undefined,
            originalInstallment: isInstallment ? true : undefined,
            recurringType: isRecurring ? recurringType : undefined,
            isPrepaid: editData.isPrepaid,
            prepaidDate: editData.prepaidDate,
            originalDate: editData.originalDate,
            ...(typeof editData.id === 'string' && editData.id.length > 0 ? { id: editData.id } : {}),
            ...(editData.isRefunded === true
              ? {
                  isRefunded: true,
                  ...(typeof editData.refundedAt === 'string' ? { refundedAt: editData.refundedAt } : {}),
                  ...(typeof editData.originalAmountBeforeRefund === 'number'
                    ? { originalAmountBeforeRefund: editData.originalAmountBeforeRefund }
                    : {}),
                }
              : {}),
            ...(editData.isSettled === true
              ? {
                  isSettled: true,
                  ...(typeof editData.settledAt === 'string' ? { settledAt: editData.settledAt } : {}),
                  ...(typeof editData.originalAmountBeforeSettlement === 'number'
                    ? { originalAmountBeforeSettlement: editData.originalAmountBeforeSettlement }
                    : {}),
                }
              : {}),
          };
          recordsToSave.push(updatedRecord);
        } else {
          // 생성 모드: 새로 생성된 기록들 저장
          // 원본 기록
          recordsToSave.push({
            id: recordId, // UUID
            type: 'expense',
            amount: monthlyAmount,
            category,
            memo,
            date: actualDate,
            timestamp: newTimestamp,
            paymentMethod,
            paymentSubtypeId:
              paymentMethod === 'cash'
                ? undefined
                : selectedPaymentSubtype?.id ?? (paymentMethod === 'debit' ? defaultDebitSubtypeId : defaultCreditSubtypeId),
            isRecurring,
            weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
            recurringId: isRecurring ? recurringId : undefined,
            installmentId: isInstallment ? installmentId : undefined,
            isAutoGenerated: false,
            isInstallment: isInstallment ? true : undefined,
            totalMonths: isRecurring ? totalMonths : undefined,
            installmentMonths: isInstallment ? totalMonths : undefined,
            originalInstallment: isInstallment ? true : undefined,
            recurringType: isRecurring ? recurringType : undefined, // 정기 기록의 반복 타입 저장
            // 원본 데이터 초기화: 최초 생성 시 현재 값 = 원본 값
            originalAmount: monthlyAmount,
            originalCategory: category,
            originalDate: actualDate,
            createdVia: 'screen',
          });

          // 정기/할부 기록의 미래 기록들도 저장
          if ((isRecurring || isInstallment) && mode !== 'edit') {
            const [yearNum, monthNum, dayNum] = date.split('.').map(Number);
            const startYear = yearNum;
            const isEdgeCaseAdjusted = isRecurring && (
              (recurringType === '주중' && isWeekendDay) ||
              (recurringType === '주말' && isWeekday)
            );
            
            // 정기 옵션인 경우 recurringType에 따라 반복 횟수 계산
            let iterations: number;
            if (isRecurring) {
              // 정기 옵션: recurringType 기반으로 반복 횟수 계산
              iterations = calculateRecurringIterations(date, recurringType);
            } else {
              // 할부 옵션: totalMonths 사용 (기존 로직 유지)
              iterations = totalMonths;
            }
            
            let currentDate = date;
            let iteration = 0;
            
            // 반복 생성 (시작일 제외, i=1부터 시작)
            while (iteration < iterations - 1) {
              iteration++;
              
              // 다음 날짜 계산
              let nextDate: string | null;
              if (isRecurring) {
                // 정기 옵션: recurringType에 따라 다음 날짜 계산
                nextDate = getNextRecurringDate(currentDate, recurringType, iteration, startYear);
                if (!nextDate) {
                  // 해당 년도 초과 시 중단
                  break;
                }
              } else {
                // 할부 옵션: 월 단위로 증가 (기존 로직)
                let futureMonth = monthNum + iteration;
                let futureYear = yearNum;
                
                // 월이 12를 넘으면 연도 증가
                while (futureMonth > 12) {
                  futureMonth -= 12;
                  futureYear += 1;
                }
                
                // 해당 년도 초과 시 중단
                if (futureYear > startYear) {
                  break;
                }
                
                // 월말 처리: 해당 월의 실제 일자 계산
                const actualDay = getActualDayForMonth(futureYear, futureMonth, dayNum);
                
                // 미래 날짜 생성
                nextDate = `${futureYear}.${String(futureMonth).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
              }
              
              if (!nextDate) {
                break;
              }
              
              // 엣지 케이스 처리: 첫 번째 반복 날짜가 actualDate와 겹치지 않도록 보장
              if (iteration === 1 && isRecurring && isEdgeCaseAdjusted) {
                const [nextYearCheck, nextMonthCheck, nextDayCheck] = nextDate.split('.').map(Number);
                const [actualYear, actualMonth, actualDay] = actualDate.split('.').map(Number);
                const nextDateObj = new Date(nextYearCheck, nextMonthCheck - 1, nextDayCheck);
                const actualDateObj = new Date(actualYear, actualMonth - 1, actualDay);
                
                if (nextDateObj <= actualDateObj) {
                  const nextNextDate = getNextRecurringDate(nextDate, recurringType, iteration, startYear);
                  if (!nextNextDate) {
                    break;
                  }
                  nextDate = nextNextDate;
                }
              }
              
              // 주말이면 조정 (단, 'weekend' 옵션이 아닐 때만)
              // 매일, 주중, 주말 반복 기간을 선택한 경우 주말 옵션 무시
              const shouldIgnoreWeekendOption = isRecurring && ['매일', '주중', '주말'].includes(recurringType);
              const [nextYear, nextMonth, nextDay] = nextDate.split('.').map(Number);
              const futureDateObj = new Date(nextYear, nextMonth - 1, nextDay);
              const futureDayOfWeek = futureDateObj.getDay();
              
              let futureDate = nextDate;
              if ((futureDayOfWeek === 0 || futureDayOfWeek === 6) && weekendOption !== 'weekend' && !shouldIgnoreWeekendOption) {
                futureDate = getAdjustedWeekendDate(futureDate, weekendOption);
              }

              const futureMonthlyAmount = isInstallment 
                ? Math.floor(expenseAmount / totalMonths)
                : expenseAmount;

              recordsToSave.push({
                id: generateRecordId(), // 각 기록마다 고유한 UUID
                type: 'expense',
                amount: futureMonthlyAmount,
                category,
                memo,
                date: futureDate,
                timestamp: newTimestamp + iteration,
                isRecurring,
                weekendOption: (isRecurring || isInstallment) ? weekendOption : undefined,
                recurringId: isRecurring ? recurringId : undefined,
                installmentId: isInstallment ? installmentId : undefined,
                isAutoGenerated: true,
                isInstallment: isInstallment ? true : undefined,
                totalMonths: isRecurring ? totalMonths : undefined,
                installmentMonths: isInstallment ? totalMonths : undefined,
                originalInstallment: isInstallment ? true : undefined,
                recurringType: isRecurring ? recurringType : undefined, // 정기 기록의 반복 타입 저장
                // 자동 생성 기록도 원본 데이터 초기화 (생성 시점의 값)
                originalAmount: futureMonthlyAmount,
                originalCategory: category,
                originalDate: futureDate,
                createdVia: 'screen',
              });
              
              // 다음 반복은 보정 전 날짜(nextDate)를 기준으로 계산해 드리프트를 방지
              currentDate = nextDate;
            }
          }
        }

        // 지출 기록 저장
        // record_created: 건별 발행 / created_complete: 일반 단건 또는 정기·할부 배치 성공 후 1회
        const isBatchCreate =
          mode !== 'edit' && (isRecurring || isInstallment) && recordsToSave.length > 0;
        let batchCreateSavedCount = 0;
        let generalCreateSavedCount = 0;
        let generalCreateAnchor: ExpenseRecordType | null = null;

        for (const record of recordsToSave) {
          try {
            const recordId = record.id || record.timestamp.toString(); // UUID 우선, fallback으로 timestamp
            
            if (mode === 'edit' && editData) {
              // 수정 모드: 기록이 존재하는지 확인 후 업데이트 또는 생성
              const { getExpenseById } = await import('@/utils/expenses');
              const existingRecord = await getExpenseById(recordId);
              
              if (existingRecord) {
                const updateData: Partial<ExpenseRecordType> = {
                  ...record,
                  date: record.date,
                };
                await updateExpense(recordId, updateData);
              } else {
                await createExpense(record);
              }
            } else {
              // 생성 모드: record_created 건별 발행 (createExpense 내부)
              await createExpense(record);
              if (isBatchCreate) {
                batchCreateSavedCount += 1;
              } else if (mode !== 'edit') {
                generalCreateSavedCount += 1;
                if (generalCreateAnchor === null) {
                  generalCreateAnchor = record;
                }
              }
            }
          } catch (error) {
            console.error('[expense-record] Failed to save expense:', record.timestamp, error);
            // 개별 기록 저장 실패해도 다음 기록 계속 처리
          }
        }

        // created_complete: 일반 단건 생성 완료 1회
        if (
          !isBatchCreate &&
          mode !== 'edit' &&
          generalCreateSavedCount > 0 &&
          generalCreateAnchor !== null
        ) {
          logExpenseCreateComplete(
            expenseCreationVariantFromRecord(generalCreateAnchor),
            buildExpenseLifecycleAnalyticsPayload(generalCreateAnchor),
            buildExpenseCreationCompletionPayload(generalCreateAnchor, {
              repeatCountOverride: generalCreateSavedCount,
              simpleCreation: false,
            }),
          );
        }

        // created_complete: 정기·할부 배치 완료 1회
        if (isBatchCreate && batchCreateSavedCount > 0) {
          const anchor = recordsToSave[0];
          logExpenseCreateComplete(
            expenseCreationVariantFromRecord(anchor),
            buildExpenseLifecycleAnalyticsPayload(anchor),
            buildExpenseCreationCompletionPayload(anchor, {
              repeatCountOverride: batchCreateSavedCount,
              simpleCreation: false,
            }),
          );
        }
      } catch (error) {
        console.error('[expense-record] expense save error:', error);
        // 에러가 발생해도 AsyncStorage 저장은 계속 진행
      }

      // 6-1. AsyncStorage에 저장 (로컬 캐시)
      // JSON.stringify는 undefined 값을 제거하므로, recurringType을 명시적으로 포함시켜야 함
      // calendarData를 깊은 복사하면서 recurringType이 undefined인 경우에도 명시적으로 포함
      const calendarDataToSave = JSON.parse(JSON.stringify(calendarData, (key, value) => {
        // recurringType이 undefined인 경우 null로 변환하여 저장
        if (key === 'recurringType' && value === undefined) {
          return null;
        }
        return value;
      }));
      
      const stringified = JSON.stringify(calendarDataToSave);
      await AsyncStorage.setItem('calendarData', stringified);

      // 6-1.5. rebuildCalendarData 실행 (expenseData에서 calendarData 재구성)
      // 이렇게 하면 expenseData에 저장된 recurringType이 calendarData에 반영됨
      await rebuildCalendarData();

      // 6-1.6. 위젯에 이번달 소비 즉시 반영 (동기화 완료 후 화면 전환)
      await refreshWidgetWithCurrentMonth().catch(() => {});

      // 6-2. 챌린지 알림 트리거 (비동기이지만 대기하지 않음)
      if (category) {
        const recordDateObj = new Date(actualDateKey);
        triggerChallengeNotifications(category, recordDateObj).catch(error => {

        });
      }
      
      // 소비 기록 저장 후 일일 리마인더 정책 재적용
      rescheduleDailyReminderIfNeeded().catch((_error) => {});
      
      // 7. 홈으로 이동
      // 오늘만 수정 모드에서는 날짜 변경 여부에 따라 이동
      // 전체 수정 모드에서는 최초 생성 날짜로 이동
      let targetDateKey = actualDateKey;
      if (mode === 'edit' && editData) {
        // 개별 수정: 날짜가 변경된 경우 변경된 날짜로 이동, 변경되지 않은 경우 원래 날짜로 이동
        const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : actualDateKey;
        const isDateChanged = originalDateKey !== actualDateKey;
        
        if (isDateChanged) {
          targetDateKey = actualDateKey;
        } else {
          targetDateKey = originalDateKey;
        }
        if (editData.isRecurring && params.dateKey) {
          targetDateKey = params.dateKey;
        }
      } else {
        // 생성 모드: 생성된 날짜로 이동
        targetDateKey = actualDateKey;
      }
      
      // 🔧 수정: 실제 저장된 날짜가 속한 커스텀 월로 이동
      // 날짜 문자열을 로컬 타임존으로 파싱
      const [yearNum, monthNum, dayNum] = targetDateKey.split('-').map(Number);
      const savedDate = new Date(yearNum, monthNum - 1, dayNum);
      
      // 월 시작일 로드
      const currentMonthStartDay = await loadMonthStartDay();
      
      
      
      // 실제 날짜가 속한 커스텀 월 계산
      const customMonthInfo = getCustomMonthInfo(savedDate, currentMonthStartDay);
      const targetYear = customMonthInfo.year;
      const targetMonth = customMonthInfo.month;

      if (mode === 'edit') {
        await goTimelineWithFocusAfterSave({
          year: targetYear,
          month: targetMonth,
          targetDate: targetDateKey,
        });
      } else {
        await goHomeWithFocus({
          year: targetYear,
          month: targetMonth,
          targetDate: targetDateKey,
        });
      }
    } catch (error) {
      console.error('[SAVE] error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 주말 날짜를 금요일 또는 월요일로 조정하는 함수
  const getAdjustedWeekendDate = (dateString: string, option: 'friday' | 'monday'): string => {
    const [year, month, day] = dateString.split('.').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    
    if (dayOfWeek === 0) {
      // 일요일
      if (option === 'friday') {
        // 금주 금요일 = -2일
        dateObj.setDate(dateObj.getDate() - 2);
      } else {
        // 차주 월요일 = +1일
        dateObj.setDate(dateObj.getDate() + 1);
      }
    } else if (dayOfWeek === 6) {
      // 토요일
      if (option === 'friday') {
        // 금주 금요일 = -1일
        dateObj.setDate(dateObj.getDate() - 1);
      } else {
        // 차주 월요일 = +2일
        dateObj.setDate(dateObj.getDate() + 2);
      }
    }
    
    const adjustedYear = dateObj.getFullYear();
    const adjustedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
    const adjustedDay = String(dateObj.getDate()).padStart(2, '0');
    
    return `${adjustedYear}.${adjustedMonth}.${adjustedDay}`;
  };

  const rebuildCalendarData = useCallback(async () => {
    try {
      // 동적 import 제거 - 정적 import로 변경하여 번들링 지연 방지
      const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);

      const calendarData: Record<string, CalendarBucket> = {};

      expenses.forEach((expense) => {
        if (expense.isDeleted) {
          return;
        }
        const dateKey = expense.date.replace(/\./g, '-');
        if (!calendarData[dateKey]) {
          calendarData[dateKey] = { totalExpense: 0, totalIncome: 0, records: [] };
        }
        
        const recordToPush = {
          ...expense,
          type: 'expense',
          originalAmountBeforeRefund: expense.originalAmountBeforeRefund,
        };
        
        calendarData[dateKey].records.push(recordToPush);
        if (!expense.isRefunded) {
          calendarData[dateKey].totalExpense += expense.amount || 0;
        }
      });

      incomes.forEach((income) => {
        if (income.isDeleted) {
          return;
        }
        const dateKey = income.date.replace(/\./g, '-');
        if (!calendarData[dateKey]) {
          calendarData[dateKey] = { totalExpense: 0, totalIncome: 0, records: [] };
        }
        calendarData[dateKey].records.push({
          ...income,
          type: 'income',
          category: income.category ?? '수입',
        });
        calendarData[dateKey].totalIncome += income.amount || 0;
      });

      Object.keys(calendarData).forEach((dateKey) => {
        const bucket = calendarData[dateKey];
        if (!bucket.records || bucket.records.length === 0) {
          delete calendarData[dateKey];
        }
      });

      // recurringType이 undefined인 경우 null로 변환하여 저장 (JSON.stringify는 undefined를 제거함)
      const stringified = JSON.stringify(calendarData, (key, value) => {
        if (key === 'recurringType' && value === undefined) {
          return null;
        }
        return value;
      });
      
      await AsyncStorage.setItem('calendarData', stringified);
    } catch (error) {
      console.error('[calendar] Failed to rebuild calendar data:', error);
    }
  }, []);

  const syncExpenseRecord = useCallback(
    async (record: any, updates: Partial<ExpenseRecordType>) => {
      const primaryId = typeof record?.id === 'string' && record.id.length > 0 ? record.id : null;
      const timestampId =
        typeof record?.timestamp === 'number' ? record.timestamp.toString() : null;

      let updated: ExpenseRecordType | null = null;
      if (primaryId) {
        try {
          updated = await updateExpense(primaryId, updates);
        } catch {
          updated = null;
        }
      }
      if (!updated && timestampId) {
        try {
          updated = await updateExpense(timestampId, updates);
        } catch {
          updated = null;
        }
      }
      if (updated) {
        return updated;
      }

      // update 경로에서 못 찾는 레거시/파생 기록은 생성(upsert 유사)으로 보강
      const fallbackRecord: ExpenseRecordType = {
        ...(record as ExpenseRecordType),
        ...updates,
        type: 'expense',
        amount: Number((updates.amount ?? record?.amount) ?? 0),
        date: String(record?.date ?? ''),
        timestamp: Number(record?.timestamp ?? 0),
        category: String(record?.category ?? ''),
      };

      if (!fallbackRecord.date || !fallbackRecord.timestamp || !fallbackRecord.category) {
        return null;
      }

      try {
        return await createExpense(fallbackRecord);
      } catch {
        return null;
      }
    },
    [],
  );

  const handleBack = () => {
    router.back();
  };

  const handleDeleteConfirm = async () => {
    if (mode !== 'edit' || !editData) {
      return;
    }

    setLoading(true);
    try {
      if (editData.isInstallment && editData.installmentId) {
        await deleteExpensesByGroup({ installmentId: editData.installmentId });
      }

      if (editData.isRecurring && editData.recurringId) {
        await deleteExpensesByGroup({ recurringId: editData.recurringId });
      }

      if (!editData.isInstallment && !editData.isRecurring && typeof editData.timestamp === 'number') {
        const deleteKey = typeof editData.id === 'string'
          ? editData.id
          : editData.timestamp.toString();
        const deleted = await deleteExpense(deleteKey);
        if (!deleted) {
          console.warn('[DELETE] No expense deleted for id:', deleteKey);
        }
      }

      await rebuildCalendarData();

      // 위젯에 이번달 소비 즉시 반영 (동기화 완료 후 화면 전환)
      await refreshWidgetWithCurrentMonth().catch(() => {});

      // 챌린지 알림 재계산 (삭제 후 소비율 변경 반영)
      if (editData.category) {
        const recordDateObj = new Date(editData.date || date);
        triggerChallengeNotifications(editData.category, recordDateObj).catch(error => {
          console.error('[expense-record] Failed to trigger challenge notifications after delete:', error);
        });
      }
      
      // 소비 기록 삭제 시 당일 알림 재스케줄링 (오후 8시 전이면)
      rescheduleDailyReminderIfNeeded().catch((_error) => {});

      setShowDeleteConfirm(false);

      const recordDateKey = formatDateKey(editData.date || date);
      const [targetYear, targetMonth] = recordDateKey.split('-').map(Number);

      // goHomeWithFocus 내부에서 refresh: true로 자동 새로고침되므로 중복 호출 제거
      if (params.calendarYear && params.calendarMonth) {
        await goHomeWithFocus({ year: Number(params.calendarYear), month: Number(params.calendarMonth), targetDate: recordDateKey });
      } else {
        await goHomeWithFocus({ year: targetYear, month: targetMonth, targetDate: recordDateKey });
      }
    } catch (error) {
      console.error('[DELETE] Failed to delete records:', error);
    } finally {
      setLoading(false);
    }
  };

  // 일반 기록 단일 환불 처리
  const handleSingleRecordRefund = async () => {
    if (mode !== 'edit' || !editData || editData.isInstallment || editData.isRecurring) {
      return;
    }

    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
      if (!originalDateKey || !calendarData[originalDateKey]?.records) {
        return;
      }

      const recordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => r.id === editData.id || r.timestamp === editData.timestamp
      );
      if (recordIndex === -1) {
        return;
      }

      const record = calendarData[originalDateKey].records[recordIndex];
      if (record.isPrepaid) {
        return;
      }

      const originalAmount = record.amount || 0;
      record.originalAmountBeforeRefund = originalAmount;

      record.isRefunded = true;
      record.refundedAt = new Date().toISOString();
      record.amount = 0;

      calendarData[originalDateKey].totalExpense = Math.max(
        0,
        (calendarData[originalDateKey].totalExpense || 0) - originalAmount,
      );

      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      const recordIdForSingleRefund = record.id || record.timestamp.toString();
      try {
        await updateExpense(recordIdForSingleRefund, {
          isRefunded: true,
          originalAmountBeforeRefund: record.originalAmountBeforeRefund,
          amount: 0,
        });
      } catch (_error) {
        // ignore
      }

      calendarRefreshEvent.emit();

      rescheduleDailyReminderIfNeeded().catch(() => {});

      try {
        logExpenseAdjustment({
          adjustment: 'isrefunded',
          state: 'applied',
          refund_scope: mapRefundOptionToAnalytics('all'),
          expense_variant: expenseCreationVariantFromInstallmentFlags(
            record.isInstallment,
            record.isRecurring,
          ),
        });
      } catch {
        // analytics only
      }

      const recordDate = editData.date || date;
      const dateKey = formatDateKey(recordDate);
      showToast('정상적으로 환불 처리가 완료 되었습니다.');
      await goTimelineWithFocus(dateKey);
    } finally {
      setLoading(false);
    }
  };

  // 일반 기록 단일 결산 처리
  const handleSingleRecordSettlement = async () => {
    if (mode !== 'edit' || !editData) {
      return;
    }

    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
      if (!originalDateKey || !calendarData[originalDateKey]?.records) {
        return;
      }

      const recordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => r.id === editData.id || r.timestamp === editData.timestamp
      );
      if (recordIndex === -1) {
        return;
      }

      const record = calendarData[originalDateKey].records[recordIndex];
      if (record.isSettled) {
        return;
      }

      const currentAmount = Number(record.amount || 0);
      const settledAt = new Date().toISOString();
      record.originalAmountBeforeSettlement =
        typeof record.originalAmountBeforeSettlement === 'number'
          ? record.originalAmountBeforeSettlement
          : currentAmount;
      record.isSettled = true;
      record.settledAt = settledAt;
      record.amount = 0;

      calendarData[originalDateKey].totalExpense = Math.max(
        0,
        (calendarData[originalDateKey].totalExpense || 0) - currentAmount,
      );

      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      const syncedSettlement = await syncExpenseRecord(record, {
        isSettled: true,
        settledAt,
        originalAmountBeforeSettlement: record.originalAmountBeforeSettlement,
        amount: 0,
      });
      if (!syncedSettlement) {
        // expenseData 동기화가 실패하면 rebuild 시 결산 플래그 유실 가능성이 커서 중단
        return;
      }

      calendarRefreshEvent.emit();

      rescheduleDailyReminderIfNeeded().catch(() => {});

      try {
        if (syncedSettlement) {
          logExpenseAdjustment({
            adjustment: 'issettled',
            state: 'applied',
            refund_scope: null,
            expense_variant: expenseCreationVariantFromRecord(syncedSettlement),
          });
        }
      } catch {
        // analytics only
      }

      // 현재 화면 즉시 반영
      setAmount('0');
      editData.amount = 0;
      editData.isSettled = true;
      editData.settledAt = settledAt;
      if (typeof editData.originalAmountBeforeSettlement !== 'number') {
        editData.originalAmountBeforeSettlement = currentAmount;
      }

      const dateKey = formatDateKey(editData.date || date);
      showToast('정상적으로 결산 처리가 완료 되었습니다.');
      await goTimelineWithFocus(dateKey);
    } finally {
      setShowSettlementConfirmModal(false);
      setLoading(false);
    }
  };

  // 그룹 기록 환불 처리 옵션별 처리 (할부/정기)
  const handleMultipleRecordsRefund = async () => {
    if (mode !== 'edit' || !editData || (!editData.isInstallment && !editData.isRecurring)) {
      return;
    }

    setLoading(true);
    try {
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      // 그룹 ID 확인
      const groupId = editData.isInstallment ? editData.installmentId : editData.recurringId;
      const groupKey = editData.isInstallment ? 'installmentId' : 'recurringId';
      if (!groupId) {
        return;
      }

      // 할부 기록의 시작일 정보 계산
      const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, totalMonths);

      // 환불할 기록들 찾기
      const recordsToRefund: {dateKey: string, record: any}[] = [];
      
      Object.keys(calendarData).forEach(dateKey => {
        if (calendarData[dateKey].records) {
          const relatedRecords = calendarData[dateKey].records.filter(
            (r: any) => r[groupKey] === groupId
          );
          
          relatedRecords.forEach((record: any) => {
            if (record.isPrepaid) {
              return;
            }
            const currentDate = new Date();
            
            // 편집하려는 날짜의 일(day) 정보 추출
            const editDate = parseRecordDate(editData.date, currentDate);
            const editDay = editDate.getDate();
            
            // 유틸리티 함수 사용 (편집 중인 날짜 정보 전달)
            const shouldRefundRecord = shouldMatchScope(record, refundOption, currentDate, startYear, startMonth, editYear, editMonth, editDay);
            
            if (shouldRefundRecord) {
              recordsToRefund.push({ dateKey, record });
            }
          });
        }
      });

      

      const refundBackupById = new Map<string, number>();

      // 기록들 환불 처리 (삭제와 달리 기록은 유지하되 금액을 0으로 변경)
        for (const { dateKey, record } of recordsToRefund) {
        const recordIndex = calendarData[dateKey].records.findIndex(
          (r: any) => r.timestamp === record.timestamp
        );

        if (recordIndex !== -1) {
          const recordKey = record.timestamp.toString();
          const storedRecord = await getExpenseById(recordKey);
          const originalAmount =
            record.amount && record.amount > 0
              ? record.amount
              : storedRecord?.amount && storedRecord.amount > 0
              ? storedRecord.amount
              : storedRecord?.originalAmount ?? record.originalAmount ?? 0;

          // 복구를 위해 환불 전 금액 백업 (환불 시점 금액 기준)
          calendarData[dateKey].records[recordIndex].originalAmountBeforeRefund = originalAmount;
          refundBackupById.set(recordKey, originalAmount);

          // 기록 환불 처리 (isRefunded 플래그 추가, 금액을 0으로 변경)
          calendarData[dateKey].records[recordIndex].isRefunded = true;
          calendarData[dateKey].records[recordIndex].refundedAt = new Date().toISOString();
          calendarData[dateKey].records[recordIndex].amount = 0;

          // 총액에서 차감 (캘린더에 표시되지 않도록)
          if (record.type === 'expense') {
            calendarData[dateKey].totalExpense = Math.max(0, 
              (calendarData[dateKey].totalExpense || 0) - originalAmount
            );
          } else if (record.type === 'income') {
            calendarData[dateKey].totalIncome = Math.max(0, 
              (calendarData[dateKey].totalIncome || 0) - originalAmount
            );
          }

          // 환불된 기록은 타임라인에 표시되어야 하므로 날짜 데이터를 삭제하지 않음
          // 날짜 데이터가 없으면 생성 (환불된 기록만 있어도 표시되도록)
          if (!calendarData[dateKey]) {
            calendarData[dateKey] = {
              totalExpense: 0,
              totalIncome: 0,
              records: [],
            };
          }

          // 환불된 기록이 있으면 날짜 데이터는 유지해야 함
          // (캘린더에는 표시되지 않지만 타임라인에는 표시됨)
        }
      }

      // AsyncStorage에 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 환불 기록 업데이트
      try {
        for (const { record } of recordsToRefund) {
          const recordId = record.timestamp.toString();
          const backupAmount = refundBackupById.get(recordId);
          await updateExpense(recordId, {
            isRefunded: true,
            originalAmountBeforeRefund: backupAmount,
            amount: 0,
          });
        }
      } catch (_error) {
        // 에러가 발생해도 AsyncStorage 저장은 완료되었으므로 계속 진행
      }
      
      await rebuildCalendarData();
      calendarRefreshEvent.emit();

      rescheduleDailyReminderIfNeeded().catch(() => {});

      try {
        if (recordsToRefund.length > 0) {
          logExpenseAdjustment({
            adjustment: 'isrefunded',
            state: 'applied',
            refund_scope: mapRefundOptionToAnalytics(refundOption),
            expense_variant: expenseCreationVariantFromInstallmentFlags(
              editData.isInstallment,
              editData.isRecurring,
            ),
          });
        }
      } catch {
        // analytics only
      }

      // 모달 닫기
      setShowRefundOptions(false);
      const dateKey = formatDateKey(editData.date || date);
      showToast('정상적으로 환불 처리가 완료 되었습니다.');
      await goTimelineWithFocus(dateKey);
      
    } catch (_error) {
    } finally {
      setLoading(false);
    }
  };

  // 선결제 처리 복구 로직
  const handlePrepaymentRestore = async () => {
    if (mode !== 'edit' || !editData || !editData.isPrepaid) {
      return;
    }

    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};

      // 선결제 기록의 현재 날짜와 위치 찾기
      const prepaidDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
      if (!prepaidDateKey || !calendarData[prepaidDateKey]) {
        return;
      }

      const groupId = editData.isInstallment ? editData.installmentId : editData.recurringId;
      const groupKey = editData.isInstallment ? 'installmentId' : 'recurringId';

      // 선결제 기록 찾기
      let recordIndex = -1;
      let prepaidRecord: any = null;

      if (calendarData[prepaidDateKey].records) {
        recordIndex = calendarData[prepaidDateKey].records.findIndex((r: any) => {
          if (r.id === editData.id || r.timestamp === editData.timestamp) return true;
          if (groupId && r[groupKey] === groupId && r.isPrepaid === true) return true;
          return false;
        });

        if (recordIndex !== -1) {
          prepaidRecord = calendarData[prepaidDateKey].records[recordIndex];
        }
      }

      const originDateValue = prepaidRecord?.installmentOriginDate || prepaidRecord?.originalDate;
      if (!prepaidRecord || !originDateValue) {
        return;
      }

      // 원래 기록일자로 복구 (originalDate에 저장된 원래 예정일 사용)
      const originalScheduledDate = originDateValue;
      const originalDateKey = originalScheduledDate.replace(/\./g, '-');
      const originalDateFormatted = originalScheduledDate; // "YYYY.MM.DD" 형식

      // 선결제 기록 삭제
      calendarData[prepaidDateKey].totalExpense = Math.max(0, 
        calendarData[prepaidDateKey].totalExpense - prepaidRecord.amount
      );
      calendarData[prepaidDateKey].records.splice(recordIndex, 1);

      // 빈 날짜 정리
      if (calendarData[prepaidDateKey].records.length === 0) {
        delete calendarData[prepaidDateKey];
      }

      // 원래 날짜에 데이터 구조 생성
      if (!calendarData[originalDateKey]) {
        calendarData[originalDateKey] = {
          totalExpense: 0,
          totalIncome: 0,
          records: [],
        };
      }

      // 원래 할부 기록 복구 (선결제 정보 제거)
      // 복구 시 originalDate는 원래 예정일 그대로 유지 (선결제 전 원본 날짜)
      const restoredRecord = {
        ...prepaidRecord,
        date: originalDateFormatted,
        isPrepaid: false,
        prepaidDate: undefined,
        // originalDate는 원래 예정일로 유지 (선결제 전 날짜)
        // 기존 필드 유지
        timestamp: prepaidRecord.timestamp,
      };

      calendarData[originalDateKey].records.push(restoredRecord);
      calendarData[originalDateKey].totalExpense += prepaidRecord.amount;

      // 저장
      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 선결제 복구 기록 업데이트
      try {
        const recordId = restoredRecord.id || restoredRecord.timestamp.toString(); // UUID 우선, fallback으로 timestamp
        await updateExpense(recordId, {
          date: originalDateFormatted,
          isPrepaid: false,
          prepaidDate: undefined,
          wasRestored: true,
          // originalDate는 원래 예정일로 유지 (변경하지 않음)
        });
      } catch (_error) {
        // 에러가 발생해도 AsyncStorage 저장은 완료되었으므로 계속 진행
      }

      try {
        logExpenseAdjustment({
          adjustment: 'isprepaid',
          state: 'restored',
          refund_scope: null,
          expense_variant: expenseCreationVariantFromInstallmentFlags(
            restoredRecord.isInstallment,
            restoredRecord.isRecurring,
          ),
        });
      } catch {
        // analytics only
      }

      // 모달 닫기
      setShowPrepaymentRestore(false);
      showToast('정상적으로 복구 처리가 완료 되었습니다.');
      await goTimelineWithFocus(originalDateKey);

    } catch (error) {
      console.error('선결제 처리 복구 중 오류:', error);
    } finally {
      setLoading(false);
    }
  };

  // 환불 처리 복구 로직
  const handleRefundRestore = async () => {
    if (mode !== 'edit' || !editData || !editData.isRefunded) {
      return;
    }

    setLoading(true);
    try {
      
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      
      if (editData.isInstallment) {
        // 할부 기록 ID 확인
        const installmentId = editData.installmentId;
        if (!installmentId) {
          return;
        }

        // 할부 기록의 모든 기록 찾기
        const allInstallmentRecords: {dateKey: string, record: any}[] = [];
      
        Object.keys(calendarData).forEach(dateKey => {
          if (calendarData[dateKey].records) {
            const relatedRecords = calendarData[dateKey].records.filter(
              (r: any) => r.installmentId === installmentId
            );
            
            relatedRecords.forEach((record: any) => {
              allInstallmentRecords.push({ dateKey, record });
            });
          }
        });

        const parsedEditDate = parseRecordDate(editData.date, new Date());
        const editDay = parsedEditDate.getDate();
        const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, totalMonths);

        // 환불된 기록 찾기
        const refundedRecords = allInstallmentRecords.filter(
          ({ record }) => record.isRefunded
        );
        const targetRefundedRecords = refundedRecords.filter(({ record }) =>
          shouldMatchScope(record, refundRestoreOption, new Date(), startYear, startMonth, editYear, editMonth, editDay)
        );

        if (targetRefundedRecords.length === 0) {
          return;
        }

      // 할부 기록의 원본 금액 계산 로직 개선
        let monthlyAmount = 0;
        let totalMonthsInGroup = 0; // 실제 그룹 내 총 개월수
        let maxAmountInGroup = 0; // 최대 금액 (잔여 금액이 포함된 첫 달 금액)
      
      // 모든 할부 기록의 금액을 수집 (0원인 환불 기록 제외)
        const amountsInGroup = allInstallmentRecords
          .filter(({ record }) => record.amount > 0)
          .map(({ record }) => record.amount);
      
        if (amountsInGroup.length > 0) {
        // 최빈값(가장 많이 나타나는 금액)을 월별 기본 금액으로 간주
        const amountCounts: {[key: number]: number} = {};
        amountsInGroup.forEach(amount => {
          amountCounts[amount] = (amountCounts[amount] || 0) + 1;
        });
        
        let maxCount = 0;
        let mostFrequentAmount = 0;
        for (const amountStr in amountCounts) {
          const amount = Number(amountStr);
          if (amountCounts[amount] > maxCount) {
            maxCount = amountCounts[amount];
            mostFrequentAmount = amount;
          }
        }
        monthlyAmount = mostFrequentAmount;
        
        // 최대 금액 (잔여 금액이 포함된 첫 달 금액)
        maxAmountInGroup = Math.max(...amountsInGroup);
        
        
        
        // totalMonths를 실제 그룹 내 기록 수로 업데이트
        totalMonthsInGroup = allInstallmentRecords.length;
        
        } else {
        // 모든 기록이 0원인 경우 (모두 환불된 경우)
        // editData의 amount를 월별 금액으로 가정 (이전 로직 유지)
        const baseAmount = editData.amount || 0;
        monthlyAmount = Number(baseAmount.toString().replace(/,/g, ''));
        maxAmountInGroup = monthlyAmount;
        totalMonthsInGroup = totalMonths; // 이 경우 totalMonths state 사용
        
      }

      // 첫 번째 기록에는 나머지 금액 포함 (할부 기록 생성 로직 참고)
        const baseAmount = monthlyAmount;
        const remainder = (totalMonthsInGroup > 0 && monthlyAmount > 0 && amountsInGroup.length > 0) ? (maxAmountInGroup - monthlyAmount) : 0; // 실제 잔여 금액 계산

      

      // 전체 할부 기록을 timestamp로 정렬하여 첫 번째 기록 찾기
        const sortedAllRecords = [...allInstallmentRecords].sort((a, b) => (a.record.timestamp || 0) - (b.record.timestamp || 0));
        const firstRecordInGroup = sortedAllRecords[0];
        const firstTimestamp = firstRecordInGroup?.record.timestamp || 0;
      
      
      
      // 환불된 기록들 복구 (timestamp 순서대로)
        const sortedRefundedRecords = targetRefundedRecords.sort((a, b) => (a.record.timestamp || 0) - (b.record.timestamp || 0));
      
        sortedRefundedRecords.forEach(({ dateKey, record }, index) => {
        
        
          const recordIndex = calendarData[dateKey].records.findIndex(
            (r: any) => r.timestamp === record.timestamp
          );
        
          if (recordIndex !== -1) {
          // 전체 할부 기록 그룹에서 첫 번째 기록(가장 오래된 timestamp)인지 확인
          // 첫 번째 기록이면 나머지 금액 포함, 아니면 baseAmount만
            const isFirstRecordInGroup = (record.timestamp || 0) === firstTimestamp;
            const backupAmount = calendarData[dateKey].records[recordIndex].originalAmountBeforeRefund;
            const restoredAmount = (typeof backupAmount === 'number' && backupAmount >= 0)
              ? backupAmount
              : (isFirstRecordInGroup ? baseAmount + remainder : baseAmount);
          
          // 기록 복구 (isRefunded 플래그 제거, 금액 복구)
            calendarData[dateKey].records[recordIndex].isRefunded = false;
            delete calendarData[dateKey].records[recordIndex].refundedAt;
            calendarData[dateKey].records[recordIndex].amount = restoredAmount;
          
          
          
          // 총액 복구
            if (record.type === 'expense') {
              calendarData[dateKey].totalExpense = (calendarData[dateKey].totalExpense || 0) + restoredAmount;
            } else if (record.type === 'income') {
              calendarData[dateKey].totalIncome = (calendarData[dateKey].totalIncome || 0) + restoredAmount;
            }
          }
        });

      // AsyncStorage에 저장
        await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      // 환불 복구 업데이트
        try {
          for (const { dateKey, record } of sortedRefundedRecords) {
            const recordIndex = calendarData[dateKey].records.findIndex(
              (r: any) => r.timestamp === record.timestamp
            );
            if (recordIndex !== -1) {
              const restoredRecord = calendarData[dateKey].records[recordIndex];
              const isFirstRecordInGroup = (record.timestamp || 0) === firstTimestamp;
              const backupAmount = restoredRecord.originalAmountBeforeRefund;
              const restoredAmount = (typeof backupAmount === 'number' && backupAmount >= 0)
                ? backupAmount
                : (isFirstRecordInGroup ? baseAmount + remainder : baseAmount);
              
              const recordId = record.id || record.timestamp.toString(); // UUID 우선, fallback으로 timestamp
              await updateExpense(recordId, {
                isRefunded: false,
                amount: restoredAmount,
                wasRestored: true,
              });
            }
          }
        } catch (_error) {
          // 에러가 발생해도 AsyncStorage 저장은 완료되었으므로 계속 진행
        }

        rescheduleDailyReminderIfNeeded().catch(() => {});

        try {
          logExpenseAdjustment({
            adjustment: 'isrefunded',
            state: 'restored',
            refund_scope: mapRefundOptionToAnalytics(refundRestoreOption),
            expense_variant: expenseCreationVariantFromInstallmentFlags(
              editData.isInstallment,
              editData.isRecurring,
            ),
          });
        } catch {
          // analytics only
        }

      // 모달 닫기
        setShowRefundRestore(false);
      
      // 화면 새로고침을 위해 editData 업데이트
      // 실제로는 router.replace나 refresh를 통해 화면을 새로고침해야 함
      // 하지만 현재 화면이 수정 모드이므로, 화면을 다시 로드하거나 
      // editData를 다시 가져와야 함
      
        const recordDate = editData.date || date;
        const dateKey = formatDateKey(recordDate);
        showToast('정상적으로 복구 처리가 완료 되었습니다.');
        await goTimelineWithFocus(dateKey);
      } else if (editData.isRecurring) {
        const recurringId = editData.recurringId;
        if (!recurringId) {
          return;
        }

        const allRecurringRecords: {dateKey: string, record: any}[] = [];
        Object.keys(calendarData).forEach((dateKey) => {
          if (calendarData[dateKey]?.records) {
            const relatedRecords = calendarData[dateKey].records.filter(
              (r: any) => r.recurringId === recurringId
            );
            relatedRecords.forEach((record: any) => {
              allRecurringRecords.push({ dateKey, record });
            });
          }
        });

        const parsedEditDate = parseRecordDate(editData.date, new Date());
        const editDay = parsedEditDate.getDate();
        const { startYear, startMonth, editYear, editMonth } = calcPeriod(editData, totalMonths);

        const refundedRecords = allRecurringRecords.filter(({ record }) => record.isRefunded);
        const targetRefundedRecords = refundedRecords.filter(({ record }) =>
          shouldMatchScope(record, refundRestoreOption, new Date(), startYear, startMonth, editYear, editMonth, editDay)
        );

        if (targetRefundedRecords.length === 0) {
          return;
        }

        for (const { dateKey, record } of targetRefundedRecords) {
          const recordIndex = calendarData[dateKey].records.findIndex(
            (r: any) => r.id === record.id || r.timestamp === record.timestamp
          );
          if (recordIndex === -1) {
            continue;
          }

          const targetRecord = calendarData[dateKey].records[recordIndex];
          let backupAmount = targetRecord.originalAmountBeforeRefund;
          let storedRecordAmount: number | undefined;
          if (!(typeof backupAmount === 'number' && backupAmount >= 0)) {
            const recordId = targetRecord.id || targetRecord.timestamp.toString();
            const storedRecord = await getExpenseById(recordId);
            if (storedRecord) {
              storedRecordAmount =
                storedRecord.originalAmountBeforeRefund ??
                storedRecord.originalAmount ??
                storedRecord.amount;
              if (typeof storedRecord.originalAmountBeforeRefund === 'number') {
                backupAmount = storedRecord.originalAmountBeforeRefund;
              }
            }
          }

          const restoredAmount = (typeof backupAmount === 'number' && backupAmount >= 0)
            ? backupAmount
            : (storedRecordAmount ?? targetRecord.originalAmount ?? targetRecord.amount ?? 0);

          targetRecord.isRefunded = false;
          delete targetRecord.refundedAt;
          targetRecord.amount = restoredAmount;
          calendarData[dateKey].totalExpense = (calendarData[dateKey].totalExpense || 0) + restoredAmount;
        }

        await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

        try {
          for (const { dateKey, record } of targetRefundedRecords) {
            const recordIndex = calendarData[dateKey].records.findIndex(
              (r: any) => r.id === record.id || r.timestamp === record.timestamp
            );
            if (recordIndex === -1) {
              continue;
            }
            const restoredRecord = calendarData[dateKey].records[recordIndex];
            const recordId = restoredRecord.id || restoredRecord.timestamp.toString();
            await updateExpense(recordId, {
              isRefunded: false,
              amount: restoredRecord.amount,
              wasRestored: true,
            });
          }
        } catch (_error) {
          // ignore
        }

        rescheduleDailyReminderIfNeeded().catch(() => {});

        try {
          logExpenseAdjustment({
            adjustment: 'isrefunded',
            state: 'restored',
            refund_scope: mapRefundOptionToAnalytics(refundRestoreOption),
            expense_variant: expenseCreationVariantFromInstallmentFlags(
              editData.isInstallment,
              editData.isRecurring,
            ),
          });
        } catch {
          // analytics only
        }

        setShowRefundRestore(false);

        const dateKey = formatDateKey(editData.date || date);
        showToast('정상적으로 복구 처리가 완료 되었습니다.');
        await goTimelineWithFocus(dateKey);
      } else {
        const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
        if (!originalDateKey || !calendarData[originalDateKey]?.records) {
          return;
        }
        const recordIndex = calendarData[originalDateKey].records.findIndex(
          (r: any) => r.id === editData.id || r.timestamp === editData.timestamp
        );
        if (recordIndex === -1) return;

        const record = calendarData[originalDateKey].records[recordIndex];
        let backupAmount = record.originalAmountBeforeRefund;
        if (!(typeof backupAmount === 'number' && backupAmount >= 0)) {
          const recordId = record.id || record.timestamp.toString();
          const storedRecord = await getExpenseById(recordId);
          if (storedRecord && typeof storedRecord.originalAmountBeforeRefund === 'number') {
            backupAmount = storedRecord.originalAmountBeforeRefund;
          }
        }
        const restoredAmount = (typeof backupAmount === 'number' && backupAmount >= 0)
          ? backupAmount
          : (record.originalAmount || editData.amount || 0);
        record.isRefunded = false;
        delete record.refundedAt;
        record.amount = restoredAmount;
        calendarData[originalDateKey].totalExpense = (calendarData[originalDateKey].totalExpense || 0) + restoredAmount;

        await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

        try {
          const recordIdGeneralRestore = record.id || record.timestamp.toString();
          await updateExpense(recordIdGeneralRestore, {
            isRefunded: false,
            amount: restoredAmount,
            wasRestored: true,
          });
        } catch (_error) {
          // ignore
        }

        rescheduleDailyReminderIfNeeded().catch(() => {});

        try {
          logExpenseAdjustment({
            adjustment: 'isrefunded',
            state: 'restored',
            refund_scope: mapRefundOptionToAnalytics(refundRestoreOption),
            expense_variant: expenseCreationVariantFromInstallmentFlags(
              editData.isInstallment,
              editData.isRecurring,
            ),
          });
        } catch {
          // analytics only
        }

        setShowRefundRestore(false);

        const dateKey = formatDateKey(editData.date || date);
        showToast('정상적으로 복구 처리가 완료 되었습니다.');
        await goTimelineWithFocus(dateKey);
      }
      
    } catch (_error) {
    } finally {
      setLoading(false);
    }
  };

  // 결산 처리 복구 로직
  const handleSettlementRestore = async () => {
    if (mode !== 'edit' || !editData || !editData.isSettled) {
      return;
    }

    setLoading(true);
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      const calendarData = storedData ? JSON.parse(storedData) : {};
      const originalDateKey = editData.date ? editData.date.replace(/\./g, '-') : '';
      if (!originalDateKey || !calendarData[originalDateKey]?.records) {
        return;
      }

      const recordIndex = calendarData[originalDateKey].records.findIndex(
        (r: any) => r.id === editData.id || r.timestamp === editData.timestamp,
      );
      if (recordIndex === -1) {
        return;
      }

      const record = calendarData[originalDateKey].records[recordIndex];
      const backupAmount = record.originalAmountBeforeSettlement
        ?? editData.originalAmountBeforeSettlement
        ?? 0;
      const restoredAmount = Number(backupAmount);

      record.isSettled = false;
      delete record.settledAt;
      delete record.originalAmountBeforeSettlement;
      record.amount = restoredAmount;
      calendarData[originalDateKey].totalExpense = (calendarData[originalDateKey].totalExpense || 0) + restoredAmount;

      await AsyncStorage.setItem('calendarData', JSON.stringify(calendarData));

      const syncedRestore = await syncExpenseRecord(record, {
        isSettled: false,
        settledAt: undefined,
        originalAmountBeforeSettlement: undefined,
        amount: restoredAmount,
        wasRestored: true,
      });
      if (!syncedRestore) {
        return;
      }

      await rebuildCalendarData();
      calendarRefreshEvent.emit();

      rescheduleDailyReminderIfNeeded().catch(() => {});

      try {
        if (syncedRestore) {
          logExpenseAdjustment({
            adjustment: 'issettled',
            state: 'restored',
            refund_scope: null,
            expense_variant: expenseCreationVariantFromRecord(syncedRestore),
          });
        }
      } catch {
        // analytics only
      }

      setShowSettlementRestore(false);
      showToast('정상적으로 복구 처리가 완료 되었습니다.');
      await goTimelineWithFocus(originalDateKey);
    } finally {
      setLoading(false);
    }
  };

  // 환불 처리날짜 포맷 함수
  const formatRefundDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const year = String(date.getFullYear()).slice(-2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    } catch {
      return '';
    }
  };

  // 결산 처리날짜 포맷 함수
  const formatSettlementDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      const year = String(date.getFullYear()).slice(-2);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    } catch {
      return '';
    }
  };

  const getRecordTypeLabel = () => {
    if (editData?.isInstallment) return '할부';
    if (editData?.isRecurring) return '정기';
    return '일반';
  };

  // 선결제 일자 포맷 함수 (YYYY.MM.DD 형식을 YY/MM/DD로 변환)
  const formatPrepaidDate = (dateString: string): string => {
    try {
      if (!dateString) return '';
      // YYYY.MM.DD 형식인 경우
      if (dateString.includes('.')) {
        const [year, month, day] = dateString.split('.');
        const yearShort = year.slice(-2);
        return `${yearShort}/${month}/${day}`;
      }
      // YYYY-MM-DD 형식인 경우
      if (dateString.includes('-')) {
        const [year, month, day] = dateString.split('-');
        const yearShort = year.slice(-2);
        return `${yearShort}/${month}/${day}`;
      }
      return dateString;
    } catch {
      return '';
    }
  };

  // 원래 할부 기록일 포맷 함수 (YYYY.MM.DD 형식을 YYYY년 MM월 DD일로 변환)
  const formatOriginalScheduledDate = (dateString: string): string => {
    try {
      if (!dateString) return '';
      // YYYY.MM.DD 형식인 경우
      if (dateString.includes('.')) {
        const [year, month, day] = dateString.split('.');
        return `${year}년 ${month}월 ${day}일`;
      }
      // YYYY-MM-DD 형식인 경우
      if (dateString.includes('-')) {
        const [year, month, day] = dateString.split('-');
        return `${year}년 ${month}월 ${day}일`;
      }
      return dateString;
    } catch {
      return '';
    }
  };

  const getSingleRefundPeriod = () => {
    const targetDate = editData?.date || date;
    if (!targetDate) return '';
    const normalized = targetDate.replace(/-/g, '.');
    const [year, month, day] = normalized.split('.').map(Number);
    if (!year || !month || !day) return '';
    const weekday = getWeekdayLabel(new Date(year, month - 1, day));
    return `기간 : ${String(year).padStart(4, '0')}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}(${weekday})`;
  };

  // 그룹 기록 환불 옵션별 기간 계산 (할부/정기)
  const getRefundPeriodByOption = (option: 'all' | 'today' | 'future') => {
    if (!editData?.isInstallment && !editData?.isRecurring) return '';
    
    const currentRecurringType = editData.recurringType || recurringType;
    
    switch (option) {
      case 'all': {
        const { startYear: allStartYear, startMonth: allStartMonth, totalMonths: allTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: allActualEndYear, actualEndMonth: allActualEndMonth } = calcEndDate(
          allStartYear,
          allStartMonth,
          allTotalMonths,
          editData.isRecurring ? currentRecurringType : undefined,
        );
        const endYear = editData.isRecurring && actualEndYearMonth ? actualEndYearMonth.year : allActualEndYear;
        const endMonth = editData.isRecurring && actualEndYearMonth ? actualEndYearMonth.month : allActualEndMonth;
        const allStartPeriod = `${String(allStartYear).slice(-2)}/${String(allStartMonth).padStart(2, '0')}`;
        const allEndPeriod = `${String(endYear).slice(-2)}/${String(endMonth).padStart(2, '0')}`;
        return `기간 : ${allStartPeriod} - ${allEndPeriod}`;
      }
      case 'today': {
        const editDate = parseRecordDate(editData.date, new Date());
        const editYear = editDate.getFullYear();
        const editMonth = editDate.getMonth() + 1;
        const editDay = editDate.getDate();
        const weekday = getWeekdayLabel(editDate);
        return `기간 : ${editYear}/${String(editMonth).padStart(2, '0')}/${String(editDay).padStart(2, '0')}(${weekday})`;
      }
      case 'future': {
        const { startYear: futureStartYear, startMonth: futureStartMonth, editYear: futureEditYear, editMonth: futureEditMonth, totalMonths: futureTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: futureActualEndYear, actualEndMonth: futureActualEndMonth } = calcEndDate(
          futureStartYear,
          futureStartMonth,
          futureTotalMonths,
          editData.isRecurring ? currentRecurringType : undefined,
        );
        const endYear = editData.isRecurring && actualEndYearMonth ? actualEndYearMonth.year : futureActualEndYear;
        const endMonth = editData.isRecurring && actualEndYearMonth ? actualEndYearMonth.month : futureActualEndMonth;
        
        const isFirstData = futureEditYear === futureStartYear && futureEditMonth === futureStartMonth;
        
        if (isFirstData) {
          const futureStartPeriod = `${String(futureStartYear).slice(-2)}/${String(futureStartMonth).padStart(2, '0')}`;
          const futureEndPeriod = `${String(endYear).slice(-2)}/${String(endMonth).padStart(2, '0')}`;
          return `기간 : ${futureStartPeriod} - ${futureEndPeriod}`;
        }
        const refundStartPeriod = `${String(futureEditYear).slice(-2)}/${String(futureEditMonth).padStart(2, '0')}`;
        const futureEndPeriod = `${String(endYear).slice(-2)}/${String(endMonth).padStart(2, '0')}`;
        return `기간 : ${refundStartPeriod} - ${futureEndPeriod}`;
      }
      default: {
        const { startYear: defaultStartYear, startMonth: defaultStartMonth, totalMonths: defaultTotalMonths } = calcPeriod(editData, totalMonths);
        const { actualEndYear: defaultActualEndYear, actualEndMonth: defaultActualEndMonth } = calcEndDate(
          defaultStartYear,
          defaultStartMonth,
          defaultTotalMonths,
          editData.isRecurring ? currentRecurringType : undefined,
        );
        const defaultStartPeriod = `${String(defaultStartYear).slice(-2)}/${String(defaultStartMonth).padStart(2, '0')}`;
        const defaultEndPeriod = `${String(defaultActualEndYear).slice(-2)}/${String(defaultActualEndMonth).padStart(2, '0')}`;
        return `기간 : ${defaultStartPeriod} - ${defaultEndPeriod}`;
      }
    }
  };

  const getRefundPeriod = () => {
    return getRefundPeriodByOption(refundOption);
  };

  const getRefundRestorePeriod = () => {
    return getRefundPeriodByOption(refundRestoreOption);
  };

  // 그룹 기록 환불 옵션별 금액 계산 (할부/정기)
  const getRefundAmountByOption = (option: 'all' | 'today' | 'future') => {
    if ((!editData?.isInstallment && !editData?.isRecurring) || !amount) return '0원';
    
    const baseAmount = Number(amount.replace(/,/g, ''));
    if (isNaN(baseAmount)) return '0원';
    
    switch (option) {
      case 'all':
        // 전체 기간의 금액 합산 - 실제 존재하는 기록만 계산
        if (actualTotalAmount > 0) {
          return `${actualTotalAmount.toLocaleString()}원`;
        }
        return '계산 중...';
      case 'today':
        // 오늘 날짜의 금액만
        return `${baseAmount.toLocaleString()}원`;
      case 'future':
        // 오늘 이후의 금액 합산
        if (actualFutureAmount > 0) {
          return `${actualFutureAmount.toLocaleString()}원`;
        }
        return '계산 중...';
      default:
        return '0원';
    }
  };

  const getRefundAmount = () => {
    return getRefundAmountByOption(refundOption);
  };

  const getRefundRestoreAmount = () => {
    if ((!editData?.isInstallment && !editData?.isRecurring) || !amount) return '0원';

    switch (refundRestoreOption) {
      case 'all':
        return actualRefundRestoreTotalAmount > 0
          ? `${actualRefundRestoreTotalAmount.toLocaleString()}원`
          : '계산 중...';
      case 'today':
        return actualRefundRestoreTodayAmount > 0
          ? `${actualRefundRestoreTodayAmount.toLocaleString()}원`
          : '계산 중...';
      case 'future':
        return actualRefundRestoreFutureAmount > 0
          ? `${actualRefundRestoreFutureAmount.toLocaleString()}원`
          : '계산 중...';
      default:
        return '0원';
    }
  };

  const [categoryEmojiMap, setCategoryEmojiMap] = useState<Record<string, string>>({});

  useEffect(() => {
    // 통합 카테고리 로드하여 이모지 매핑
    loadCategories('expense')
      .then((cats) => {
        const map: Record<string, string> = {};
        cats.forEach((cat) => {
          map[cat.label] = cat.emoji;
        });
        setCategoryEmojiMap(map);
      })
      .catch(() => {
        // 로드 실패 시 빈 맵 유지
      });
  }, []);

  const getCategoryEmojiSafe = (label: string): string => {
    return categoryEmojiMap[label] ?? '';
  };

  const categoryDisplay = category ? `${getCategoryEmojiSafe(category)} ${category}` : '';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.staticWhite }]} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <TopNavigation
        type="sub"
        title={mode === 'edit' ? '소비내역 수정' : '소비 기록'}
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.content, { backgroundColor: colors.fill }]}>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent, 
            { 
              paddingBottom: keyboardHeight > 0 
                ? keyboardHeight + 16 - insets.bottom 
                : isKeypadVisible
                ? KEYPAD_HEIGHT + 16 - insets.bottom
                : 16 // 메모와 하단 영역 사이 여백
            }
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => {
            isScrollingRef.current = true;
            clearDismissTimeout();
            ignoreNextTouchEndRef.current = true;
          }}
          onScrollEndDrag={() => {
            isScrollingRef.current = false;
            setTimeout(() => {
              ignoreNextTouchEndRef.current = false;
            }, 0);
          }}
          onMomentumScrollEnd={() => {
            isScrollingRef.current = false;
            setTimeout(() => {
              ignoreNextTouchEndRef.current = false;
            }, 0);
          }}
          onTouchEnd={() => {
            if (!isKeypadVisible) return;
            clearDismissTimeout();
            if (ignoreNextTouchEndRef.current) {
              ignoreNextTouchEndRef.current = false;
              return;
            }
            dismissTimeoutRef.current = setTimeout(() => {
              if (isScrollingRef.current) return;
              if (skipNextDismissRef.current) {
                skipNextDismissRef.current = false;
                return;
              }
              if (isMemoFocusedRef.current) {
                handleKeypadDismiss();
                return;
              }
              handleKeypadDismiss();
            }, 0);
          }}
        >
            {/* 소비 정보 - 수정 모드에서만 표시 */}
            {mode === 'edit' && (
              <View style={[styles.section, { paddingTop: 24 }]}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                    {editData?.isPrepaid ? '소비 내역' : '소비 정보'}
                  </Text>
                  <Pressable onPress={() => {
                    // 통합 삭제 모달만 사용 (유형과 무관하게 동일 플로우)
                    setShowDeleteConfirm(true);
                  }}>
                    <Text style={[styles.deleteText, { color: colors.statusNegative }]}>
                      삭제
                    </Text>
                  </Pressable>
                </View>
                
                <View style={[styles.expenseInfoCard, { backgroundColor: colors.staticWhite }]}>
                  <View style={styles.expenseInfoContent}>
                    <View style={styles.expenseInfoLeft}>
                      <View style={styles.expenseInfoTop}>
                        <Text style={[styles.expenseCategory, { color: colors.text }]}>
                          {categoryDisplay || '카테고리'}
                        </Text>
                      </View>
                      <View style={styles.expenseInfoBottom}>
                    <Text style={[styles.expenseDate, { color: colors.textAssistive }]}>
                      {editData?.isPrepaid && editData?.originalDate 
                        ? editData.originalDate 
                        : (displayDate || '날짜')}
                    </Text>
                      </View>
                    </View>

                    <View style={styles.expenseInfoRight}>
                      <View style={styles.expenseInfoTop}>
                        <Text 
                          style={[styles.expenseAmount, { color: colors.text }]}
                          adjustsFontSizeToFit={true}
                          numberOfLines={1}
                          minimumFontScale={0.5}
                        >
                          {amount && !isNaN(Number(amount.replace(/,/g, ''))) ? `${Number(amount.replace(/,/g, '')).toLocaleString()}원` : '0원'}
                        </Text>
                      </View>
                      <View style={styles.expenseInfoBottom}>
                        <Text style={[styles.expenseMemo, { color: colors.textAssistive }]}>
                          {memo || '메모 없음'}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {/* 선결제/환불 처리 UI */}
                  {editData && (
                    <>
                      <View style={[styles.expenseInfoDivider, { backgroundColor: colors.border }]} />
                      <View style={styles.prepaymentRefundRow}>
                        {editData?.isPrepaid ? (
                          // 선결제 처리된 경우: 선결제 일자와 복구 버튼 표시
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              선결제 일자 : {editData?.prepaidDate 
                                ? formatPrepaidDate(editData.prepaidDate)
                                : formatPrepaidDate(editData.date || '')
                              }
                            </Text>
                            <Pressable 
                              style={styles.prepaymentRefundButton}
                              onPress={() => {
                                void logEvent('btn', {
                                  screen_name: analyticsScreenName,
                                  target: 'prepayment-restoration',
                                });
                                // 선결제 처리 복구 모달 열기
                                setShowPrepaymentRestore(true);
                              }}
                            >
                              <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                선결제 처리 복구
                              </Text>
                            </Pressable>
                          </>
                        ) : editData?.isRefunded ? (
                          // 환불 처리된 경우: 환불 처리날짜와 복구 버튼 표시
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              환불 처리날짜 : {editData?.refundedAt 
                                ? formatRefundDate(editData.refundedAt)
                                : formatRefundDate(new Date().toISOString())
                              }
                            </Text>
                            <Pressable 
                              style={styles.prepaymentRefundButton}
                              onPress={() => {
                                void logEvent('btn', {
                                  screen_name: analyticsScreenName,
                                  target: 'refund-restoration',
                                });
                                // 환불 처리 복구 모달 열기
                                setRefundRestoreOption('all');
                                setShowRefundRestore(true);
                              }}
                            >
                              <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                환불 처리 복구
                              </Text>
                            </Pressable>
                          </>
                        ) : editData?.isSettled ? (
                          // 결산 처리된 경우: 결산 처리날짜와 복구 버튼 표시
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              결산 처리날짜 : {editData?.settledAt
                                ? formatSettlementDate(editData.settledAt)
                                : formatSettlementDate(new Date().toISOString())
                              }
                            </Text>
                            <Pressable
                              style={styles.prepaymentRefundButton}
                              onPress={() => {
                                void logEvent('btn', {
                                  screen_name: analyticsScreenName,
                                  target: 'settlement-restoration',
                                });
                                setShowSettlementRestore(true);
                              }}
                            >
                              <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                결산 처리 복구
                              </Text>
                            </Pressable>
                          </>
                        ) : (
                          // 일반 할부 기록인 경우: 정산 처리 버튼 표시 (선결제/환불/결산 드롭다운)
                          <>
                            <Text style={[styles.prepaymentRefundLabel, { color: colors.textAssistive }]}>
                              선결제·환불·결산 미적용
                            </Text>
                            <View ref={settlementButtonRef} collapsable={false}>
                              <Pressable
                                style={[styles.prepaymentRefundButton, { marginLeft: 0 }]}
                                onPress={() => {
                                  void logEvent('btn', {
                                    screen_name: analyticsScreenName,
                                    target: 'calculate',
                                  });
                                  settlementButtonRef.current?.measureInWindow((x, y, width, height) => {
                                    const { width: screenWidth } = Dimensions.get('window');
                                    const menuWidth = 250;
                                    let left = x + width - menuWidth;
                                    if (left < 16) left = 16;
                                    if (left + menuWidth > screenWidth - 16) left = screenWidth - menuWidth - 16;
                                    setSettlementMenuLayout({ x: left, y: y + height, width: menuWidth, height });
                                    setShowSettlementMenu(true);
                                  });
                                }}
                              >
                                <Text style={[styles.prepaymentRefundText, { color: colors.textAssistive }]}>
                                  정산 처리
                                </Text>
                              </Pressable>
                            </View>
                          </>
                        )}
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}

            {/* 카테고리 */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                카테고리 <Text style={{ color: '#EF5252' }}>*</Text>
              </Text>
              <Input
                value={categoryDisplay}
                placeholder="카테고리 선택"
                showRightArrow={true}
                buttonMode={true}
                disabled={mode === 'edit' && (editData?.isRecurring || editData?.isInstallment)}
                onPress={handleCategoryPress}
                style={styles.categoryInput}
              />
            </View>

            {/* 결제 유형 - 수정 모드일 때만 기존 위치에 표시 */}
            {mode === 'edit' && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                  결제 유형 <Text style={{ color: '#EF5252' }}>*</Text>
                </Text>
                <Input
                  value={stickyPaymentTypeDisplay.label}
                  buttonMode={true}
                  sortation={true}
                  showSortationDot={stickyPaymentTypeDisplay.showDot}
                  sortationColor={stickyPaymentTypeDisplay.color}
                  sortationEmoji={stickyPaymentTypeDisplay.emoji}
                  showRightArrow={true}
                  rightIcon="arrowDown"
                  onPress={handleOpenPaymentTypeSheet}
                />
              </View>
            )}

            {/* 날짜 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                  날짜 <Text style={{ color: '#EF5252' }}>*</Text>
                </Text>
                <Pressable
                  style={styles.recurringInstallmentButton}
                  onPress={() => {
                    void logEvent('btn', {
                      screen_name: analyticsScreenName,
                      target: 'option',
                    });

                    // 수정 화면에서는 반복/할부 설정 변경 불가
                    if (mode === 'edit') {
                      showToast('변경할 수 없습니다. 새로 생성해 주세요.');
                      return;
                    }
                    Keyboard.dismiss();
                    // 열 때마다 마지막 확인된 상태(main) → draft 동기화 (확인 없이 닫은 경우 이전 draft가 남지 않도록)
                    setDraftIsRecurring(isRecurring);
                    setDraftIsInstallment(isInstallment);
                    setDraftHasSelectedInstallment(hasSelectedInstallment);
                    setDraftRecurringType(recurringType);
                    setDraftTotalMonths(totalMonths);
                    setDraftWeekendOption(weekendOption);
                    setDraftSelectedDay(selectedDay);
                    setDraftIsPeriodExpanded(isPeriodExpanded);
                    void logEvent('sheet_view', {
                      screen_name: analyticsScreenName,
                      target: 'recurring-installment-sheet',
                    });
                    setShowRecurringInstallmentSheet(true);
                  }}
                >
                  <Text style={[
                    styles.recurringInstallmentButtonText, 
                    { 
                      color: colors.textAssistive 
                    }
                  ]}>
                    {(() => {
                      const weekendText = getRecurringWeekendOptionDisplayLabel(
                        isRecurring ? recurringType : undefined,
                        weekendOption,
                        { isRecurring },
                      );
                      if (isRecurring) {
                        // 정기 지출: "정기지출 ・ [반복기간] ・ [주말옵션]"
                        return `정기지출 ・ ${recurringType} ・ ${weekendText}`;
                      }
                      if (isInstallment) {
                        // 할부: "할부 ・ [개월수] ・ [주말옵션]"
                        return `할부 ・ ${totalMonths}개월 ・ ${weekendText}`;
                      }
                      return '반복/할부 설정';
                    })()}
                  </Text>
                </Pressable>
              </View>
              <Input
                variant="line"
                icon="calendarMonth"
                value={(() => {
                  if (!date) return '';
                  const [year, month, day] = date.split('.').map(d => parseInt(d, 10));
                  if (isNaN(year) || isNaN(month) || isNaN(day)) return date;
                  
                  // 실제 날짜의 요일 계산 (수정하려는 날짜 기준)
                  const dateObj = new Date(year, month - 1, day);
                  const actualDayOfWeek = dateObj.getDay();
                  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                  const actualDayOfWeekLabel = weekdays[actualDayOfWeek];
                  
                  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}(${actualDayOfWeekLabel})`;
                })()}
                editable={false}
                disabled={mode === 'edit' && !!editData?.isPrepaid}
                placeholder="날짜 선택"
                onPress={handleDatePress}
              />
            </View>

            {/* 금액 */}
            <View
              style={styles.section}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                setAmountSectionY(layout.y);
                setAmountSectionHeight(layout.height);
              }}
            >
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
                  금액 <Text style={{ color: '#EF5252' }}>*</Text>
                </Text>
              </View>
              
              {/* 금액 입력 필드 */}
              <Input
                variant="line"
                inputType="number"
                unit="원"
                value={amount || '0'}
                valueRenderer={amountExpressionView}
                onChangeText={handleAmountChange}
                placeholder="0"
                textAlign="right"
                disabled={
                  mode === 'edit' &&
                  (
                    editData?.isInstallment ||
                    (!!editData?.isRefunded && !editData?.isInstallment) ||
                    !!editData?.isSettled
                  )
                }
                editable={false}
                caretHidden
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'amount',
                  });

                  // 환불/할부 기록 수정 모드에서는 금액 변경 불가
                  const isDisabled =
                    mode === 'edit' &&
                    (
                      editData?.isInstallment ||
                      (!!editData?.isRefunded && !editData?.isInstallment) ||
                      !!editData?.isSettled
                    );

                  if (isDisabled) {
                    setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                    setShowRecurringToast(true);
                    return;
                  }
                  skipNextDismissRef.current = false;
                  if (isMemoFocused) {
                    setIsMemoFocused(false);
                  }
                  handleAmountFocus();
                  setIsKeypadVisible(true);
                  Keyboard.dismiss();
                }}
              />
            </View>

          {/* 메모 */}
          <View 
            style={styles.section}
            onLayout={(event) => {
              const layout = event.nativeEvent.layout;
              setMemoSectionY(layout.y);
            }}
          >
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              메모
            </Text>
            <Input
              variant="area"
              value={memo}
              onChangeText={handleMemoChange}
              placeholder="메모를 입력해 주세요.(최대 20자)"
              maxLength={20}
              multiline
              onFocus={handleMemoFocus}
              onBlur={() => {
                setIsMemoFocused(false);
                isMemoFocusedRef.current = false;
              }}
              onKeyPress={handleMemoKeyPress}
              onSubmitEditing={handleMemoSubmitEditing}
              blurOnSubmit={false}
            />
          </View>
          </ScrollView>
        </View>

        {/* 하단 sticky 영역 - 생성 모드: 결제 유형, 수정 모드: 기간 행 */}
        {mode === 'create' && (
          <View style={[
            styles.paymentTypeStickyContainer,
            {
              backgroundColor: AtomicColors.neutral[100], // #f5f5f5
            }
          ]}>
            {/* 상단 라인 */}
            <View style={[styles.paymentTypeTopLine, { backgroundColor: colors.border }]} />
            <View style={styles.paymentTypeStickyContent}>
              <Text style={[styles.paymentTypeStickyLabel, { color: colors.textNeutral }]}>
                결제 유형
              </Text>
              <View style={styles.paymentTypeStickyControls}>
                <Input
                  value={stickyPaymentTypeDisplay.label}
                  buttonMode={true}
                  shortver={true}
                  sortation={true}
                  showSortationDot={stickyPaymentTypeDisplay.showDot}
                  sortationColor={stickyPaymentTypeDisplay.color}
                  sortationEmoji={stickyPaymentTypeDisplay.emoji}
                  showRightArrow={true}
                  rightIcon="arrowDown"
                  onPress={handleOpenPaymentTypeSheet}
                />
              </View>
            </View>
          </View>
        )}

        {/* 하단 스티키 버튼 */}
        <View style={[
          styles.bottomButtonContainer, 
          { 
            backgroundColor: colors.staticWhite,
            paddingBottom: 16 + insets.bottom,
            paddingTop: 16,
          }
        ]}>
          <Button onPress={handleBottomCtaConfirmPress}>
            {mode === 'edit' ? '저장' : '확인'}
          </Button>
        </View>

        {isKeypadMounted && (
          <View style={styles.customKeypadOverlay} pointerEvents="box-none">
            <Animated.View
              style={[
                styles.customKeypadContainer,
                { transform: [{ translateY: keypadTranslateY }] },
              ]}
              pointerEvents="box-none"
            >
              <BlurView
                intensity={16}
                tint="light"
                style={styles.customKeypadBlur}
              >
                <View
                  pointerEvents="none"
                  style={[
                    styles.customKeypadTint,
                    { backgroundColor: keypadTintColor },
                  ]}
                />
                <View style={styles.customKeypadContent} pointerEvents="auto">
                  <CustomKeypad
                    value={amount}
                    onValueChange={handleAmountChange}
                    onConfirm={(nextValue) => {
                      handleAmountChange(nextValue);
                      setIsKeypadVisible(false);
                      setAmountExpression([]);
                    }}
                    onExpressionChange={setAmountExpression}
                  />
                </View>
              </BlurView>
            </Animated.View>
          </View>
        )}

      

      {/* 정산 처리 드롭다운 메뉴 (선결제/환불/결산) - iOS 스타일 */}
      <Modal
        visible={showSettlementMenu}
        transparent
        animationType="none"
        onRequestClose={() => closeSettlementMenu()}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => closeSettlementMenu()}
          />
          {settlementMenuLayout && (
            <View
              style={[
                styles.settlementDropdownMenuContainer,
                {
                  left: settlementMenuLayout.x,
                  top: settlementMenuLayout.y + 4,
                  width: settlementMenuLayout.width,
                },
              ]}
              pointerEvents="box-none"
            >
              <Animated.View
                style={[
                  styles.settlementDropdownMenuPanel,
                  {
                    opacity: settlementMenuOpacity,
                    transform: [{ scale: settlementMenuScale }],
                  },
                ]}
              >
                <View style={styles.settlementDropdownMenuClip}>
                  {Platform.OS === 'ios' ? (
                    <BlurView intensity={100} tint="light" style={styles.settlementDropdownMenuBlur}>
                      {/* Liquid Glass: 반투명 하이라이트 + 가장자리 쉰 */}
                      <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        <View style={[StyleSheet.absoluteFill, styles.settlementDropdownMenuGlassOverlay]} />
                        <View style={styles.settlementDropdownMenuGlassSheen} />
                      </View>
                      {(['선결제', '환불', '결산'] as const).map((label, index) => (
                        <Pressable
                          key={label}
                          style={[
                            styles.settlementDropdownMenuItem,
                            index < 2 && styles.settlementDropdownMenuItemBorder,
                          ]}
                          onPress={() => handleSettlementMenuSelect(label)}
                        >
                          <Text style={[styles.settlementDropdownMenuLabel, { color: colors.text }]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </BlurView>
                  ) : (
                    <View style={[styles.settlementDropdownMenuBlur, { backgroundColor: 'rgba(253, 253, 253, 0.98)' }]}>
                      {(['선결제', '환불', '결산'] as const).map((label, index) => (
                        <Pressable
                          key={label}
                          style={[
                            styles.settlementDropdownMenuItem,
                            index < 2 && styles.settlementDropdownMenuItemBorder,
                          ]}
                          onPress={() => handleSettlementMenuSelect(label)}
                        >
                          <Text style={[styles.settlementDropdownMenuLabel, { color: colors.text }]}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </Animated.View>
            </View>
          )}
        </View>
      </Modal>

      {/* 카테고리 미선택 얼럿 */}
      <PrepaymentModal
        visible={showPrepaymentModal}
        categoryLabel={categoryDisplay ?? ''}
        amountText={(amount ? `${amount}원` : (editData?.amount ? `${Number(editData.amount).toLocaleString()}원` : ''))}
        periodText={`기간 : ${prepaymentDate}`}
        selectedDateLabel={prepaymentDate}
        onOpenDatePicker={() => {
          setTempSelectedDate(prepaymentDate.replace(/\./g, '-'));
          setShowDatePicker(true);
        }}
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'prepayment-confirm',
          });
          await handlePrepaymentConfirm();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'prepayment-cancel',
          });
          setShowPrepaymentModal(false);
        }}
        backdropInteractive={true}
        extraOverlay={showDatePicker ? (
          <>
        <ModalBottomsheet
          visible={true}
          title="소비 기록일 선택"
          onClose={handleDatePickerClose}
          closeOnBackdrop={true}
          contentStyle={styles.dateBottomsheetContent}
              embedded
        >
        <CalendarDaySelect
          selectedDate={tempSelectedDate}
                autoCenterOnSelectedDate={false}
                disablePastDates={false}
          onDayPress={(dateString) => {
            setTempSelectedDate(dateString);
          }}
          monthStartDay={monthStartDay}
        />
          <View style={styles.dateButtonArea}>
            <Pressable
              style={[styles.dateButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                void logEvent('btn', {
                  screen_name: analyticsScreenName,
                  target: 'calendar-confirm',
                });
                // 선결제 날짜 선택 시 date state 업데이트
                // 바텀시트를 먼저 닫고 나서 date를 업데이트하여 재오픈 방지
                setShowDatePicker(false);
                if (tempSelectedDate) {
                  const formattedDate = tempSelectedDate.replace(/-/g, '.');
                  setTimeout(() => {
                    setPrepaymentDate(formattedDate);
                  }, 50);
                }
              }}
            >
              <Text style={[styles.dateButtonText, { color: colors.staticWhite }]}>
                확인
              </Text>
            </Pressable>
          </View>
        </ModalBottomsheet>
          </>
        ) : null}
      />

      {/* 일반 생성 흐름에서의 날짜 선택 바텀시트 (선결제 모달이 열려있지 않을 때만 표시) */}
      {!showPrepaymentModal && showDatePicker ? (
        <ModalBottomsheet
          visible={true}
          title="소비 기록일 선택"
          onClose={handleDatePickerClose}
          closeOnBackdrop={true}
          contentStyle={styles.dateBottomsheetContent}
          embedded
        >
          <BasicCalendarDaySelect
            selectedDate={tempSelectedDate ?? undefined}
            onDayPress={(dateString) => {
              setTempSelectedDate(dateString);
            }}
            monthStartDay={monthStartDay}
          />
          <View style={styles.dateButtonArea}>
            <Pressable
              style={[styles.dateButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                void logEvent('btn', {
                  screen_name: analyticsScreenName,
                  target: 'calendar-confirm',
                });
                // 바텀시트를 먼저 닫고 나서 date를 업데이트하여 재오픈 방지
                setShowDatePicker(false);
                if (tempSelectedDate) {
                  const formattedDate = tempSelectedDate.replace(/-/g, '.');
                  setTimeout(() => {
                    setDate(formattedDate);
                    setDisplayDate(formattedDate);
                  }, 50);
                }
              }}
            >
              <Text style={[styles.dateButtonText, { color: colors.staticWhite }]}>확인</Text>
            </Pressable>
          </View>
        </ModalBottomsheet>
      ) : null}

      {/* 날짜 선택 바텀시트: PrepaymentModal 내부 extraOverlay로 이동 */}

      {/* 결제 유형 선택 바텀시트 */}
      {showPaymentTypeSheet ? (
        <ModalBottomsheet
          visible={true}
          title="결제 유형 선택"
          onClose={handlePaymentTypeSheetClose}
          closeOnBackdrop={true}
          style={{ height: paymentTypeSheetHeight }}
          contentStyle={styles.paymentTypeSheetContent}
          noPaddingBottom={true}
          embedded
        >
          <View
            style={[
              styles.paymentTypeSheetBody,
              {
                backgroundColor: colors.fill,
                height: paymentTypeSheetContentHeight,
              },
            ]}
          >
            <View style={styles.paymentTypeSheetFilterRow}>
              <View style={styles.paymentTypeSheetFilterChips}>
                <Chip
                  label="신용카드"
                  active={paymentTypeSheetFilter === 'credit'}
                  onPress={() => setPaymentTypeSheetFilter('credit')}
                />
                <Chip
                  label="체크카드"
                  active={paymentTypeSheetFilter === 'debit'}
                  onPress={() => setPaymentTypeSheetFilter('debit')}
                />
              </View>
              <Pressable
                style={styles.paymentTypeSheetCashButton}
                onPress={() => handlePaymentTypeSelect('cash')}
              >
                <Text style={styles.paymentTypeSheetCashEmoji}>💰</Text>
                <Text style={[styles.paymentTypeSheetCashText, { color: colors.textNeutral }]}>현금 선택</Text>
              </Pressable>
            </View>

            <View
              style={[
                styles.paymentTypeSheetList,
                { backgroundColor: colors.staticWhite },
              ]}
            >
              <ScrollView
                style={styles.paymentTypeSheetListScroll}
                contentContainerStyle={styles.paymentTypeSheetListScrollContent}
                showsVerticalScrollIndicator={true}
                bounces={false}
                overScrollMode="never"
              >
                {paymentTypeSheetItems
                  .filter((item) => item.type === paymentTypeSheetFilter)
                  .map((item, index, arr) => (
                    <View key={item.id}>
                      <Pressable
                        style={styles.paymentTypeSheetItem}
                        onPress={() => handlePaymentTypeSelect(item.type, item.id)}
                      >
                        <View style={styles.paymentTypeSheetLeft}>
                          <View style={[styles.paymentTypeSheetIndicator, { backgroundColor: item.color, borderColor: colors.border }]} />
                          <View
                            style={[
                              styles.paymentTypeSheetTextBlock,
                              !item.description.trim() && styles.paymentTypeSheetTextBlockSingleLine,
                            ]}
                          >
                            <Text style={[styles.paymentTypeSheetTitle, { color: colors.text }]} numberOfLines={1}>
                              {item.label}
                            </Text>
                            {item.description.trim() ? (
                              <Text style={[styles.paymentTypeSheetSubtitle, { color: colors.textAssistive }]} numberOfLines={1}>
                                {item.description}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {index === 0 ? (
                          <View style={styles.paymentTypeSheetDefaultTagWrap}>
                            <Tag label="기본" status="normal" />
                          </View>
                        ) : null}
                      </Pressable>
                      {index < arr.length - 1 ? (
                        <View style={[styles.paymentTypeSheetDivider, { backgroundColor: colors.border }]} />
                      ) : null}
                    </View>
                  ))}
              </ScrollView>
            </View>

            <View style={styles.paymentTypeSheetListHomeGap} />
            <View style={[styles.paymentTypeSheetHomeIndicatorArea, { backgroundColor: colors.staticWhite }]} />
          </View>
        </ModalBottomsheet>
      ) : null}

      {/* 반복/할부 설정 바텀시트 (확인 시에만 옵션 반영) */}
      <ModalBottomsheet
        visible={showRecurringInstallmentSheet}
        title="반복/할부 설정"
        onClose={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'recurring-installment-sheet-close',
          });
          setShowRecurringInstallmentSheet(false);
        }}
        onConfirm={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'recurring-installment-sheet-confirm',
          });
          setIsRecurring(draftIsRecurring);
          setIsInstallment(draftIsInstallment);
          setHasSelectedInstallment(draftHasSelectedInstallment);
          setRecurringType(draftRecurringType);
          setTotalMonths(draftTotalMonths);
          setWeekendOption(draftWeekendOption);
          setSelectedDay(draftSelectedDay);
          setIsPeriodExpanded(draftIsPeriodExpanded);
          setShowRecurringInstallmentSheet(false);
        }}
        confirmText="확인"
        closeOnBackdrop={true}
        style={{ maxHeight: Dimensions.get('window').height * 0.8 }}
        contentStyle={{ padding: 0 }}
        noPaddingBottom={true}
      >
        <ScrollView 
          style={[
            styles.recurringInstallmentSheetInner, 
            { 
              backgroundColor: colors.fill,
              height: Dimensions.get('window').height * 0.8 - 56 - insets.bottom, // 바텀시트 높이 80% - 네비게이션 56 - 홈 인디케이터
            }
          ]}
          contentContainerStyle={styles.recurringInstallmentSheetScrollContent}
          showsVerticalScrollIndicator={true}
          bounces={false}
          overScrollMode="never"
        >
          {/* 소비 형태 (드래프트: 확인 시에만 반영) */}
          <View style={styles.sheetSection}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              소비 형태
            </Text>
            <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
              {/* 정기 지출 여부 */}
              <View style={styles.recurringSection}>
                <View style={styles.recurringTitleRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    정기 지출 여부
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (mode === 'edit') {
                        if (editData?.isRecurring) {
                          setRecurringToastMessage('정기 지출로 생성된 내역은 해제할 수 없습니다.');
                        } else if (editData?.isInstallment) {
                          setRecurringToastMessage('할부 기록이므로 사용할 수 없습니다.');
                        } else {
                          setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        }
                        setShowRecurringToast(true);
                        return;
                      }
                    }}
                  >
                    <Switch
                      value={draftIsRecurring}
                      onValueChange={(value) => {
                        if (mode === 'edit') return;
                        void logEvent('ui', {
                          screen_name: analyticsScreenName,
                          target: 'recurring-toggle',
                        });
                        setDraftIsRecurring(value);
                        if (!value) {
                          setDraftTotalMonths(2);
                          if (!draftHasSelectedInstallment) {
                            setDraftRecurringType('매월');
                          }
                        } else {
                          setDraftIsInstallment(false);
                          setDraftHasSelectedInstallment(false);
                          setDraftRecurringType('매일');
                          if (params.selectedDate) {
                            const selectedDateObj = new Date(params.selectedDate);
                            setDraftSelectedDay(selectedDateObj.getDate());
                          }
                        }
                      }}
                      disabled={mode === 'edit'}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  현재 월 기준 매달 같은 날에 자동 기록합니다.
                </Text>
              </View>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* 할부 여부 */}
              <View style={styles.recurringSection}>
                <View style={styles.recurringTitleRow}>
                  <Text style={[styles.switchLabel, { color: colors.text }]}>
                    할부 여부
                  </Text>
                  <Pressable
                    onPress={() => {
                      if (mode === 'edit') {
                        if (editData?.isInstallment) {
                          setRecurringToastMessage('할부를 해제할 수 없습니다. 새로 생성해 주세요.');
                        } else if (editData?.isRecurring) {
                          setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        } else {
                          setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                        }
                        setShowRecurringToast(true);
                        return;
                      }
                    }}
                  >
                    <Switch
                      value={draftIsInstallment}
                      onValueChange={(value) => {
                        if (mode === 'edit') return;
                        void logEvent('ui', {
                          screen_name: analyticsScreenName,
                          target: 'installment-toggle',
                        });
                        setDraftIsInstallment(value);
                        if (value) {
                          setDraftIsRecurring(false);
                          setDraftHasSelectedInstallment(true);
                          if (params.selectedDate) {
                            const selectedDateObj = new Date(params.selectedDate);
                            setDraftSelectedDay(selectedDateObj.getDate());
                          }
                        }
                      }}
                      disabled={mode === 'edit'}
                    />
                  </Pressable>
                </View>
                <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                  할부 기간동안 해당 소비금액을 자동 기록합니다.
                </Text>
              </View>
            </View>
          </View>

          {/* 반복 기간 / 할부 기간 (드래프트) */}
          <View style={styles.sheetSection}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              {draftIsInstallment ? '할부 기간' : '반복 기간'}
            </Text>
            <View style={styles.chipContainer}>
              {draftIsRecurring || (!draftIsRecurring && !draftIsInstallment && !draftHasSelectedInstallment) ? (
                <>
                  {(draftIsPeriodExpanded ? recurringPeriodOptions : recurringPeriodOptions.slice(0, 6)).map((label) => (
                    <Chip
                      key={label}
                      type="option"
                      label={label}
                      active={draftRecurringType === label}
                      disabled={!draftIsRecurring && !draftIsInstallment}
                      onPress={() => {
                        if (!draftIsRecurring && !draftIsInstallment) return;
                        if (mode === 'edit' && editData?.isRecurring) {
                          setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                          setShowRecurringToast(true);
                          return;
                        }
                        const recurringTargetMap: Record<string, string> = {
                          매일: 'recurring-daily',
                          매주: 'recurring-weekly',
                          매월: 'recurring-monthly',
                          '2주': 'recurring-2weeks',
                          '3주': 'recurring-3weeks',
                          '4주': 'recurring-4weeks',
                          '2개월 마다': 'recurring-2months',
                          '4개월 마다': 'recurring-4months',
                          '6개월 마다': 'recurring-6months',
                          주중: 'recurring-weekdays',
                          주말: 'recurring-weekends',
                        };
                        const recurringTarget = recurringTargetMap[label];
                        if (recurringTarget) {
                          void logEvent('ui', {
                            screen_name: analyticsScreenName,
                            target: recurringTarget,
                          });
                        }
                        setDraftRecurringType(label);
                        if (label === '매월') {
                          setDraftTotalMonths(1);
                        } else if (label === '2개월 마다') {
                          setDraftTotalMonths(2);
                        } else if (label === '4개월 마다') {
                          setDraftTotalMonths(4);
                        } else if (label === '6개월 마다') {
                          setDraftTotalMonths(6);
                        }
                      }}
                      style={styles.periodChip}
                    />
                  ))}
                </>
              ) : (
                <>
                  {(draftIsPeriodExpanded ? installmentPeriodOptions : installmentPeriodOptions.slice(0, 6)).map((months) => (
                    <Chip
                      key={months}
                      type="option"
                      label={`${months}개월`}
                      active={draftTotalMonths === months}
                      disabled={!draftIsRecurring && !draftIsInstallment}
                      onPress={() => {
                        if (!draftIsRecurring && !draftIsInstallment) return;
                        if (mode === 'edit' && editData?.isInstallment) {
                          setRecurringToastMessage('변경할 수 없습니다. 새로 생성해 주세요.');
                          setShowRecurringToast(true);
                          return;
                        }
                        const installmentTargetMap: Record<number, string> = {
                          2: 'installment-2months',
                          3: 'installment-3months',
                          4: 'installment-4months',
                          5: 'installment-5months',
                          6: 'installment-6months',
                          7: 'installment-7months',
                          8: 'installment-8months',
                          9: 'installment-9months',
                          10: 'installment-10months',
                          11: 'installment-11months',
                          12: 'installment-12months',
                        };
                        const installmentTarget = installmentTargetMap[months];
                        if (installmentTarget) {
                          void logEvent('ui', {
                            screen_name: analyticsScreenName,
                            target: installmentTarget,
                          });
                        }
                        setDraftTotalMonths(months);
                      }}
                      style={styles.periodChip}
                    />
                  ))}
                </>
              )}
            </View>
            <Accordion
              expanded={draftIsPeriodExpanded}
              onToggle={setDraftIsPeriodExpanded}
              disabled={!draftIsRecurring && !draftIsInstallment}
            />
          </View>

          {/* 기록일이 주말인 경우 (드래프트) */}
          <View style={styles.sheetSection}>
            <Text style={[styles.sectionTitle, { color: colors.staticBlack }]}>
              기록일이 주말인 경우
            </Text>
            <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
              <Pressable 
                style={styles.radioRow}
                onPress={() => {
                  if (!draftIsRecurring && !draftIsInstallment) return;
                  if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                    setShowWeekendOptionToast(true);
                    return;
                  }
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'on-weekend',
                  });
                  setDraftWeekendOption('weekend');
                }}
                disabled={!draftIsRecurring && !draftIsInstallment}
              >
                <Text style={[styles.weekendOptionText, { color: colors.text }]}>
                  관계없이 주말 기록
                </Text>
                <Radio
                  checked={draftWeekendOption === 'weekend'}
                  onPress={() => {
                    if (!draftIsRecurring && !draftIsInstallment) return;
                    if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                      setShowWeekendOptionToast(true);
                      return;
                    }
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'on-weekend',
                    });
                    setDraftWeekendOption('weekend');
                  }}
                  label={false}
                  disabled={(!draftIsRecurring && !draftIsInstallment) || (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType))}
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Pressable 
                style={styles.radioRow}
                onPress={() => {
                  if (!draftIsRecurring && !draftIsInstallment) return;
                  if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                    setShowWeekendOptionToast(true);
                    return;
                  }
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'on-this-friday',
                  });
                  setDraftWeekendOption('friday');
                }}
                disabled={!draftIsRecurring && !draftIsInstallment}
              >
                <Text style={[styles.weekendOptionText, { color: colors.text }]}>
                  금주 금요일 기록
                </Text>
                <Radio
                  checked={draftWeekendOption === 'friday'}
                  onPress={() => {
                    if (!draftIsRecurring && !draftIsInstallment) return;
                    if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                      setShowWeekendOptionToast(true);
                      return;
                    }
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'on-this-friday',
                    });
                    setDraftWeekendOption('friday');
                  }}
                  label={false}
                  disabled={(!draftIsRecurring && !draftIsInstallment) || (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType))}
                />
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <Pressable 
                style={styles.radioRow}
                onPress={() => {
                  if (!draftIsRecurring && !draftIsInstallment) return;
                  if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                    setShowWeekendOptionToast(true);
                    return;
                  }
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'on-next-monday',
                  });
                  setDraftWeekendOption('monday');
                }}
                disabled={!draftIsRecurring && !draftIsInstallment}
              >
                <Text style={[styles.weekendOptionText, { color: colors.text }]}>
                  차주 월요일 기록
                </Text>
                <Radio
                  checked={draftWeekendOption === 'monday'}
                  onPress={() => {
                    if (!draftIsRecurring && !draftIsInstallment) return;
                    if (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType)) {
                      setShowWeekendOptionToast(true);
                      return;
                    }
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'on-next-monday',
                    });
                    setDraftWeekendOption('monday');
                  }}
                  label={false}
                  disabled={(!draftIsRecurring && !draftIsInstallment) || (draftIsRecurring && ['매일', '주중', '주말'].includes(draftRecurringType))}
                />
              </Pressable>
            </View>
          </View>
        </ScrollView>
        {/* 홈 인디케이터 영역 (스크롤 뷰 밖에 배치) */}
        <View style={{ height: insets.bottom }} />
      </ModalBottomsheet>

      {/* 금액 미입력 얼럿 */}
      <ModalPopup
        visible={showAmountAlert}
        onConfirm={() => setShowAmountAlert(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          금액을 입력해 주세요.
        </Text>
      </ModalPopup>

      {/* 정기 지출 주말 확인 모달 */}
      <ModalPopup
        visible={showWeekendConfirm}
        title="정기 기록 주말여부 안내"
        onConfirm={async () => {
          setShowWeekendConfirm(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowWeekendConfirm(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.weekendConfirmText, { color: colors.textNeutral }]}>
          지정하신 날짜가 주말에 해당 됩니다.{'\n'}
          선택하신 옵션에 따라{'\n'}
          {`'${weekendOption === 'friday' ? '금주 금요일 기록' : weekendOption === 'monday' ? '차주 월요일 기록' : '관계없이 주말 기록'}'에 기록됩니다.`}{'\n'}
          진행하시겠어요?
        </Text>
      </ModalPopup>

      {/* 기간 선택은 이제 Selectbox를 사용하므로 DatePicker 제거됨 */}

      {/* 일반 삭제 확인 모달 */}
      <ModalPopup
        visible={showDeleteConfirm}
        title="소비내역 삭제"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          이 소비내역을 삭제하시겠어요?{'\n'}
          삭제된 내역은 복구할 수 없습니다.
        </Text>
      </ModalPopup>

      {/* 결산 처리 안내 모달 */}
      <ModalPopup
        visible={showSettlementConfirmModal}
        title="결산 처리 안내"
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'settlement-confirm',
          });
          await handleSingleRecordSettlement();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'settlement-close',
          });
          setShowSettlementConfirmModal(false);
        }}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            선택하신 사항에 따라{'\n'}해당 소비내역을 마감하여{'\n'}결산 처리한 내역이 반영 됩니다.
          </Text>

          <View style={[styles.settlementInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.settlementTopRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {settlementAmountText}
              </Text>
            </View>

            <View style={[styles.settlementDivider, { backgroundColor: colors.border }]} />

            <View style={[styles.settlementSubRow, styles.settlementSubRowSpacing]}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                소비
              </Text>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                - {settlementAmountText}
              </Text>
            </View>
            <View style={styles.settlementSubRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                결산
              </Text>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                + {settlementAmountText}
              </Text>
            </View>

            <View style={[styles.settlementDivider, { backgroundColor: colors.border }]} />

            <View style={styles.settlementTopRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                최종 정산
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                0원
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {settlementPeriodText}
              </Text>
            </View>
          </View>
        </View>
      </ModalPopup>

      {/* 환불 처리 옵션 모달 */}
      <ModalPopup
        visible={showRefundOptions}
        title={`${getRecordTypeLabel()} 기록 환불 반영 안내`}
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'refund-confirm',
          });
          await handleMultipleRecordsRefund();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'refund-cancel',
          });
          setShowRefundOptions(false);
        }}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            선택하신 사항에 따라{'\n'}{getRecordTypeLabel()} 기록 내역이 반영 됩니다.
          </Text>
          
          {/* 할부 기록 정보 카드 */}
          <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.recurringInfoRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {getRefundAmount()}
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {getRefundPeriod()}
              </Text>
            </View>
          </View>
          
          {/* 환불 옵션들 */}
          <View style={[styles.deleteOptionsList, { backgroundColor: colors.fill }]}>
            {/* 전체 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => {
                void logEvent('ui', {
                  screen_name: analyticsScreenName,
                  target: 'refund-repetition-all',
                });
                setRefundOption('all');
              }}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  전체 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  {getRecordTypeLabel()} 기록을 모두 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'all'}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'refund-repetition-all',
                  });
                  setRefundOption('all');
                }}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘만 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => {
                void logEvent('ui', {
                  screen_name: analyticsScreenName,
                  target: 'refund-repetition-today',
                });
                setRefundOption('today');
              }}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘만 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  해당 날짜만 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'today'}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'refund-repetition-today',
                  });
                  setRefundOption('today');
                }}
              />
            </Pressable>
            
            <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />
            
            {/* 오늘 포함한 이후의 기록 환불 */}
            <Pressable 
              style={styles.deleteOptionItem}
              onPress={() => {
                void logEvent('ui', {
                  screen_name: analyticsScreenName,
                  target: 'refund-repetition-future',
                });
                setRefundOption('future');
              }}
            >
              <View style={styles.deleteOptionContent}>
                <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                  오늘 포함한 이후의 기록 환불
                </Text>
                <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                  이전 기록은 유지하고 환불합니다.
                </Text>
              </View>
              <Radio
                checked={refundOption === 'future'}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'refund-repetition-future',
                  });
                  setRefundOption('future');
                }}
              />
            </Pressable>
          </View>
        </View>
      </ModalPopup>

      {/* 일반 기록 환불 처리 확인 모달 */}
      <ModalPopup
        visible={showSingleRefundConfirm}
        title={`${getRecordTypeLabel()} 기록 환불 반영 안내`}
        onConfirm={async () => {
          setShowSingleRefundConfirm(false);
          await handleSingleRecordRefund();
        }}
        onCancel={() => setShowSingleRefundConfirm(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            선택하신 사항에 따라{'\n'}
            {getRecordTypeLabel()} 기록 내역이 반영 됩니다.
          </Text>
          <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.recurringInfoRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {(editData?.amount ?? 0).toLocaleString()}원
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {getSingleRefundPeriod()}
              </Text>
            </View>
          </View>
        </View>
      </ModalPopup>

      {/* 선결제 처리 복구 모달 */}
      <ModalPopup
        visible={showPrepaymentRestore}
        title="선결제 처리 복구 안내"
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'prepayment-restoration-confirm',
          });
          await handlePrepaymentRestore();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'prepayment-restoration-cancel',
          });
          setShowPrepaymentRestore(false);
        }}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          선결제 처리된 해당 기록을{'\n'}
          원래 {getRecordTypeLabel()} 예정일인{'\n'}
          {formatOriginalScheduledDate(
            (editData?.installmentOriginDate ||
              editData?.originalDate ||
              editData?.date ||
              '').replace(/-/g, '.'),
          ) || '날짜'}
          로 복구 됩니다.
        </Text>
      </ModalPopup>

      {/* 환불 처리 복구 모달 */}
      <ModalPopup
        visible={showRefundRestore}
        title="환불 처리 복구 안내"
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'refund-restoration-confirm',
          });
          await handleRefundRestore();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'refund-restoration-cancel',
          });
          setShowRefundRestore(false);
        }}
        confirmText="확인"
        cancelText="취소"
      >
        {(editData?.isInstallment || editData?.isRecurring) ? (
          <View style={styles.deleteOptionsContainer}>
            <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
              선택하신 사항에 따라{'\n'}{getRecordTypeLabel()} 기록 내역이 반영 됩니다.
            </Text>

            <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
              <View style={styles.recurringInfoRow}>
                <Text style={[styles.recurringCategory, { color: colors.text }]}>
                  {categoryDisplay || '카테고리'}
                </Text>
                <Text style={[styles.recurringAmount, { color: colors.text }]}>
                  {getRefundRestoreAmount()}
                </Text>
              </View>
              <View style={styles.recurringPeriodRow}>
                <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                  {getRefundRestorePeriod()}
                </Text>
              </View>
            </View>

            <View style={[styles.deleteOptionsList, { backgroundColor: colors.fill }]}>
              <Pressable
                style={styles.deleteOptionItem}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'prepayment-restoration-all',
                  });
                  setRefundRestoreOption('all');
                }}
              >
                <View style={styles.deleteOptionContent}>
                  <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                    전체 환불 복구
                  </Text>
                  <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                    {getRecordTypeLabel()} 기록을 모두 복구합니다.
                  </Text>
                </View>
                <Radio
                  checked={refundRestoreOption === 'all'}
                  onPress={() => {
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'prepayment-restoration-all',
                    });
                    setRefundRestoreOption('all');
                  }}
                />
              </Pressable>

              <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />

              <Pressable
                style={styles.deleteOptionItem}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'prepayment-restoration-today',
                  });
                  setRefundRestoreOption('today');
                }}
              >
                <View style={styles.deleteOptionContent}>
                  <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                    오늘만 환불 복구
                  </Text>
                  <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                    해당 날짜만 복구합니다.
                  </Text>
                </View>
                <Radio
                  checked={refundRestoreOption === 'today'}
                  onPress={() => {
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'prepayment-restoration-today',
                    });
                    setRefundRestoreOption('today');
                  }}
                />
              </Pressable>

              <View style={[styles.deleteOptionDivider, { backgroundColor: colors.border }]} />

              <Pressable
                style={styles.deleteOptionItem}
                onPress={() => {
                  void logEvent('ui', {
                    screen_name: analyticsScreenName,
                    target: 'prepayment-restoration-future',
                  });
                  setRefundRestoreOption('future');
                }}
              >
                <View style={styles.deleteOptionContent}>
                  <Text style={[styles.deleteOptionTitle, { color: colors.text }]}>
                    오늘 포함한 이후의 기록 복구
                  </Text>
                  <Text style={[styles.deleteOptionDescription, { color: colors.textAssistive }]}>
                    이전 기록은 유지하고 복구합니다.
                  </Text>
                </View>
                <Radio
                  checked={refundRestoreOption === 'future'}
                  onPress={() => {
                    void logEvent('ui', {
                      screen_name: analyticsScreenName,
                      target: 'prepayment-restoration-future',
                    });
                    setRefundRestoreOption('future');
                  }}
                />
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
            환불 처리된 해당 기록을{'\n'}
            최초 {getRecordTypeLabel()} 기록일로 복구가 진행됩니다.
          </Text>
        )}
      </ModalPopup>

      {/* 결산 처리 복구 모달 */}
      <ModalPopup
        visible={showSettlementRestore}
        title="결산 처리 복구 안내"
        onConfirm={async () => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'settlement-restoration-confirm',
          });
          await handleSettlementRestore();
        }}
        onCancel={() => {
          void logEvent('btn', {
            screen_name: analyticsScreenName,
            target: 'settlement-restoration-cancel',
          });
          setShowSettlementRestore(false);
        }}
        confirmText="확인"
        cancelText="취소"
      >
        <View style={styles.deleteOptionsContainer}>
          <Text style={[styles.deleteOptionsDescription, { color: colors.textNeutral }]}>
            결산 처리된 해당 기록을{'\n'}
            최초 소비내역 상태로 복구가 진행됩니다.
          </Text>
          <View style={[styles.recurringInfoCard, { backgroundColor: colors.fill }]}>
            <View style={styles.recurringInfoRow}>
              <Text style={[styles.recurringCategory, { color: colors.text }]}>
                {categoryDisplay || '카테고리'}
              </Text>
              <Text style={[styles.recurringAmount, { color: colors.text }]}>
                {settlementRestoreAmountText}
              </Text>
            </View>
            <View style={styles.recurringPeriodRow}>
              <Text style={[styles.recurringPeriod, { color: colors.textAssistive }]}>
                {settlementPeriodText}
              </Text>
            </View>
          </View>
        </View>
      </ModalPopup>

      {/* 변경사항 없음 모달 */}
      <ModalPopup
        visible={showNoChangesModal}
        onConfirm={() => setShowNoChangesModal(false)}
        confirmText="확인"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          변경된 내용이 없습니다.
        </Text>
      </ModalPopup>

      {/* 정기/할부 기록 수정 확인 모달 */}
      <ModalPopup
        visible={showEditConfirmModal}
        title="소비 기록 안내"
        onConfirm={async () => {
          setShowEditConfirmModal(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowEditConfirmModal(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          {editConfirmMessage}
        </Text>
      </ModalPopup>

      {/* 정기·할부 + 환불/선결제/결산 처리 건 저장 확인 모달 */}
      <ModalPopup
        visible={showRefundEditConfirmModal}
        title="소비 기록 안내"
        onConfirm={async () => {
          setShowRefundEditConfirmModal(false);
          await saveExpenseRecord();
        }}
        onCancel={() => setShowRefundEditConfirmModal(false)}
        confirmText="확인"
        cancelText="취소"
      >
        <Text style={[styles.alertText, { color: colors.text }]}>
          {refundEditConfirmMessage}
        </Text>
      </ModalPopup>

      {/* 일자 선택 네이티브 피커 */}
      <DatePicker
        visible={showDayPicker}
        onClose={() => setShowDayPicker(false)}
        title="일자 선택"
        dayOptions={Array.from({ length: 31 }, (_, i) => {
          const day = i + 1;
          
          // 수정 모드: 실제 저장된 데이터의 년월 기준으로 요일 계산
          let year, month;
          if (mode === 'edit' && editData?.date) {
            const normalizedDate = editData.date.replace(/-/g, '.');
            const [editYear, editMonth] = normalizedDate.split('.').map(Number);
            year = editYear;
            month = editMonth;
          } else {
            // 생성 모드: 현재 년월 기준
            const today = new Date();
            year = today.getFullYear();
            month = today.getMonth() + 1;
          }
          
          // 해당 년월의 날짜로 요일 계산
          const dateObj = new Date(year, month - 1, day);
          const actualDayOfWeek = dateObj.getDay();
          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
          const actualDayOfWeekLabel = weekdays[actualDayOfWeek];
          
          return {
            label: `${day}일(${actualDayOfWeekLabel})`,
            value: day,
          };
        })}
        selectedDay={selectedDay}
        onDayChange={(day) => {
          setSelectedDay(day);
          // 선택한 일자로 날짜 업데이트
          // 오늘만 수정 모드: 실제 저장된 날짜의 년월 기준으로 일자만 변경
          let year, month;
          if (mode === 'edit' && editData?.date) {
            // 수정 모드: 실제 저장된 날짜의 년월 사용 (주말 조정 반영된 날짜)
            const normalizedDate = editData.date.replace(/-/g, '.');
            const [editYear, editMonth] = normalizedDate.split('.').map(Number);
            year = editYear;
            month = editMonth;

          } else {
            // 생성 모드: 현재 년월 사용
            const today = new Date();
            year = today.getFullYear();
            month = today.getMonth() + 1;
          }
          const actualDay = getActualDayForMonth(year, month, day);
          const newDate = `${year}.${String(month).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;

          setDate(newDate);
          setDisplayDate(newDate);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 0,
  },
  customKeypadOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
    elevation: 100,
  },
  customKeypadBlur: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  customKeypadTint: {
    ...StyleSheet.absoluteFillObject,
  },
  customKeypadContent: {
    width: '100%',
  },
  customKeypadContainer: {
    width: '100%',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
  },
  currentYearMonth: {
    ...Typography.body2.r.regular,
  },
  categoryInput: {
    // Input 컴포넌트가 자체 스타일을 가지고 있으므로 추가 스타일 불필요
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateInput: {
    flex: 1,
  },
  dateHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringInstallmentButton: {
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  recurringInstallmentButtonText: {
    ...Typography.body1.l.regular,
    fontSize: 16,
    lineHeight: 24,
    textDecorationLine: 'underline',
  },
  card: {
    borderRadius: 16,
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
  switchLabel: {
    ...Typography.body1.l.regular,
  },
  recurringCaption: {
    ...Typography.body2.r.regular,
    marginTop: 0,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  radioRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekendOptionText: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    lineHeight: 24,
    color: '#222222',
  },
  amountInput: {
    flex: 1,
  },
  pickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerModalContainer: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  cancelButton: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '400',
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    textAlign: 'right',
  },
  pickerRow: {
    flexDirection: 'row',
    width: '100%',
  },
  picker: {
    width: '100%',
    height: 216,
  },
  dateBottomsheetContent: {
    padding: 0,
  },
  dateButtonArea: {
    padding: 16,
  },
  dateButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateButtonText: {
    ...Typography.body1.l.medium,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  paymentTypeStickyContainer: {
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
  },
  paymentTypeTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  paymentTypeStickyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentTypeStickyLabel: {
    ...Typography.body2.r.bold,
    fontSize: 16,
  },
  paymentTypeStickyControls: {
    width: 200,
  },
  paymentTypeSheetContent: {
    padding: 0,
  },
  paymentTypeSheetBody: {
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  paymentTypeSheetFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 37,
  },
  paymentTypeSheetFilterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentTypeSheetCashButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentTypeSheetList: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
  },
  paymentTypeSheetListScroll: {
    flex: 1,
  },
  paymentTypeSheetListScrollContent: {
    flexGrow: 1,
  },
  paymentTypeSheetListHomeGap: {
    height: 16,
  },
  paymentTypeSheetHomeIndicatorArea: {
    height: 34,
    marginHorizontal: -16,
  },
  paymentTypeSheetItem: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  paymentTypeSheetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentTypeSheetIndicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  paymentTypeSheetTextBlock: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  paymentTypeSheetTextBlockSingleLine: {
    justifyContent: 'center',
  },
  paymentTypeSheetDefaultTagWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentTypeSheetTitle: {
    ...Typography.body1.l.regular,
  },
  paymentTypeSheetSubtitle: {
    ...Typography.body2.r.regular,
  },
  paymentTypeSheetDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  paymentTypeSheetCashEmoji: {
    ...Typography.headline4.r.medium,
    lineHeight: 24,
  },
  paymentTypeSheetCashText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  alertText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
  },
  weekendConfirmText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  // 새로운 스타일들
  installmentButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  installmentText: {
    ...Typography.body2.r.medium,
    fontSize: 14,
  },
  recurringAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recurringAmountContainer: {
    gap: 12,
  },
  periodSelectRow: {
    marginTop: 12,
  },
  periodSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    width: 100,
  },
  periodSelectText: {
    ...Typography.body1.l.medium,
  },
  periodSelectInput: {
    width: 100,
    height: 48,
  },
  installmentAmountInput: {
    flex: 1,
    minWidth: 200,
  },
  recurringAmountInput: {
    width: '100%',
  },
  amountExpression: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  amountExpressionText: {
    ...Typography.body1.l.bold,
  },
  amountExpressionOperator: {
    ...Typography.body1.l.bold,
  },
  installmentAmountContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(54, 100, 206, 0.05)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  installmentAmountLabel: {
    ...Typography.body2.r.medium,
  },
  installmentAmountValue: {
    ...Typography.body1.l.bold,
    fontSize: 16,
  },
  // 정기 지출 날짜 선택 스타일
  recurringDateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    height: 48,
  },
  recurringDateLeft: {
    flex: 1,
  },
  recurringDateLabel: {
    ...Typography.body1.l.regular,
  },
  recurringDateRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayPickerText: {
    ...Typography.body1.l.regular,
  },
  // 소비 정보 카드 스타일
  deleteText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  expenseInfoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  expenseInfoContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  expenseInfoLeft: {
    flex: 0.55,
  },
  expenseInfoRight: {
    flex: 0.45,
    alignItems: 'flex-end',
  },
  expenseInfoTop: {
    marginBottom: 8,
  },
  expenseInfoBottom: {
    // No additional styles needed
  },
  expenseInfoDivider: {
    height: 1,
    width: '100%',
    // opacity 제거 - colors.border에 이미 투명도가 포함되어 있음 (rgba(144,146,158,0.16))
  },
  prepaymentRefundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prepaymentRefundLabel: {
    ...Typography.body1.l.regular,
  },
  prepaymentRefundActions: {
    flexDirection: 'row',
  },
  prepaymentRefundButton: {
    paddingVertical: 0,
    marginLeft: 12,
  },
  prepaymentRefundText: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  settlementDropdownMenuContainer: {
    position: 'absolute',
  },
  settlementDropdownMenuPanel: {
    borderRadius: 12,
    minWidth: 250,
    // Liquid Glass: 가장자리 쉰 + 드롭다운 그림자 (x0, y8, blur 16, #000 10%)
    ...(Platform.OS === 'ios' && {
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
    }),
    ...(Platform.OS === 'android' && { elevation: 12 }),
  },
  settlementDropdownMenuClip: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settlementDropdownMenuBlur: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  settlementDropdownMenuGlassOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 12,
  },
  settlementDropdownMenuGlassSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  settlementDropdownMenuItem: {
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  settlementDropdownMenuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.12)',
  },
  settlementDropdownMenuLabel: {
    ...Typography.body1.l.regular,
    fontSize: 17,
  },
  expenseCategory: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  expenseDate: {
    ...Typography.body2.r.regular,
  },
  expenseAmount: {
    ...Typography.body1.l.bold,
    fontSize: 21,
    lineHeight: 31.5,
  },
  expenseMemo: {
    ...Typography.body2.r.regular,
    textAlign: 'right',
  },
  deleteConfirmText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  // 정기 기록 삭제 옵션 모달 스타일
  deleteOptionsContainer: {
    gap: 16,
  },
  deleteOptionsDescription: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  recurringInfoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  recurringInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringCategory: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  recurringAmount: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  recurringPeriodRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  recurringPeriod: {
    ...Typography.body2.r.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  settlementInfoCard: {
    borderRadius: 16,
    padding: 16,
    gap: 0,
  },
  settlementTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settlementSubRowSpacing: {
    marginBottom: 4,
  },
  settlementDivider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  deleteOptionsList: {
    borderRadius: 16,
    padding: 0,
    overflow: 'hidden',
  },
  deleteOptionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  deleteOptionContent: {
    flex: 1,
    gap: 4,
  },
  deleteOptionTitle: {
    ...Typography.body1.l.medium,
    fontSize: 16,
    lineHeight: 24,
  },
  deleteOptionDescription: {
    ...Typography.body1.l.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  deleteOptionDivider: {
    height: 1,
    marginHorizontal: 20,
  },
  // 반복/할부 설정 바텀시트 스타일
  recurringInstallmentSheetInner: {
    backgroundColor: 'transparent',
  },
  recurringInstallmentSheetScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32, // 하단 여백 32 (스크롤 가능한 영역 내에서 보이도록)
    gap: 24,
  },
  sheetSection: {
    gap: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  periodChip: {
    marginBottom: 0,
    width: '31.5%', // 3열로 균일하게 배치 (100% - 16*2 padding - 8*2 gap) / 3 ≈ 31.5%
    height: 40, // Chip 높이 40으로 고정
  },
});

