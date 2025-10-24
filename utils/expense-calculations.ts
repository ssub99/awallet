/**
 * Expense Calculation Utilities
 * 
 * 정기 기록과 분할 기록의 금액 계산 로직을 통합 관리
 */

export interface ExpenseCalculationParams {
  totalAmount: number;
  months: number;
  isSplit: boolean;
  isEditMode?: boolean;
  existingAmount?: number;
  isExistingSplit?: boolean;
}

export interface ExpenseCalculationResult {
  monthlyAmount: number;
  firstMonthAmount: number;
  remainingAmount: number;
  isSplitRecord: boolean;
}

/**
 * 정기 기록의 월별 금액을 계산합니다
 */
export function calculateRecurringAmount(params: ExpenseCalculationParams): ExpenseCalculationResult {
  const { totalAmount, months, isSplit, isEditMode, existingAmount, isExistingSplit } = params;
  
  // 수정 모드이고 기존 분할 기록인 경우: 기존 금액 그대로 사용 (재분할 방지)
  if (isEditMode && isExistingSplit && existingAmount) {
    return {
      monthlyAmount: existingAmount,
      firstMonthAmount: existingAmount,
      remainingAmount: 0,
      isSplitRecord: true
    };
  }
  
  if (isSplit) {
    // 분할 기록: 총 금액을 개월 수로 나누기
    const baseAmount = Math.floor(totalAmount / months);
    const remainder = totalAmount - (baseAmount * months);
    
    return {
      monthlyAmount: baseAmount,
      firstMonthAmount: baseAmount + remainder, // 첫 번째 달에 나머지 추가
      remainingAmount: remainder,
      isSplitRecord: true
    };
  } else {
    // 일반 정기 기록: 매달 동일한 금액
    return {
      monthlyAmount: totalAmount,
      firstMonthAmount: totalAmount,
      remainingAmount: 0,
      isSplitRecord: false
    };
  }
}

/**
 * 기록 타입을 판단합니다
 */
export function getRecordType(record: any): 'single' | 'recurring' | 'split' {
  if (!record.isRecurring) return 'single';
  if (record.isAmountSplit || record.originalAmountSplit) return 'split';
  return 'recurring';
}

/**
 * 수정 가능한 필드를 확인합니다
 */
export function getEditableFields(record: any, mode: 'create' | 'edit'): {
  canEditCategory: boolean;
  canEditAmount: boolean;
  canEditRecurring: boolean;
  canEditSplit: boolean;
} {
  if (mode === 'create') {
    return {
      canEditCategory: true,
      canEditAmount: true,
      canEditRecurring: true,
      canEditSplit: true
    };
  }
  
  // 수정 모드에서 정기/분할 기록은 제한적 수정만 가능
  if (record.isRecurring) {
    return {
      canEditCategory: false, // 정기 기록은 카테고리 변경 불가
      canEditAmount: false,   // 정기 기록은 금액 변경 불가
      canEditRecurring: false, // 정기 기록은 해제 불가
      canEditSplit: false     // 분할 설정 변경 불가
    };
  }
  
  return {
    canEditCategory: true,
    canEditAmount: true,
    canEditRecurring: true,
    canEditSplit: true
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
