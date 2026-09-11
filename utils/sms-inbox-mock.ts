/**
 * 문자 수신함 프론트 목업.
 * 네이티브(단축어 / NotificationListener) 연동 전 UI 검증용.
 *
 * 적재 규칙 (실데이터와 동일 의도):
 * - 날짜·금액: 원문에서 파싱
 * - 카테고리·메모: 비움 (사용자 선택)
 * - 결제 유형: 신용카드 기본 서브타입
 * - 반복 설정: 안함 (변경 시트에서 정기/할부 적용 가능)
 */

import type { QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';
import { getDayOfWeekLabel } from '@/utils/expense-calculations';
import {
  DEFAULT_PAYMENT_SUBTYPES,
  getDefaultSubtypeIdByMethod,
} from '@/utils/payment-types';

export type SmsInboxItem = {
  id: string;
  /** 원문 헤더 수신번호(시안 최대 2슬롯) */
  senderLabels: string[];
  originalBody: string;
  card: QuickInputConfirmCardData;
};

const MOCK_AMOUNTS = [
  44_730,
  12_000,
  8_900,
  65_000,
  3_400,
  21_500,
  99_000,
  7_200,
  15_800,
  20_000,
] as const;

function formatAmountLabel(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

function formatConfirmCardDate(year: number, month: number, day: number): string {
  const dayLabel = getDayOfWeekLabel(year, month, day);
  return `${year}년 ${month}월 ${day}일(${dayLabel})`;
}

function buildOriginalBody(amount: number, month: number, day: number): string {
  const amountLabel = formatAmountLabel(amount);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return [
    '[Web발신]',
    '신한카드(3757)승인 송*섭',
    `${amountLabel}(일시불)${mm}/${dd} 21:46 쿠팡`,
    '누적 1,234,567원',
  ].join('\n');
}

/** 원문 승인 금액 줄 — `44,730원(일시불)09/10 21:46 …` */
function parseAmountFromOriginal(body: string): number | null {
  const match = body.match(/(?:^|\n)(\d{1,3}(?:,\d{3})*)원(?:\(|$)/m);
  if (!match) {
    return null;
  }
  const amount = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

/** 원문 일시 — `09/10 21:46` (연도 없음 → 기준 연도) */
function parseDateFromOriginal(
  body: string,
  fallbackYear: number,
): { year: number; month: number; day: number } | null {
  const match = body.match(/(\d{1,2})\/(\d{1,2})\s+\d{1,2}:\d{2}/);
  if (!match) {
    return null;
  }
  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const parsed = new Date(fallbackYear, month - 1, day);
  if (
    parsed.getFullYear() !== fallbackYear ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return { year: fallbackYear, month, day };
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

/** 원문 → 기록 카드 (카테고리·메모 제외, 결제=신용카드 기본, 반복=안함) */
export function buildConfirmCardFromSmsOriginal(
  originalBody: string,
  options?: { year?: number },
): QuickInputConfirmCardData {
  const year = options?.year ?? new Date().getFullYear();
  const amount = parseAmountFromOriginal(originalBody) ?? 0;
  const dateParts = parseDateFromOriginal(originalBody, year) ?? {
    year,
    month: 1,
    day: 1,
  };
  const payment = defaultCreditPaymentType();

  return {
    recordType: 'expense',
    category: '',
    date: formatConfirmCardDate(dateParts.year, dateParts.month, dateParts.day),
    amount: formatAmountLabel(amount),
    paymentType: payment.paymentType,
    paymentTypeColor: payment.paymentTypeColor,
    memo: '',
    repeatOption1: '안함',
  };
}

/** 시안 배지(10) · 페이저(01/10)에 맞춘 목업 목록 */
export function createSmsInboxMockItems(): SmsInboxItem[] {
  const year = new Date().getFullYear();

  return MOCK_AMOUNTS.map((amount, index) => {
    // 원문 일시가 카드 날짜가 되도록, 항목마다 날짜를 원문에 심는다 (09/10 → 09/01).
    const day = Math.max(1, 10 - index);
    const month = 9;
    const originalBody = buildOriginalBody(amount, month, day);
    return {
      id: `sms-mock-${index + 1}`,
      // 시안 원문 헤더: 좌측 발신번호 1슬롯. 2슬롯은 실데이터 연동 시 사용.
      senderLabels: ['+82 1544-7200'],
      originalBody,
      card: buildConfirmCardFromSmsOriginal(originalBody, { year }),
    };
  });
}
