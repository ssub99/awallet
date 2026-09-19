/**
 * 가설 시뮬레이션: 단축어는 돌았는데 수신함 UI에 안 쌓임.
 * iOS 경로: Intent enqueue(allowlist 없음) → flush → ingest → (영구실패면 ack)
 *
 *   npx tsx scripts/simulate-sms-inbox-post-shortcut-loss.ts
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
} from '../utils/sms-inbox-parse';

const ALLOW = '+82 1544-7200';
const REAL_PAYMENT_BODY = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

type Case = {
  id: string;
  label: string;
  /** 단축어 실행됨 */
  shortcutRan: true;
  body: string;
  /** Intent에 실제로 넘어온 sender */
  intentSender: string;
  enabled: boolean;
  allowlist: string[];
  /** 앱이 flush 했는지 */
  flushed: boolean;
  /** stage Intent → prod 앱 등 App Group 불일치 */
  appGroupMismatch?: boolean;
};

type Outcome = {
  enqueued: boolean;
  inboxStacked: boolean;
  queueLeft: boolean;
  reason: string;
};

const PERMA_ACK = new Set([
  'disabled',
  'empty-allowlist',
  'sender-not-allowed',
  'no-keyword',
  'no-amount',
  'empty-body',
  'empty',
  'cancel-no-match',
]);

function ingestOnly(c: Pick<Case, 'body' | 'intentSender' | 'enabled' | 'allowlist'>): {
  ok: boolean;
  reason: string;
} {
  const body = c.body.replace(/^\n+|\n+$/g, '');
  if (!body) return { ok: false, reason: 'empty-body' };
  if (!c.enabled) return { ok: false, reason: 'disabled' };
  if (c.allowlist.length === 0) return { ok: false, reason: 'empty-allowlist' };
  const norm = normalizeSmsSender(c.intentSender);
  if (norm && !isSenderAllowed(c.intentSender, c.allowlist)) {
    return { ok: false, reason: 'sender-not-allowed' };
  }
  const parsed = parseSmsInboxBody(body);
  if (parsed.kind === 'ignore') return { ok: false, reason: parsed.reason };
  return { ok: true, reason: `${parsed.kind}:${parsed.amount}` };
}

function run(c: Case): Outcome {
  // 1) Intent
  const trimmed = c.body.trim();
  if (!trimmed) {
    return { enqueued: false, inboxStacked: false, queueLeft: false, reason: 'intent:empty-body' };
  }
  if (c.appGroupMismatch) {
    return {
      enqueued: true,
      inboxStacked: false,
      queueLeft: false,
      reason: 'app-group-mismatch(enqueue≠peek)',
    };
  }

  // 2) flush 안 함 → 큐만 남고 UI 없음
  if (!c.flushed) {
    return {
      enqueued: true,
      inboxStacked: false,
      queueLeft: true,
      reason: 'no-flush(pending-only)',
    };
  }

  // 3) ingest
  const result = ingestOnly(c);
  if (result.ok) {
    return { enqueued: true, inboxStacked: true, queueLeft: false, reason: result.reason };
  }
  if (PERMA_ACK.has(result.reason)) {
    return {
      enqueued: true,
      inboxStacked: false,
      queueLeft: false,
      reason: `flush-ack:${result.reason}`,
    };
  }
  return {
    enqueued: true,
    inboxStacked: false,
    queueLeft: true,
    reason: `flush-keep:${result.reason}`,
  };
}

const cases: Case[] = [
  {
    id: 'A',
    label: '[대조] 번호·본문·설정 정상 → 쌓여야 함',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
  },
  {
    id: 'B',
    label: '[가설1] 수신 OFF',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: false,
    allowlist: [ALLOW],
    flushed: true,
  },
  {
    id: 'C',
    label: '[가설2] allowlist 비어 있음(설정 번호 미저장)',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [],
    flushed: true,
  },
  {
    id: 'D',
    label: '[가설3] 본문 파싱 실패(USD only → no-amount)',
    shortcutRan: true,
    body: '에이월렛카드 해외승인 USD 12.34 09/10 16:05 FACEBK',
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
  },
  {
    id: 'E',
    label: '[가설4] 본문 파싱 실패(키워드 없음 → no-keyword)',
    shortcutRan: true,
    body: '[Web발신] 쿠폰이 도착했습니다 1,000원',
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
  },
  {
    id: 'F',
    label: '[가설5] flush 안 됨(앱 미기동/미포그라운드)',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: false,
  },
  {
    id: 'G',
    label: '[가설6] App Group 불일치(stage Intent ↔ prod 앱)',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
    appGroupMismatch: true,
  },
  {
    id: 'H',
    label: '[가설7] Intent sender가 다른 숫자(1588) — 번호 불일치 유일한 성립 케이스',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1588-8700',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
  },
  {
    id: 'I',
    label: '[기각] 사용자 가설: 세 곳 동일 + Intent도 동일 → 번호 때문에 뱉음?',
    shortcutRan: true,
    body: REAL_PAYMENT_BODY,
    intentSender: '+82 1544-7200',
    enabled: true,
    allowlist: [ALLOW],
    flushed: true,
  },
];

function main(): void {
  console.log('=== Post-shortcut loss hypotheses ===');
  console.log('allowlist fixed:', ALLOW, 'norm=', normalizeSmsSender(ALLOW));
  console.log('');

  for (const c of cases) {
    const o = run(c);
    const ui = o.inboxStacked ? 'INBOX✓' : 'INBOX✗';
    const q = o.queueLeft ? 'queue:left' : 'queue:empty';
    console.log(`[${c.id}] ${ui} ${q}  ${c.label}`);
    console.log(`     → ${o.reason}`);
  }

  console.log('\nLegend: INBOX✗ + queue:empty = 단축어 돌았는데 UI에도 큐에도 없음(영구실패 ack 또는 mismatch)');
  console.log('         INBOX✗ + queue:left  = 아직 flush 전(앱 열면 나올 수 있음)');
}

main();
