/**
 * 근본 수정 모델 사전 검증 (앱 코드 미변경).
 * 현재: React 스냅샷 → replace 전체 교체
 * 제안: 스토어 read-modify-write (removeById / updateById)만 persist
 *
 *   node scripts/verify-record-inbox-store-mutation-model.mjs
 */

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function decide({ pending, receivedInWindow, hasExpense }) {
  if (pending > 0) return 'sms_inbox_reminder';
  if (receivedInWindow > 0) return 'none';
  if (!hasExpense) return 'expense_reminder';
  return 'none';
}

/** record-inbox-store writeItems 모델 */
function createStore() {
  let memoryCache = [];
  let writeChain = Promise.resolve();

  async function writeItems(items) {
    memoryCache = items.map((i) => ({ ...i }));
    const snap = memoryCache;
    writeChain = writeChain.then(async () => {
      // persist order only; memoryCache already eager
      void snap;
    });
    await writeChain;
  }

  async function readItems() {
    return memoryCache.map((i) => ({ ...i }));
  }

  async function ingestAppend(id) {
    const items = await readItems();
    await writeItems([{ id, category: '미정' }, ...items]);
  }

  /** 현재(버그) 경로: UI 스냅샷 전체 교체 */
  async function uiSnapshotReplace(nextFromReactPrev) {
    await writeItems(nextFromReactPrev);
  }

  /** 제안 경로: id만 제거 */
  async function storeRemoveById(id) {
    const items = await readItems();
    await writeItems(items.filter((i) => i.id !== id));
  }

  /** 제안 경로: id 필드만 패치 */
  async function storeUpdateById(id, patch) {
    const items = await readItems();
    await writeItems(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  return {
    readItems,
    ingestAppend,
    uiSnapshotReplace,
    storeRemoveById,
    storeUpdateById,
    ids: async () => (await readItems()).map((i) => i.id).sort(),
  };
}

async function scenarioConvertVsIngest({ mode }) {
  const store = createStore();
  await store.uiSnapshotReplace([{ id: 'A', category: '미정' }]);

  // UI가 전환 시작 시 본 스냅샷
  const reactPrev = await store.readItems(); // [A]
  const reactNextAfterConvert = reactPrev.filter((i) => i.id !== 'A'); // []

  // 전환 persist 전에 카드 2건 수신
  await store.ingestAppend('B');
  await store.ingestAppend('C');

  if (mode === 'current') {
    await store.uiSnapshotReplace(reactNextAfterConvert);
  } else {
    await store.storeRemoveById('A');
  }

  const ids = await store.ids();
  const pending = ids.length;
  const kind = decide({ pending, receivedInWindow: 3, hasExpense: true });
  return { ids, pending, kind, wouldSms: kind === 'sms_inbox_reminder' };
}

async function scenarioCategoryPatchVsIngest({ mode }) {
  const store = createStore();
  await store.uiSnapshotReplace([
    { id: 'A', category: '미정' },
    { id: 'B', category: '미정' },
  ]);

  const reactPrev = await store.readItems();
  const reactNextPatched = reactPrev.map((i) =>
    i.id === 'A' ? { ...i, category: '식비' } : i,
  );

  await store.ingestAppend('C');

  if (mode === 'current') {
    await store.uiSnapshotReplace(reactNextPatched); // C 유실
  } else {
    await store.storeUpdateById('A', { category: '식비' });
  }

  const items = await store.readItems();
  const ids = items.map((i) => i.id).sort();
  const a = items.find((i) => i.id === 'A');
  return {
    ids,
    categoryA: a?.category,
    keptC: ids.includes('C'),
    wouldSms: decide({ pending: ids.length, receivedInWindow: 3, hasExpense: false }) === 'sms_inbox_reminder',
  };
}

async function scenarioEditCardVsIngest({ mode }) {
  const store = createStore();
  await store.uiSnapshotReplace([{ id: 'A', category: '카페', amount: 1000 }]);

  const reactPrev = await store.readItems();
  const reactNext = reactPrev.map((i) =>
    i.id === 'A' ? { ...i, amount: 2500 } : i,
  );

  await store.ingestAppend('B');
  await store.ingestAppend('C');

  if (mode === 'current') {
    await store.uiSnapshotReplace(reactNext);
  } else {
    await store.storeUpdateById('A', { amount: 2500 });
  }

  const items = await store.readItems();
  const ids = items.map((i) => i.id).sort();
  const a = items.find((i) => i.id === 'A');
  return {
    ids,
    amountA: a?.amount,
    keptBC: ids.includes('B') && ids.includes('C'),
    wouldSms: decide({ pending: ids.length, receivedInWindow: 3, hasExpense: false }) === 'sms_inbox_reminder',
  };
}

/** 판정 후 cancel 교체 vs 권한 실패 전 cancel */
function scenarioScheduleCancelOrder() {
  // current: cancel → generalOk false → 공백 (기존 sms 날아감)
  const current = (() => {
    let os = 'sms_DATE_today';
    os = null; // cancel first
    const generalOk = false;
    if (!generalOk) return { os, gap: true };
    return { os, gap: false };
  })();

  // proposed: generalOk false 일 때만 cancel. true면 판정 후 교체
  const proposedPermOff = (() => {
    let os = 'sms_DATE_today';
    const generalOk = false;
    if (!generalOk) {
      os = null;
      return { os, gap: true, intentional: true };
    }
    return { os, gap: false };
  })();

  const proposedPermOnPending2 = (() => {
    let os = 'expense_DAILY';
    const generalOk = true;
    const kind = decide({ pending: 2, receivedInWindow: 2, hasExpense: true });
    // cancel after decision
    os = null;
    if (kind === 'none') return { os: null, kind, gap: true };
    os = kind === 'sms_inbox_reminder' ? 'sms_DATE_today' : 'expense';
    return { os, kind, gap: false };
  })();

  return { current, proposedPermOff, proposedPermOnPending2 };
}

async function main() {
  const convertCurrent = await scenarioConvertVsIngest({ mode: 'current' });
  const convertFixed = await scenarioConvertVsIngest({ mode: 'fixed' });
  const categoryCurrent = await scenarioCategoryPatchVsIngest({ mode: 'current' });
  const categoryFixed = await scenarioCategoryPatchVsIngest({ mode: 'fixed' });
  const editCurrent = await scenarioEditCardVsIngest({ mode: 'current' });
  const editFixed = await scenarioEditCardVsIngest({ mode: 'fixed' });
  const schedule = scenarioScheduleCancelOrder();

  // 현재 경로: 깨짐
  assert(convertCurrent.ids.length === 0, 'current convert race should wipe');
  assert(convertCurrent.wouldSms === false, 'current convert → no sms');
  assert(categoryCurrent.keptC === false, 'current category race loses C');
  assert(editCurrent.keptBC === false, 'current edit race loses B,C');

  // 제안 경로: 유지 + sms
  assert(convertFixed.ids.join(',') === 'B,C', 'fixed convert keeps B,C');
  assert(convertFixed.wouldSms === true, 'fixed convert → sms');
  assert(categoryFixed.keptC === true, 'fixed category keeps C');
  assert(categoryFixed.categoryA === '식비', 'fixed category patches A');
  assert(categoryFixed.wouldSms === true, 'fixed category → sms');
  assert(editFixed.keptBC === true, 'fixed edit keeps B,C');
  assert(editFixed.amountA === 2500, 'fixed edit patches amount');
  assert(editFixed.wouldSms === true, 'fixed edit → sms');

  assert(schedule.proposedPermOnPending2.gap === false, 'proposed schedule no gap with pending2');
  assert(schedule.proposedPermOnPending2.os === 'sms_DATE_today', 'proposed schedules sms');

  const report = {
    ok: true,
    convert: { current: convertCurrent, fixed: convertFixed },
    category: { current: categoryCurrent, fixed: categoryFixed },
    edit: { current: editCurrent, fixed: editFixed },
    schedule,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log('verify-record-inbox-store-mutation-model: PASS');
  console.log('');
  console.log('결론: 스토어 removeById/updateById 모델이면');
  console.log('- 전환·카테고리·수정 × 동시 수신 레이스에서 큐 보존');
  console.log('- pending 유지 → sms 판정 유지');
  console.log('현재 스냅샷 replace 모델은 세 경로 모두 유실 → sms 미예약');
}

main().catch((err) => {
  console.error('verify-record-inbox-store-mutation-model: FAIL', err);
  process.exit(1);
});
