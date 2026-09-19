/**
 * 문자 SMS 파서 셀프체크 — 가명(에이월렛카드) 픽스처.
 * 카드사명은 파서에 쓰이지 않음. 승인/취소·금액·날짜 패턴만 검증.
 */

import {
  extractPerTxnAmount,
  formatSmsSenderDisplay,
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

const APPROVAL_MULTILINE = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

const CANCEL_BRACKET = `[Web발신]
[에이월렛카드]-취소
김재*님
872,000원(일시불)
AKPLAZA분당점
누적:1,652,750원`;

const CHECK_WITHDRAW = `[Web발신]
[AW]04/08 21:27
078501554
주식회사개성
체크카드출금
13,000`;

function main(): void {
  const approval = parseSmsInboxBody(APPROVAL_MULTILINE, new Date(2026, 8, 14));
  assert(approval.kind === 'approval', `approval kind: ${approval.kind}`);
  if (approval.kind === 'approval') {
    assert(approval.amount === 44730, `approval amount: ${approval.amount}`);
    assert(approval.month === 9 && approval.day === 10, `approval date: ${approval.month}/${approval.day}`);
    assert(approval.cardHint === '3757', `approval hint: ${approval.cardHint}`);
  }

  const cancel = parseSmsInboxBody(CANCEL_BRACKET);
  assert(cancel.kind === 'cancel', `cancel kind: ${cancel.kind}`);
  if (cancel.kind === 'cancel') {
    assert(cancel.amount === 872000, `cancel amount: ${cancel.amount}`);
  }

  // 승인취소 → cancel (취소 우선)
  const approveCancel = parseSmsInboxBody('에이월렛카드 승인취소 10,000원 09/10 12:00 테스트');
  assert(approveCancel.kind === 'cancel', `승인취소 must be cancel: ${approveCancel.kind}`);

  const check = parseSmsInboxBody(CHECK_WITHDRAW);
  assert(check.kind === 'approval', `check kind: ${check.kind}`);
  if (check.kind === 'approval') {
    assert(check.amount === 13000, `check amount: ${check.amount}`);
  }

  assert(extractPerTxnAmount('누적 1,234,567원') == null, '누적 only should fail');

  // 단축어가 개행을 붙여 한 줄로 넘기는 포맷
  const approvalOneLine =
    '[Web발신] 에이월렛카드(3757)승인 송*섭 5,190원(일시불)09/13 22:21 쿠팡 누적1,476,721원';
  const approvalFlat = parseSmsInboxBody(approvalOneLine, new Date(2026, 8, 14));
  assert(approvalFlat.kind === 'approval', `one-line kind: ${approvalFlat.kind}`);
  if (approvalFlat.kind === 'approval') {
    assert(approvalFlat.amount === 5190, `one-line amount: ${approvalFlat.amount}`);
    assert(approvalFlat.month === 9 && approvalFlat.day === 13, 'one-line date');
  }

  // 한 줄 혼합 (누적·잔액 스킵)
  assert(
    extractPerTxnAmount('에이월렛카드 승인 12,000원 스타벅스 누적:99,000원') === 12000,
    'mixed line with 누적',
  );
  assert(
    extractPerTxnAmount('[에이월렛카드]승인 3,500원(일시불) 편의점 잔액50,000원') === 3500,
    'mixed line with 잔액',
  );

  // 해외원화 — KRW 코드 (승인·취소 공통). `…원` 없을 때.
  const overseasKrw = `[Web발신]
에이월렛카드(3757)해외승인 송*섭 KRW 5,292        (IE)09/10 16:05 FACEBK *V7 누적1,455,351원`;
  const overseas = parseSmsInboxBody(overseasKrw, new Date(2026, 8, 14));
  assert(overseas.kind === 'approval', `overseas KRW kind: ${overseas.kind}`);
  if (overseas.kind === 'approval') {
    assert(overseas.amount === 5292, `overseas KRW amount: ${overseas.amount}`);
    assert(overseas.month === 9 && overseas.day === 10, 'overseas KRW date');
    assert(overseas.cardHint === '3757', 'overseas KRW cardHint');
  }
  assert(extractPerTxnAmount('해외승인 KRW 5,292.00 FACEBK') === 5292, 'KRW with decimals');
  assert(extractPerTxnAmount('해외취소 KRW5,292 (US)') === 5292, 'KRW no space');

  const overseasCancel = parseSmsInboxBody(
    '[Web발신]\n에이월렛카드(3757)해외취소 송*섭 KRW 5,292.00 09/10 16:10 FACEBK *V7',
    new Date(2026, 8, 14),
  );
  assert(overseasCancel.kind === 'cancel', `overseas cancel kind: ${overseasCancel.kind}`);
  if (overseasCancel.kind === 'cancel') {
    assert(overseasCancel.amount === 5292, `overseas cancel amount: ${overseasCancel.amount}`);
  }

  // 외화만 — 환산 없음 → 금액 없음
  assert(extractPerTxnAmount('해외승인 USD 12.34 FACEBK') == null, 'USD only no amount');
  assert(
    parseSmsInboxBody('에이월렛카드 해외승인 USD 12.34 09/10 16:05 X').kind === 'ignore',
    'USD only ignore',
  );

  assert(
    normalizeSmsSender('+82 1544-7200') === '15447200',
    `norm +82: ${normalizeSmsSender('+82 1544-7200')}`,
  );
  assert(normalizeSmsSender('1544-7200') === '15447200', 'norm local');
  assert(isSenderAllowed('1544-7200', ['+82 1544-7200']), 'allowlist match');
  assert(isSenderAllowed('1544', ['+82 1544-7200']), 'allowlist short sender match');
  assert(!isSenderAllowed('010-9999-0000', ['+82 1544-7200']), 'allowlist reject');

  assert(formatSmsSenderDisplay('01074565658') === '+82 10-7456-5658', 'display mobile');
  assert(formatSmsSenderDisplay('15447200') === '+82 1544-7200', 'display short');
  assert(formatSmsSenderDisplay('+82 1544-7200') === '+82 1544-7200', 'display keeps +82');
  assert(formatSmsSenderDisplay('') === '발신번호 없음', 'display empty');

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
