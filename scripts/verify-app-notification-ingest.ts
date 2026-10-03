/**
 * iOS 알림 수신함 경로 셀프체크 — Intent가 제목+본문을 합친 문구가 파싱되는지.
 *
 *   npx tsx scripts/verify-app-notification-ingest.ts
 */

import { parseSmsInboxBody } from '../utils/sms-inbox-parse';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** IngestAppNotificationIntent.perform 미러 */
function combine(title: string, body: string): string {
  return [title, body]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

// 키워드는 제목, 금액은 본문에 나뉘어 와도 합친 뒤 파싱
const approval = parseSmsInboxBody(combine('신한카드 승인', '12,000원 스타벅스 강남점'));
assert(approval.kind === 'approval' && approval.amount === 12000, 'push approval');
const cancel = parseSmsInboxBody(combine('결제 취소 안내', '12,000원 스타벅스'));
assert(cancel.kind === 'cancel' && cancel.amount === 12000, 'push cancel');
const bodyOnly = parseSmsInboxBody(combine('', '체크카드출금 8,500원 편의점'));
assert(bodyOnly.kind === 'approval' && bodyOnly.amount === 8500, 'body only');
const marketing = parseSmsInboxBody(combine('혜택 안내', '이번 달 5,000원 쿠폰을 확인하세요'));
assert(marketing.kind === 'ignore', 'marketing push ignored');

console.log('verify-app-notification-ingest: ok');
