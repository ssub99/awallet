/**
 * evening-general-push-policy 판정 셀프체크.
 *   node scripts/verify-evening-general-push-policy.mjs
 * utils/evening-general-push-policy.ts 와 동일 이름·판정.
 */

function getJudgmentWindowEndingAt(endMs) {
  const end = new Date(endMs);
  end.setSeconds(0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

function getJudgmentWindowForNow(nowMs) {
  const now = new Date(nowMs);
  const today20 = new Date(now);
  today20.setHours(20, 0, 0, 0);
  if (nowMs < today20.getTime()) {
    return getJudgmentWindowEndingAt(today20.getTime());
  }
  const tomorrow20 = new Date(today20);
  tomorrow20.setDate(tomorrow20.getDate() + 1);
  return getJudgmentWindowEndingAt(tomorrow20.getTime());
}

function getClosedJudgmentWindowForRecordInboxBuffer(nowMs) {
  const now = new Date(nowMs);
  const today20 = new Date(now);
  today20.setHours(20, 0, 0, 0);
  const today2005 = new Date(now);
  today2005.setHours(20, 5, 0, 0);
  if (nowMs < today20.getTime() || nowMs >= today2005.getTime()) {
    return null;
  }
  return getJudgmentWindowEndingAt(today20.getTime());
}

function decideEveningGeneralPush(input) {
  const { hasExpenseCreatedInWindow, recordInboxReceivedCountInWindow, pendingRecordInboxCount } =
    input;
  if (pendingRecordInboxCount > 0) {
    return { kind: 'sms_inbox_reminder', recordInboxCount: pendingRecordInboxCount };
  }
  if (recordInboxReceivedCountInWindow > 0) {
    return { kind: 'none', recordInboxCount: 0 };
  }
  if (!hasExpenseCreatedInWindow) {
    return { kind: 'expense_reminder', recordInboxCount: 0 };
  }
  return { kind: 'none', recordInboxCount: 0 };
}

function buildRecordInboxReminderBody(count) {
  const n = Math.max(0, Math.floor(count));
  return `${n}건의 지출을 수신했습니다. 기록으로 생성하여 소비 흐름을 관리해 보세요.`;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const end = new Date('2026-09-24T20:00:00+09:00').getTime();
const window = getJudgmentWindowEndingAt(end);
assert(window.endMs === end, 'endMs should match');
assert(
  window.startMs === new Date('2026-09-23T20:00:00+09:00').getTime(),
  'start should be previous day 20:00',
);

const before8 = new Date('2026-09-24T15:00:00+09:00').getTime();
assert(getJudgmentWindowForNow(before8).endMs === end, 'before 20:00 window');

const after8 = new Date('2026-09-24T20:30:00+09:00').getTime();
assert(getJudgmentWindowForNow(after8).startMs === end, 'after 20:00 window');

const buffer = getClosedJudgmentWindowForRecordInboxBuffer(
  new Date('2026-09-24T20:02:00+09:00').getTime(),
);
assert(buffer != null && buffer.endMs === end, '20:02 closed window');
assert(getClosedJudgmentWindowForRecordInboxBuffer(before8) == null, 'no buffer before 20');

assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: false,
    recordInboxReceivedCountInWindow: 0,
    pendingRecordInboxCount: 0,
  }).kind === 'expense_reminder',
  'empty',
);
assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: false,
    recordInboxReceivedCountInWindow: 2,
    pendingRecordInboxCount: 2,
  }).kind === 'sms_inbox_reminder',
  'record-inbox',
);
assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: true,
    recordInboxReceivedCountInWindow: 2,
    pendingRecordInboxCount: 0,
  }).kind === 'none',
  'converted',
);
assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: true,
    recordInboxReceivedCountInWindow: 1,
    pendingRecordInboxCount: 1,
  }).kind === 'sms_inbox_reminder',
  'expense+record-inbox',
);
// 큐에 어제 잔여만 남아도 (구간 수신 0) 가기록 푸시
assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: false,
    recordInboxReceivedCountInWindow: 0,
    pendingRecordInboxCount: 3,
  }).kind === 'sms_inbox_reminder',
  'stale-queue-only',
);
assert(
  decideEveningGeneralPush({
    nowMs: before8,
    hasExpenseCreatedInWindow: false,
    recordInboxReceivedCountInWindow: 0,
    pendingRecordInboxCount: 3,
  }).recordInboxCount === 3,
  'stale-queue-count',
);
assert(
  buildRecordInboxReminderBody(3) ===
    '3건의 지출을 수신했습니다. 기록으로 생성하여 소비 흐름을 관리해 보세요.',
  'body',
);

console.log('verify-evening-general-push-policy: ok');
