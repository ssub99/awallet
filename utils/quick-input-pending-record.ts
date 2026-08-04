import type { PaymentMethod } from '@/utils/expenses';
import type { PaymentSubtype } from '@/utils/payment-types';

/** parse-expense / 간편입력 확인 카드·기록 생성용 pending 기록 */
export interface QuickInputPendingRecord {
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

export interface QuickInputExpenseDraftSeed {
  category: string;
  date: string;
  amount: number;
  memo: string;
  paymentMethod: 'credit' | 'debit' | 'cash';
  paymentSubtypeId?: string;
  isRecurring: boolean;
  isInstallment: boolean;
  recurringType: string;
  totalMonths: number;
  weekendOption: 'weekend' | 'friday' | 'monday';
}

export interface QuickInputIncomeDraftSeed {
  category: string;
  date: string;
  amount: number;
  memo: string;
}

export function pendingToExpenseDraftSeed(pending: QuickInputPendingRecord): QuickInputExpenseDraftSeed {
  return {
    category: pending.category ?? '',
    date: pending.date.replace(/-/g, '.'),
    amount: pending.amount,
    memo: pending.memo ?? '',
    paymentMethod: pending.paymentMethod ?? 'credit',
    paymentSubtypeId: pending.paymentSubtypeId,
    isRecurring: pending.isRecurring === true,
    isInstallment: pending.isInstallment === true,
    recurringType: pending.recurringType ?? '매월',
    totalMonths: pending.totalMonths ?? 2,
    weekendOption: pending.weekendOption ?? 'weekend',
  };
}

export function pendingToIncomeDraftSeed(pending: QuickInputPendingRecord): QuickInputIncomeDraftSeed {
  return {
    category: pending.category ?? '',
    date: pending.date.replace(/-/g, '.'),
    amount: pending.amount,
    memo: pending.memo ?? '',
  };
}

export function expenseFormToQuickInputPending(params: {
  category: string;
  actualDate: string;
  expenseAmount: number;
  memo: string;
  paymentMethod: PaymentMethod;
  selectedPaymentSubtype: PaymentSubtype | undefined;
  isRecurring: boolean;
  isInstallment: boolean;
  recurringType: string;
  totalMonths: number;
  weekendOption: 'weekend' | 'friday' | 'monday';
}): QuickInputPendingRecord {
  const isCash = params.paymentMethod === 'cash';
  return {
    recordType: 'expense',
    category: params.category,
    date: params.actualDate,
    amount: params.expenseAmount,
    paymentMethod: params.paymentMethod,
    paymentSubtypeId: isCash ? undefined : params.selectedPaymentSubtype?.id,
    paymentSubtypeLabel: isCash ? undefined : params.selectedPaymentSubtype?.label,
    paymentSubtypeColor: isCash ? undefined : params.selectedPaymentSubtype?.color,
    memo: params.memo.trim() ? params.memo : undefined,
    isRecurring: params.isRecurring ? true : undefined,
    isInstallment: params.isInstallment ? true : undefined,
    recurringType: params.isRecurring ? params.recurringType : undefined,
    totalMonths: params.isRecurring || params.isInstallment ? params.totalMonths : undefined,
    weekendOption:
      params.isRecurring || params.isInstallment ? params.weekendOption : undefined,
  };
}

export function incomeFormToQuickInputPending(params: {
  category: string;
  date: string;
  incomeAmount: number;
  memo: string;
}): QuickInputPendingRecord {
  const normalizedDate = params.date.replace(/-/g, '.');
  return {
    recordType: 'income',
    category: params.category,
    date: normalizedDate,
    amount: params.incomeAmount,
    memo: params.memo.trim() ? params.memo : undefined,
  };
}
