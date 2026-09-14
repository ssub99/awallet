/**
 * 문자 수신함 프론트 목업 (UI·스크립트 검증용).
 * 실데이터는 sms-inbox-store / ingest 경로.
 */

import { buildConfirmCardFromSmsFields, formatSmsAmountLabel } from '@/utils/sms-inbox-card';
import type { SmsInboxItem } from '@/utils/sms-inbox-types';

export type { SmsInboxItem } from '@/utils/sms-inbox-types';
export { buildConfirmCardFromSmsFields as buildConfirmCardFromSmsOriginal } from '@/utils/sms-inbox-card';

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

function buildOriginalBody(amount: number, month: number, day: number): string {
  const amountLabel = formatSmsAmountLabel(amount);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return [
    '[Web발신]',
    '신한카드(3757)승인 송*섭',
    `${amountLabel}(일시불)${mm}/${dd} 21:46 쿠팡`,
    '누적 1,234,567원',
  ].join('\n');
}

/** 시안 배지(10) · 페이저(01/10)에 맞춘 목업 목록 */
export function createSmsInboxMockItems(): SmsInboxItem[] {
  const year = new Date().getFullYear();
  const createdAt = new Date().toISOString();

  return MOCK_AMOUNTS.map((amount, index) => {
    const day = Math.max(1, 10 - index);
    const month = 9;
    const originalBody = buildOriginalBody(amount, month, day);
    const approvedAt = new Date(year, month - 1, day, 21, 46).toISOString();
    return {
      id: `sms-mock-${index + 1}`,
      senderLabels: ['+82 1544-7200'],
      sender: '+82 1544-7200',
      originalBody,
      rawBody: originalBody,
      status: 'approved' as const,
      amount,
      approvedAt,
      merchant: '쿠팡',
      cardHint: '3757',
      createdAt,
      card: buildConfirmCardFromSmsFields({ amount, year, month, day }),
    };
  });
}
