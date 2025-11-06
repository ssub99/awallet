/**
 * Expense Validation Utilities
 * 
 * 정기 기록과 할부 기록의 검증 로직을 통합 관리
 */

export interface ValidationResult {
  isValid: boolean;
  message?: string;
  showAlert?: boolean;
  showToast?: boolean;
}

/**
 * 기록 수정 가능 여부를 확인합니다
 */
export function validateRecordEditability(record: any, mode: 'create' | 'edit'): ValidationResult {
  if (mode === 'create') {
    return { isValid: true };
  }
  
  if (record.isRecurring) {
    return {
      isValid: false,
      message: '정기 지출로 생성된 내역은 해제할 수 없습니다.',
      showToast: true
    };
  }
  
  return { isValid: true };
}

/**
 * 카테고리 변경 가능 여부를 확인합니다
 */
export function validateCategoryChange(record: any, mode: 'create' | 'edit'): ValidationResult {
  if (mode === 'create') {
    return { isValid: true };
  }
  
  if (record.isRecurring) {
    return {
      isValid: false,
      message: '변경할 수 없습니다. 새로 생성해 주세요.',
      showToast: true
    };
  }
  
  return { isValid: true };
}

/**
 * 금액 변경 가능 여부를 확인합니다
 */
export function validateAmountChange(record: any, mode: 'create' | 'edit'): ValidationResult {
  if (mode === 'create') {
    return { isValid: true };
  }
  
  if (record.isRecurring) {
    return {
      isValid: false,
      message: '변경할 수 없습니다. 새로 생성해 주세요.',
      showToast: true
    };
  }
  
  return { isValid: true };
}

/**
 * 할부 설정 변경 가능 여부를 확인합니다
 */
export function validateInstallmentChange(record: any, mode: 'create' | 'edit'): ValidationResult {
  if (mode === 'create') {
    return { isValid: true };
  }
  
  if (record.isRecurring) {
    return {
      isValid: false,
      message: '변경할 수 없습니다. 새로 생성해 주세요.',
      showToast: true
    };
  }
  
  return { isValid: true };
}

/**
 * 개월수 변경 가능 여부를 확인합니다
 */
export function validateMonthsChange(record: any, mode: 'create' | 'edit'): ValidationResult {
  if (mode === 'create') {
    return { isValid: true };
  }
  
  if (record.isRecurring) {
    return {
      isValid: false,
      message: '변경할 수 없습니다. 새로 생성해 주세요.',
      showToast: true
    };
  }
  
  return { isValid: true };
}

/**
 * 필수 입력값 검증
 */
export function validateRequiredFields(category: string, amount: string): ValidationResult {
  if (!category) {
    return {
      isValid: false,
      message: '카테고리를 선택해 주세요.',
      showAlert: true
    };
  }
  
  if (!amount || amount === '0' || amount.trim() === '') {
    return {
      isValid: false,
      message: '금액을 입력해 주세요.',
      showAlert: true
    };
  }
  
  return { isValid: true };
}

/**
 * 변경사항 존재 여부를 확인합니다
 */
export function hasChanges(
  currentData: any,
  originalData: any,
  mode: 'create' | 'edit'
): boolean {
  if (mode !== 'edit' || !originalData) {
    return true; // 새로 생성하는 경우는 항상 변경사항이 있음
  }

  const currentAmount = parseFloat(currentData.amount?.replace(/,/g, '') || '0');
  const originalAmount = parseFloat(originalData.amount?.toString() || '0');
  
  const currentDate = currentData.date;
  const originalDate = originalData.date ? originalData.date.replace(/-/g, '.') : '';
  
  return (
    currentData.category !== originalData.category ||
    currentAmount !== originalAmount ||
    currentDate !== originalDate ||
    currentData.memo !== (originalData.memo || '') ||
    currentData.isRecurring !== (originalData.isRecurring || false) ||
    currentData.totalMonths !== (originalData.totalMonths || 2) ||
    currentData.isInstallment !== (originalData.isInstallment || false) ||
    currentData.weekendOption !== (originalData.weekendOption || 'weekend')
  );
}

/**
 * 주말 날짜 확인
 */
export function isWeekendDate(dateString: string): boolean {
  const parts = dateString.split('.');
  if (parts.length !== 3) return false;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  
  const dateObj = new Date(year, month, day);
  const dayOfWeek = dateObj.getDay();
  
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
}

/**
 * 정기 지출 주말 확인 모달 표시 여부
 */
export function shouldShowWeekendConfirm(
  isRecurring: boolean,
  date: string,
  weekendOption: string
): boolean {
  return isRecurring && isWeekendDate(date) && weekendOption !== 'weekend';
}
