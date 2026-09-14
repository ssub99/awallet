/**
 * 문자 원문 → 간편생성 기록 카드 필드.
 * 카테고리·메모 공란, 결제=신용카드 기본, 반복=안함.
 */

import type { QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';
import { getDayOfWeekLabel } from '@/utils/expense-calculations';
import {
  DEFAULT_PAYMENT_SUBTYPES,
  getDefaultSubtypeIdByMethod,
} from '@/utils/payment-types';

export function formatSmsAmountLabel(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function formatSmsConfirmCardDate(year: number, month: number, day: number): string {
  const dayLabel = getDayOfWeekLabel(year, month, day);
  return `${year}년 ${month}월 ${day}일(${dayLabel})`;
}

function defaultCreditPaymentType(): Pick<
  QuickInputConfirmCardData,
  'paymentType' | 'paymentTypeColor' | 'paymentTypeEmoji'
> {
  const creditDefault =
    DEFAULT_PAYMENT_SUBTYPES.find(
      (item) => item.id === getDefaultSubtypeIdByMethod('credit', DEFAULT_PAYMENT_SUBTYPES),
    ) ?? DEFAULT_PAYMENT_SUBTYPES[0];
  return {
    paymentType: creditDefault.label,
    paymentTypeColor: creditDefault.color,
    paymentTypeEmoji: undefined,
  };
}

/** 원문 파싱 결과로 카드 생성 (금액·날짜는 호출측에서 확정) */
export function buildConfirmCardFromSmsFields(fields: {
  amount: number;
  year: number;
  month: number;
  day: number;
}): QuickInputConfirmCardData {
  const payment = defaultCreditPaymentType();
  return {
    recordType: 'expense',
    category: '',
    date: formatSmsConfirmCardDate(fields.year, fields.month, fields.day),
    amount: formatSmsAmountLabel(fields.amount),
    paymentType: payment.paymentType,
    paymentTypeColor: payment.paymentTypeColor,
    memo: '',
    repeatOption1: '안함',
  };
}
