/**
 * 문자 SMS 파서 셀프체크 — Notion 원문 샘플 기준.
 */

import {
  extractPerTxnAmount,
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
  restoreSmsSenderFromQueryParam,
} from '../utils/sms-inbox-parse';
import { findCancelMatch } from '../utils/sms-inbox-store';
import type { SmsInboxItem } from '../utils/sms-inbox-types';
import { buildConfirmCardFromSmsFields } from '../utils/sms-inbox-card';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const SHINHAN = `[Web발신]
신한카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

const HYUNDAI_CANCEL = `[Web발신]
[현대카드]-취소
김재*님
872,000원(일시불)
AKPLAZA분당점
누적:1,652,750원`;

const KB_CHECK = `[Web발신]
[KB]04/08 21:27
078501554
주식회사개성
체크카드출금
13,000`;

function main(): void {
  const shinhan = parseSmsInboxBody(SHINHAN, new Date(2026, 8, 14));
  assert(shinhan.kind === 'approval', `shinhan kind: ${shinhan.kind}`);
  if (shinhan.kind === 'approval') {
    assert(shinhan.amount === 44730, `shinhan amount: ${shinhan.amount}`);
    assert(shinhan.month === 9 && shinhan.day === 10, `shinhan date: ${shinhan.month}/${shinhan.day}`);
    assert(shinhan.cardHint === '3757', `shinhan hint: ${shinhan.cardHint}`);
  }

  const cancel = parseSmsInboxBody(HYUNDAI_CANCEL);
  assert(cancel.kind === 'cancel', `cancel kind: ${cancel.kind}`);
  if (cancel.kind === 'cancel') {
    assert(cancel.amount === 872000, `cancel amount: ${cancel.amount}`);
  }

  // 승인취소 → cancel (취소 우선)
  const approveCancel = parseSmsInboxBody('신한카드 승인취소 10,000원 09/10 12:00 테스트');
  assert(approveCancel.kind === 'cancel', `승인취소 must be cancel: ${approveCancel.kind}`);

  const kb = parseSmsInboxBody(KB_CHECK);
  assert(kb.kind === 'approval', `kb kind: ${kb.kind}`);
  if (kb.kind === 'approval') {
    assert(kb.amount === 13000, `kb amount: ${kb.amount}`);
  }

  assert(extractPerTxnAmount('누적 1,234,567원') == null, '누적 only should fail');

  // 단축어가 개행을 붙여 한 줄로 넘기는 신한 포맷 (실기기 flush 샘플)
  const shinhanOneLine =
    '[Web발신] 신한카드(3757)승인 송*섭 5,190원(일시불)09/13 22:21 쿠팡 누적1,476,721원';
  const shinhanFlat = parseSmsInboxBody(shinhanOneLine, new Date(2026, 8, 14));
  assert(shinhanFlat.kind === 'approval', `shinhan one-line kind: ${shinhanFlat.kind}`);
  if (shinhanFlat.kind === 'approval') {
    assert(shinhanFlat.amount === 5190, `shinhan one-line amount: ${shinhanFlat.amount}`);
    assert(shinhanFlat.month === 9 && shinhanFlat.day === 13, 'shinhan one-line date');
  }

  // 삼성/현대 등 한 줄 혼합
  assert(
    extractPerTxnAmount('삼성카드 승인 12,000원 스타벅스 누적:99,000원') === 12000,
    'samsung mixed line',
  );
  assert(
    extractPerTxnAmount('[현대카드]승인 3,500원(일시불) 편의점 잔액50,000원') === 3500,
    'hyundai mixed line',
  );

  assert(
    normalizeSmsSender('+82 1544-7200') === '15447200',
    `norm +82: ${normalizeSmsSender('+82 1544-7200')}`,
  );
  assert(normalizeSmsSender('1544-7200') === '15447200', 'norm local');
  assert(isSenderAllowed('1544-7200', ['+82 1544-7200']), 'allowlist match');
  assert(isSenderAllowed('1544', ['+82 1544-7200']), 'allowlist short sender match');
  assert(!isSenderAllowed('010-9999-0000', ['+82 1544-7200']), 'allowlist reject');

  assert(
    restoreSmsSenderFromQueryParam('82 1544-7200') === '+82 1544-7200',
    'restore + from query space',
  );
  assert(
    restoreSmsSenderFromQueryParam('+82 1544-7200') === '+82 1544-7200',
    'restore keeps existing +',
  );

  const approvalItem: SmsInboxItem = {
    id: '1',
    sender: '1544',
    senderLabels: ['1544'],
    originalBody: 'x',
    rawBody: 'x',
    status: 'approved',
    amount: 872000,
    approvedAt: new Date().toISOString(),
    merchant: 'AKPLAZA분당점',
    createdAt: new Date().toISOString(),
    card: buildConfirmCardFromSmsFields({ amount: 872000, year: 2026, month: 9, day: 14 }),
  };
  if (cancel.kind === 'cancel') {
    const match = findCancelMatch([approvalItem], cancel);
    assert(match?.id === '1', 'cancel match');
  }

  console.log('verify-sms-inbox-parse: ok');
}

main();
