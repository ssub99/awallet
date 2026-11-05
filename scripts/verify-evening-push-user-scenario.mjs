/**
 * 사용자 시나리오 재현: 8시 전 수신함 전환 + 카드 수신 2건 → 푸시 스케줄이 남는가?
 *
 *   node scripts/verify-evening-push-user-scenario.mjs
 *
 * 검증 범위:
 * - 판정(decide) / 트리거(DATE vs DAILY) 분기
 * - cancel-first 후 decision none → OS 예약 공백
 * - React 스냅샷 replaceRecordInboxItems vs store removeById 레이스
 */

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function getTodayAt(hours, minutes, fromMs) {
  const date = new Date(fromMs);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function decideEveningGeneralPush({
  hasExpenseCreatedInWindow,
  recordInboxReceivedCountInWindow,
  pendingRecordInboxCount,
}) {
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

/** setupDailyReminderInternal 의 트리거 선택만 복제 */
function chooseSetupTrigger(nowMs, kind) {
  const today2005 = getTodayAt(20, 5, nowMs);
  if (kind === 'expense_reminder') {
    return { trigger: 'DAILY', hour: 20, minute: 0, firesTodayIfBeforeSlot: nowMs < getTodayAt(20, 0, nowMs).getTime() };
  }
  if (kind === 'sms_inbox_reminder') {
    if (nowMs < today2005.getTime()) {
      return { trigger: 'DATE', dateIso: today2005.toISOString(), day: 'today' };
    }
    return { trigger: 'DAILY', hour: 20, minute: 5, day: 'tomorrow-or-next' };
  }
  return { trigger: 'none' };
}

/**
 * cancel 먼저 → 판정 → 실패/none 이면 예약 0
 * (notification-scheduler setup/reschedule 공통 패턴)
 */
function runCancelFirstSchedule({ nowMs, pending, receivedInWindow, hasExpense, scheduleThrows }) {
  let osScheduled = null;
  // cancel first
  osScheduled = null;

  const decision = decideEveningGeneralPush({
    hasExpenseCreatedInWindow: hasExpense,
    recordInboxReceivedCountInWindow: receivedInWindow,
    pendingRecordInboxCount: pending,
  });
  if (decision.kind === 'none') {
    return { decision: decision.kind, osScheduled, gap: true };
  }
  if (scheduleThrows) {
    return { decision: decision.kind, osScheduled: null, gap: true, error: true };
  }
  osScheduled = chooseSetupTrigger(nowMs, decision.kind);
  return { decision: decision.kind, osScheduled, gap: false };
}

/** 스토어 writeChain + memoryCache 모델 (record-inbox-store writeItems) */
function createStore() {
  let memoryCache = [];
  let writeChain = Promise.resolve();
  const writes = [];

  async function writeItems(items) {
    memoryCache = items.slice();
    const snapshot = items.slice();
    writeChain = writeChain.then(async () => {
      writes.push(snapshot.map((i) => i.id));
    });
    await writeChain;
  }

  async function readItems() {
    return memoryCache.slice();
  }

  return {
    writeItems,
    readItems,
    getIds: () => memoryCache.map((i) => i.id),
    getPersistedWrites: () => writes.slice(),
  };
}

/**
 * 버그 경로: React state 스냅샷으로 replace (quick-input removeRecordInboxItem)
 * 정상 경로: 스토어에서 id만 제거 (removeRecordInboxItemById)
 */
async function raceConvertVsIngest({ useStaleSnapshot }) {
  const store = createStore();
  await store.writeItems([{ id: 'A' }]);

  // UI state 스냅샷 (전환 시작 시점)
  const reactPrev = await store.readItems(); // [A]
  const reactNext = reactPrev.filter((i) => i.id !== 'A'); // []

  // 카드 수신 2건 (전환 write 전에 ingest)
  const current = await store.readItems();
  await store.writeItems([{ id: 'B' }, { id: 'C' }, ...current]); // [B,C,A] or [B,C]

  let scheduledPending = null;
  if (useStaleSnapshot) {
    // 늦은 스냅샷 덮어쓰기
    await store.writeItems(reactNext); // []
    scheduledPending = (await store.readItems()).length;
  } else {
    // store removeById: 현재 큐에서 A만 제거
    const items = await store.readItems();
    await store.writeItems(items.filter((i) => i.id !== 'A'));
    scheduledPending = (await store.readItems()).length;
  }

  const decision = decideEveningGeneralPush({
    hasExpenseCreatedInWindow: true,
    recordInboxReceivedCountInWindow: 3,
    pendingRecordInboxCount: scheduledPending,
  });

  return {
    finalIds: store.getIds(),
    scheduledPending,
    decision: decision.kind,
    wouldScheduleSms: decision.kind === 'sms_inbox_reminder',
  };
}

/**
 * 사용자 시나리오 타임라인 (16:40 KST):
 * 1) 수신함 1건 전환 → expense 생성, 큐 0
 * 2) 카드 수신 2건
 * 3) setup 호출 시점별 예약
 */
function simulateUserTimeline() {
  const nowMs = new Date(2026, 10, 5, 16, 40, 0).getTime(); // Nov 5 16:40 local
  const steps = [];

  // step1: convert only item
  {
    const r = runCancelFirstSchedule({
      nowMs,
      pending: 0,
      receivedInWindow: 1,
      hasExpense: true,
      scheduleThrows: false,
    });
    steps.push({ step: '1-convert-last', ...r });
  }

  // step2: after 2 card receives, setup succeeds
  {
    const r = runCancelFirstSchedule({
      nowMs,
      pending: 2,
      receivedInWindow: 3,
      hasExpense: true,
      scheduleThrows: false,
    });
    steps.push({ step: '2-after-2-receives-ok', ...r });
  }

  // step2b: same but scheduleNotificationAsync throws after cancel
  {
    const r = runCancelFirstSchedule({
      nowMs,
      pending: 2,
      receivedInWindow: 3,
      hasExpense: true,
      scheduleThrows: true,
    });
    steps.push({ step: '2b-after-2-receives-schedule-throws', ...r });
  }

  // step3: exclusive queue — convert none AFTER ingest sms (stale late setup)
  {
    const afterIngest = runCancelFirstSchedule({
      nowMs,
      pending: 2,
      receivedInWindow: 3,
      hasExpense: true,
      scheduleThrows: false,
    });
    const lateConvertSetup = runCancelFirstSchedule({
      nowMs,
      pending: 0, // wiped or stale empty read
      receivedInWindow: 3,
      hasExpense: true,
      scheduleThrows: false,
    });
    steps.push({
      step: '3-late-empty-setup-overwrites-sms',
      afterIngest,
      lateConvertSetup,
      finalGap: lateConvertSetup.gap === true,
    });
  }

  return { nowIso: new Date(nowMs).toString(), steps };
}

async function main() {
  const results = {
    policyBefore20: null,
    userTimeline: null,
    raceStale: null,
    raceStoreRemove: null,
  };

  // A. 8시 전 + pending 2 → 당일 DATE
  const nowBefore20 = new Date(2026, 10, 5, 16, 40, 0).getTime();
  const decision = decideEveningGeneralPush({
    hasExpenseCreatedInWindow: true,
    recordInboxReceivedCountInWindow: 2,
    pendingRecordInboxCount: 2,
  });
  const trigger = chooseSetupTrigger(nowBefore20, decision.kind);
  results.policyBefore20 = { decision, trigger };
  assert(decision.kind === 'sms_inbox_reminder', 'pending2 must be sms');
  assert(trigger.trigger === 'DATE' && trigger.day === 'today', 'before 20:05 must DATE today');
  // 글로벌은 이 조건에서 선택되지 않음
  assert(decision.kind !== 'expense_reminder', 'global suppressed when pending>0');

  // B. 사용자 타임라인
  results.userTimeline = simulateUserTimeline();
  assert(results.userTimeline.steps[0].gap === true, 'convert-last leaves gap (none)');
  assert(results.userTimeline.steps[1].gap === false, 'after 2 receives should schedule');
  assert(results.userTimeline.steps[1].osScheduled.day === 'today', 'should be today DATE');
  assert(results.userTimeline.steps[2].gap === true, 'schedule throw leaves gap');
  assert(results.userTimeline.steps[3].finalGap === true, 'late empty setup wipes sms');

  // C. 레이스
  results.raceStale = await raceConvertVsIngest({ useStaleSnapshot: true });
  results.raceStoreRemove = await raceConvertVsIngest({ useStaleSnapshot: false });
  assert(results.raceStale.finalIds.length === 0, 'stale snapshot wipes B,C');
  assert(results.raceStale.wouldScheduleSms === false, 'stale → no sms schedule');
  assert(results.raceStoreRemove.finalIds.sort().join(',') === 'B,C', 'store remove keeps B,C');
  assert(results.raceStoreRemove.wouldScheduleSms === true, 'store remove → sms');

  // 기존 정책 스크립트도 함께
  console.log(JSON.stringify({ ok: true, results }, null, 2));
  console.log('verify-evening-push-user-scenario: PASS');
  console.log('');
  console.log('FINDINGS:');
  console.log('1) 16:40 + pending2 → 판정 sms + DATE 오늘 20:05 (다음날 분기 아님)');
  console.log('2) pending>0 이면 expense(글로벌) 미선택 — 글로벌 미수신은 정책상 정상');
  console.log('3) cancel-first + decision none / schedule throw → OS 예약 공백 재현됨');
  console.log('4) React 스냅샷 replace 레이스 → 큐 와이프 + sms 미예약 재현됨');
  console.log('5) removeRecordInboxItemById 경로면 B,C 유지 + sms 예약');
}

main().catch((err) => {
  console.error('verify-evening-push-user-scenario: FAIL', err);
  process.exit(1);
});
