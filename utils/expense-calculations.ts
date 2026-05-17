/**
 * Expense Calculation Utilities
 * 
 * 정기 기록과 할부 기록의 금액 계산 로직을 통합 관리
 */

export interface ExpenseCalculationParams {
  totalAmount: number;
  months: number;
  isInstallment: boolean;
  isEditMode?: boolean;
  existingAmount?: number;
  isExistingInstallment?: boolean;
}

export interface ExpenseCalculationResult {
  monthlyAmount: number;
  firstMonthAmount: number;
  remainingAmount: number;
  isInstallmentRecord: boolean;
}

/**
 * 정기 기록의 월별 금액을 계산합니다
 */
export function calculateRecurringAmount(params: ExpenseCalculationParams): ExpenseCalculationResult {
  const { totalAmount, months, isInstallment, isEditMode, existingAmount, isExistingInstallment } = params;
  
  // 수정 모드이고 기존 할부 기록인 경우: 기존 금액 그대로 사용 (재할부 방지)
  if (isEditMode && isExistingInstallment && existingAmount) {
    return {
      monthlyAmount: existingAmount,
      firstMonthAmount: existingAmount,
      remainingAmount: 0,
      isInstallmentRecord: true
    };
  }
  
  if (isInstallment) {
    // 할부 기록: 총 금액을 개월 수로 나누기
    const baseAmount = Math.floor(totalAmount / months);
    const remainder = totalAmount - (baseAmount * months);
    
    return {
      monthlyAmount: baseAmount,
      firstMonthAmount: baseAmount + remainder, // 첫 번째 달에 나머지 추가
      remainingAmount: remainder,
      isInstallmentRecord: true
    };
  } else {
    // 일반 정기 기록: 매달 동일한 금액
    return {
      monthlyAmount: totalAmount,
      firstMonthAmount: totalAmount,
      remainingAmount: 0,
      isInstallmentRecord: false
    };
  }
}

/**
 * 기록 타입을 판단합니다
 */
export function getRecordType(record: any): 'single' | 'recurring' | 'installment' {
  if (!record.isRecurring) return 'single';
  if (record.isInstallment || record.originalInstallment) return 'installment';
  return 'recurring';
}

/**
 * 수정 가능한 필드를 확인합니다
 */
export function getEditableFields(record: any, mode: 'create' | 'edit'): {
  canEditCategory: boolean;
  canEditAmount: boolean;
  canEditRecurring: boolean;
  canEditInstallment: boolean;
} {
  if (mode === 'create') {
    return {
      canEditCategory: true,
      canEditAmount: true,
      canEditRecurring: true,
      canEditInstallment: true
    };
  }
  
  // 수정 모드에서 정기/할부 기록은 제한적 수정만 가능
  if (record.isRecurring) {
    return {
      canEditCategory: false, // 정기 기록은 카테고리 변경 불가
      canEditAmount: false,   // 정기 기록은 금액 변경 불가
      canEditRecurring: false, // 정기 기록은 해제 불가
      canEditInstallment: false     // 할부 설정 변경 불가
    };
  }
  
  return {
    canEditCategory: true,
    canEditAmount: true,
    canEditRecurring: true,
    canEditInstallment: true
  };
}

/**
 * 정기 기록의 기간을 계산합니다
 */
export function calculateRecurringPeriod(startDate: string, months: number): string {
  const [year, month, day] = startDate.split('.').map(Number);
  const start = new Date(year, month - 1, day);
  // ✅ 수정: months - 1을 빼서 정확한 개월 수 계산
  const end = new Date(year, month - 1 + months - 1, day);
  
  const startStr = `${String(start.getFullYear()).slice(-2)}/${String(start.getMonth() + 1).padStart(2, '0')}`;
  const endStr = `${String(end.getFullYear()).slice(-2)}/${String(end.getMonth() + 1).padStart(2, '0')}`;
  
  return `${startStr} - ${endStr}`;
}

/**
 * 주말 날짜를 조정합니다
 */
export function adjustWeekendDate(dateString: string, option: 'friday' | 'monday'): string {
  const [year, month, day] = dateString.split('.').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay();
  
  if (dayOfWeek === 0) {
    // 일요일
    if (option === 'friday') {
      dateObj.setDate(dateObj.getDate() - 2);
    } else {
      dateObj.setDate(dateObj.getDate() + 1);
    }
  } else if (dayOfWeek === 6) {
    // 토요일
    if (option === 'friday') {
      dateObj.setDate(dateObj.getDate() - 1);
    } else {
      dateObj.setDate(dateObj.getDate() + 2);
    }
  }
  
  const adjustedYear = dateObj.getFullYear();
  const adjustedMonth = String(dateObj.getMonth() + 1).padStart(2, '0');
  const adjustedDay = String(dateObj.getDate()).padStart(2, '0');
  
  return `${adjustedYear}.${adjustedMonth}.${adjustedDay}`;
}

/**
 * 해당 월의 실제 일자를 계산합니다 (월말 처리)
 */
export function getActualDayForMonth(year: number, month: number, desiredDay: number): number {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  return Math.min(desiredDay, lastDayOfMonth);
}

/**
 * 요일 라벨을 계산합니다
 */
export function getDayOfWeekLabel(year: number, month: number, day: number): string {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(year, month - 1, day);
  return weekdays[date.getDay()];
}

/** 매일/매주/주중/주말 등 반복 단위에서 주말 옵션(금요일·월요일 이동)을 쓰지 않는 타입 */
export const RECURRING_TYPES_WITHOUT_WEEKEND_OPTION = new Set([
  '매일',
  '매주',
  '2주',
  '3주',
  '4주',
  '주중',
  '주말',
]);

export function shouldIgnoreWeekendOptionForRecurringType(recurringType: string | undefined): boolean {
  return typeof recurringType === 'string' && RECURRING_TYPES_WITHOUT_WEEKEND_OPTION.has(recurringType);
}

/**
 * 정기 기록 확인 카드·반복설정 요약용 주말 옵션 표시 문구.
 * - 주말 반복: 주중 관계없이 기록
 * - 주중 반복: 주말 관계없이 기록
 * - 그 외(매일·매주 등): 주말 관계없이 기록
 */
export function getRecurringWeekendOptionDisplayLabel(
  recurringType: string | undefined,
  weekendOption: 'weekend' | 'friday' | 'monday' = 'weekend',
  options?: { isRecurring?: boolean },
): string {
  const isRecurring = options?.isRecurring ?? true;
  if (isRecurring && shouldIgnoreWeekendOptionForRecurringType(recurringType)) {
    if (recurringType === '주말') return '주중 관계없이 기록';
    if (recurringType === '주중') return '주말 관계없이 기록';
    return '주말 관계없이 기록';
  }

  switch (weekendOption) {
    case 'friday':
      return '금주 금요일 기록';
    case 'monday':
      return '차주 월요일 기록';
    default:
      return '관계없이 주말 기록';
  }
}

function hasRecurringTone(message: string): boolean {
  return /씩|마다|나가|내고|정기/.test(message);
}

/**
 * 간편입력 문장에서 반복 주기를 규칙 기반으로 보정합니다.
 * "3주전" 같은 시작 시점 표현은 주기로 보지 않고, "3주마다/3주 간격"만 주기로 인정합니다.
 */
export function resolveExpenseRecurringTypeFromMessage(
  message: string,
  currentRecurringType?: string,
): string | undefined {
  const compact = message.replace(/\s+/g, '').toLowerCase();

  if (/매일|매일마다|매일같이|일마다|daily/.test(compact)) return '매일';
  if (/(?:주중|평일)(?:마다)?/.test(compact) && hasRecurringTone(compact)) return '주중';
  if (/주말(?:마다)?/.test(compact) && hasRecurringTone(compact)) return '주말';

  if (/격주|2주마다|2주간격|2주주기|매2주/.test(compact)) return '2주';
  if (/3주마다|3주간격|3주주기|매3주/.test(compact)) return '3주';
  if (/4주마다|4주간격|4주주기|매4주/.test(compact)) return '4주';
  if (/매주|(?:^|[^\d])주마다|weekly/.test(compact)) return '매주';

  if (/2개월마다|2개월간격|2개월주기|매2개월/.test(compact)) return '2개월 마다';
  if (/3개월마다|3개월간격|3개월주기|매3개월|분기마다/.test(compact)) return '3개월 마다';
  if (/4개월마다|4개월간격|4개월주기|매4개월/.test(compact)) return '4개월 마다';
  if (/5개월마다|5개월간격|5개월주기|매5개월/.test(compact)) return '5개월 마다';
  if (/6개월마다|6개월간격|6개월주기|매6개월|반기마다/.test(compact)) return '6개월 마다';

  if (
    /구독|매달|매월|월마다|월세|정기결제|자동이체|통신료|보험료|관리비|학원비|헬스장|적금|subscription|monthly|recurring/.test(
      compact,
    )
  ) {
    return '매월';
  }

  return currentRecurringType;
}

/**
 * recurringType에 따른 다음 날짜 계산 (정기/할부 기록 생성용)
 */
export function getNextRecurringDate(
  currentDate: string,
  recurringType: string,
  _iteration: number,
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
    case '3개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 3);
      break;
    case '4개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 4);
      break;
    case '5개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 5);
      break;
    case '6개월 마다':
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 6);
      break;
    case '주중':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 1);
      while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
    case '주말':
      nextDate = new Date(dateObj);
      nextDate.setDate(dateObj.getDate() + 1);
      while (nextDate.getDay() !== 0 && nextDate.getDay() !== 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
    default:
      nextDate = new Date(dateObj);
      nextDate.setMonth(dateObj.getMonth() + 1);
      break;
  }

  if (nextDate.getFullYear() > startYear) return null;
  const nextYearNum = nextDate.getFullYear();
  const nextMonthNum = nextDate.getMonth() + 1;
  const nextDayNum = nextDate.getDate();
  const actualDay = getActualDayForMonth(nextYearNum, nextMonthNum, nextDayNum);
  return `${nextYearNum}.${String(nextMonthNum).padStart(2, '0')}.${String(actualDay).padStart(2, '0')}`;
}

/**
 * recurringType에 따른 반복 횟수 계산 (해당 년도 내)
 */
export function calculateRecurringIterations(startDate: string, recurringType: string): number {
  const [startYear, startMonth, startDay] = startDate.split('.').map(Number);
  const startDateObj = new Date(startYear, startMonth - 1, startDay);
  const endOfYear = new Date(startYear, 11, 31);
  let iterations = 0;
  let currentDate = new Date(startDateObj);

  while (currentDate <= endOfYear) {
    iterations++;
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
      case '3개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 3);
        break;
      case '4개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 4);
        break;
      case '5개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 5);
        break;
      case '6개월 마다':
        currentDate.setMonth(currentDate.getMonth() + 6);
        break;
      case '주중':
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate <= endOfYear && (currentDate.getDay() === 0 || currentDate.getDay() === 6)) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        break;
      case '주말':
        currentDate.setDate(currentDate.getDate() + 1);
        while (currentDate <= endOfYear && currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
        break;
      default:
        currentDate.setMonth(currentDate.getMonth() + 1);
        break;
    }
  }
  return iterations;
}
