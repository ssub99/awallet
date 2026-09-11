/**
 * 문자 수신함 프론트 목업.
 * 네이티브(단축어 / NotificationListener) 연동 전 UI 검증용.
 */

import type { QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';

export type SmsInboxItem = {
  id: string;
  /** 원문 헤더 수신번호(시안 최대 2슬롯) */
  senderLabels: string[];
  originalBody: string;
  card: QuickInputConfirmCardData;
};

const SAMPLE_BODY =
  '[Web발신]\n신한카드(3757)승인 송*섭\n44,730원(일시불)09/10 21:46 쿠팡\n누적 1,234,567원';

function buildMockCard(amountLabel: string): QuickInputConfirmCardData {
  return {
    recordType: 'expense',
    category: '미정',
    date: '2026년 02월 01일(일)',
    amount: amountLabel,
    paymentType: '신한카드',
    paymentTypeColor: '#1F4E9B',
    memo: '',
    repeatOption1: '안함',
  };
}

/** 시안 배지(10) · 페이저(01/10)에 맞춘 목업 목록 */
export function createSmsInboxMockItems(): SmsInboxItem[] {
  const amounts = [
    '44,730원',
    '12,000원',
    '8,900원',
    '65,000원',
    '3,400원',
    '21,500원',
    '99,000원',
    '7,200원',
    '15,800원',
    '20,000원',
  ];

  return amounts.map((amount, index) => ({
    id: `sms-mock-${index + 1}`,
    senderLabels:
      index === 1
        ? ['+82 1544-7200', '1588-1234']
        : ['+82 1544-7200'],
    originalBody: SAMPLE_BODY.replace('44,730원', amount),
    card: buildMockCard(amount),
  }));
}
