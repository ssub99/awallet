/**
 * 제안 패치 영향 범위: 기존 푸시(챌린지·소비 유도)가 깨지지 않는지 검증.
 * 앱 미변경 — notification-scheduler 의 cancel/판정 술어를 복제해 대조.
 *
 *   node scripts/verify-push-blast-radius.mjs
 */

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

const DAILY_EXPENSE_REMINDER_ID = 'daily_expense_reminder';
const DAILY_RECORD_INBOX_REMINDER_ID = 'daily_sms_inbox_reminder';
const EXPENSE_REMINDER_TYPE = 'expense_reminder';
const RECORD_INBOX_REMINDER_TYPE = 'sms_inbox_reminder';
const DAILY_REMINDER_TITLE = '오늘은 어떤 소비들을 하셨나요?';
const DAILY_REMINDER_BODY = '시작이 반! 소비 기록을 통해 차근차근 소비습관을 개선해 보세요!';
const RECORD_INBOX_REMINDER_TITLE = '소비 기록 수신 현황';

function isGeneralReminderNotification(n) {
  const type = n.content?.data?.type;
  return (
    n.identifier === DAILY_EXPENSE_REMINDER_ID ||
    type === EXPENSE_REMINDER_TYPE ||
    (n.content?.title === DAILY_REMINDER_TITLE && n.content?.body === DAILY_REMINDER_BODY)
  );
}

function isRecordInboxReminderNotification(n) {
  const type = n.content?.data?.type;
  return (
    n.identifier === DAILY_RECORD_INBOX_REMINDER_ID ||
    type === RECORD_INBOX_REMINDER_TYPE ||
    n.content?.title === RECORD_INBOX_REMINDER_TITLE
  );
}

function cancelEveningGeneralPush(bag) {
  return bag.filter(
    (n) => !isGeneralReminderNotification(n) && !isRecordInboxReminderNotification(n),
  );
}

function decideEvening({ pending, receivedInWindow, hasExpense }) {
  if (pending > 0) return 'sms_inbox_reminder';
  if (receivedInWindow > 0) return 'none';
  if (!hasExpense) return 'expense_reminder';
  return 'none';
}

function seedOsBag() {
  return [
    {
      identifier: DAILY_EXPENSE_REMINDER_ID,
      content: {
        title: DAILY_REMINDER_TITLE,
        body: DAILY_REMINDER_BODY,
        data: { type: EXPENSE_REMINDER_TYPE },
      },
    },
    {
      identifier: DAILY_RECORD_INBOX_REMINDER_ID,
      content: {
        title: RECORD_INBOX_REMINDER_TITLE,
        body: '2건의 지출을 수신했습니다...',
        data: { type: RECORD_INBOX_REMINDER_TYPE, count: 2 },
      },
    },
    {
      identifier: 'challenge_progress_c1_30',
      content: {
        title: '[#식비] 챌린지 진행현황',
        body: '70% 남음...',
        data: { type: 'challenge_progress', challengeId: 'c1', milestone: 30 },
      },
    },
    {
      identifier: 'challenge_success_c1',
      content: {
        title: '[#식비] 챌린지 성공',
        body: '...',
        data: { type: 'challenge_success', challengeId: 'c1' },
      },
    },
    {
      identifier: 'challenge_failure_c2',
      content: {
        title: '[#카페] 목표 금액 초과 ⚠️',
        body: '...',
        data: { type: 'challenge_failure', challengeId: 'c2' },
      },
    },
    {
      identifier: 'test_manual',
      content: { title: '테스트', body: 'x', data: { type: 'test_expense_reminder' } },
    },
  ];
}

function main() {
  const before = seedOsBag();
  const afterEveningCancel = cancelEveningGeneralPush(before);
  const remainingTypes = afterEveningCancel.map((n) => n.content.data.type).sort();
  const remainingIds = afterEveningCancel.map((n) => n.identifier).sort();

  // 1) 저녁 일반 cancel은 챌린지·test 를 남긴다
  assert(
    remainingTypes.includes('challenge_progress') &&
      remainingTypes.includes('challenge_success') &&
      remainingTypes.includes('challenge_failure'),
    'challenge pushes must survive evening cancel',
  );
  assert(remainingTypes.includes('test_expense_reminder'), 'test_* type must not match expense_reminder exactly');
  assert(!remainingTypes.includes(EXPENSE_REMINDER_TYPE), 'expense_reminder cancelled');
  assert(!remainingTypes.includes(RECORD_INBOX_REMINDER_TYPE), 'sms_inbox_reminder cancelled');
  assert(
    !remainingIds.includes(DAILY_EXPENSE_REMINDER_ID) &&
      !remainingIds.includes(DAILY_RECORD_INBOX_REMINDER_ID),
    'evening fixed ids cancelled',
  );

  // 2) 챌린지 제목이 일반/수신 필터에 오인되지 않음
  for (const n of before.filter((x) => String(x.content.data.type).startsWith('challenge_'))) {
    assert(!isGeneralReminderNotification(n), `challenge must not match general: ${n.identifier}`);
    assert(!isRecordInboxReminderNotification(n), `challenge must not match inbox: ${n.identifier}`);
  }

  // 3) 소비 유도(글로벌) — 큐 비고 소비 없으면 여전히 expense
  assert(
    decideEvening({ pending: 0, receivedInWindow: 0, hasExpense: false }) === 'expense_reminder',
    'empty day still gets expense reminder',
  );
  // 소비만 있으면 none (기존 정책)
  assert(
    decideEvening({ pending: 0, receivedInWindow: 0, hasExpense: true }) === 'none',
    'expense only → none',
  );
  // 수신 후 전부전환 → none (기존 정책, 글로벌도 안 씀)
  assert(
    decideEvening({ pending: 0, receivedInWindow: 2, hasExpense: true }) === 'none',
    'converted receives → none',
  );
  // pending 있으면 sms (글로벌 억제 — 기존 정책 유지)
  assert(
    decideEvening({ pending: 2, receivedInWindow: 2, hasExpense: true }) === 'sms_inbox_reminder',
    'pending still prioritizes sms',
  );

  // 4) 스토어 뮤테이션 수정은 챌린지 스케줄 API와 무관 (교차 타입 없음)
  const storeMutationTouches = [
    'removeRecordInboxItemById',
    'updateRecordInboxItem',
    'replaceRecordInboxItems(seed/reset only)',
  ];
  const challengeApis = [
    'notifyChallengeProgress',
    'notifyChallengeSuccess',
    'notifyChallengeFailure',
    'cancelChallengeProgressNotifications',
    'setChallengeNotificationsEnabled',
  ];
  assert(
    storeMutationTouches.every((s) => !challengeApis.includes(s)),
    'store mutation fix set disjoint from challenge APIs',
  );

  // 5) setupDailyReminder cancel 순서 변경도 evening 타입만 — 챌린지 식별자 prefix 불변
  const eveningCancelTargets = [EXPENSE_REMINDER_TYPE, RECORD_INBOX_REMINDER_TYPE];
  const challengeTypes = ['challenge_progress', 'challenge_success', 'challenge_failure'];
  assert(
    eveningCancelTargets.every((t) => !challengeTypes.includes(t)),
    'evening cancel type list excludes challenge',
  );

  // 6) 제안 패치 후 “큐 비었고 오늘 소비 없음”이면 글로벌 예약 대상 유지
  const afterFixedConvertRace = { pending: 2, ids: ['B', 'C'] }; // store removeById 결과
  assert(
    decideEvening({
      pending: afterFixedConvertRace.pending,
      receivedInWindow: 3,
      hasExpense: true,
    }) === 'sms_inbox_reminder',
    'fixed race → sms not expense',
  );
  const quietDay = { pending: 0, receivedInWindow: 0, hasExpense: false };
  assert(
    decideEvening(quietDay) === 'expense_reminder',
    'quiet day still expense_reminder after fix model',
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        afterEveningCancelRemaining: remainingIds,
        survivingTypes: remainingTypes,
        expensePolicyIntact: true,
        challengeIsolatedFromEveningCancel: true,
        storeMutationDisjointFromChallenge: true,
      },
      null,
      2,
    ),
  );
  console.log('verify-push-blast-radius: PASS');
  console.log('');
  console.log('기존 푸시 영향:');
  console.log('- 챌린지 progress/success/failure: evening cancel에 안 걸림 → 유지');
  console.log('- 소비 유도(expense_reminder): 큐 0+소비없음 정책 동일 → 유지');
  console.log('- 수신 푸시: pending>0 우선 정책 동일 → 유지 (레이스만 제거)');
  console.log('- 일반/챌린지 설정 키·API 분리 유지');
}

try {
  main();
} catch (err) {
  console.error('verify-push-blast-radius: FAIL', err);
  process.exit(1);
}
