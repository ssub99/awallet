/**
 * 문자 수신함 큐 아이템 · 매칭 필드.
 * 취소는 원문 100% 일치가 아니라 이 필드로 미처리 승인을 찾는다.
 */

import type { QuickInputConfirmCardData } from '@/components/ui/quick-input-confirm-card';

/** Amplitude screen_name — 엑셀 세부위치 `sms-history-record` */
export const SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME = '/sms-history-record';

export type SmsInboxStatus = 'approved';

export type SmsInboxItem = {
  id: string;
  /** 원문 헤더 수신번호(시안 최대 2슬롯) */
  senderLabels: string[];
  originalBody: string;
  card: QuickInputConfirmCardData;
  /** allowlist 대조용 발신 원문 */
  sender: string;
  status: SmsInboxStatus;
  amount: number;
  /** ISO 시각 (원문 일시 기준, 시각 없으면 자정) */
  approvedAt: string;
  merchant?: string;
  /** 카드 끝자리 등 힌트 */
  cardHint?: string;
  rawBody: string;
  createdAt: string;
};
