/**
 * 전제: 수신 ON · allowlist에 +82 1544-7200 · 사용자가 “본문 비움/수신OFF/번호빼기”를 안 함.
 * 그래도 남는 유실 빈틈만 시뮬.
 *
 *   npx tsx scripts/simulate-sms-inbox-remaining-gaps.ts
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
} from '../utils/sms-inbox-parse';

const ALLOW = '+82 1544-7200';
const PAYMENT = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

const PERMA = new Set([
  'disabled',
  'empty-allowlist',
  'sender-not-allowed',
  'no-keyword',
  'no-amount',
  'empty-body',
  'empty',
  'cancel-no-match',
]);

type Gap = {
  id: string;
  label: string;
  /** Intent에 실제로 도착한 본문 (사용자 의도와 다를 수 있음) */
  intentBody: string;
  intentSender: string;
  enabled: boolean;
  allowlist: string[];
  flushed: boolean;
  /** stage Intent → prod 앱 */
  appGroupMismatch: boolean;
};

function ingest(body: string, sender: string, enabled: boolean, allowlist: string[]) {
  const b = body.replace(/^\n+|\n+$/g, '');
  if (!b) return { ok: false as const, reason: 'empty-body' };
  if (!enabled) return { ok: false as const, reason: 'disabled' };
  if (allowlist.length === 0) return { ok: false as const, reason: 'empty-allowlist' };
  const n = normalizeSmsSender(sender);
  if (n && !isSenderAllowed(sender, allowlist)) {
    return { ok: false as const, reason: 'sender-not-allowed' };
  }
  const p = parseSmsInboxBody(b);
  if (p.kind === 'ignore') return { ok: false as const, reason: p.reason };
  return { ok: true as const, reason: `${p.kind}:${p.amount}` };
}

function run(g: Gap) {
  // Intent.perform — 빈 본문도 OS「실행됨」
  const trimmed = g.intentBody.trim();
  const osRan = true;

  if (!trimmed) {
    return {
      osRan,
      inbox: false,
      queue: false,
      path: 'intent:empty-body (실행됨·큐없음)',
    };
  }
  if (g.appGroupMismatch) {
    return {
      osRan,
      inbox: false,
      queue: false,
      path: 'app-group-mismatch (stage enqueue ≠ prod peek)',
    };
  }
  if (!g.flushed) {
    return {
      osRan,
      inbox: false,
      queue: true,
      path: 'no-flush (앱 미포그라운드)',
    };
  }
  const r = ingest(g.intentBody, g.intentSender, g.enabled, g.allowlist);
  if (r.ok) {
    return { osRan, inbox: true, queue: false, path: r.reason };
  }
  if (PERMA.has(r.reason)) {
    return {
      osRan,
      inbox: false,
      queue: false,
      path: `flush-ack:${r.reason}`,
    };
  }
  return { osRan, inbox: false, queue: true, path: `flush-keep:${r.reason}` };
}

/** 사용자 전제: 설정 정상. 의도는 결제 SMS + 번호 연결. */
const settingsOk = {
  enabled: true,
  allowlist: [ALLOW],
};

const gaps: Gap[] = [
  {
    id: 'G0',
    label: '[대조] Intent까지 정상 전달',
    intentBody: PAYMENT,
    intentSender: ALLOW,
    ...settingsOk,
    flushed: true,
    appGroupMismatch: false,
  },
  {
    id: 'G1',
    label: '[빈틈] 배선 끊김 → Intent 본문 빈값 (설정 화면은 멀쩡)',
    intentBody: '',
    intentSender: ALLOW,
    ...settingsOk,
    flushed: true,
    appGroupMismatch: false,
  },
  {
    id: 'G2',
    label: '[빈틈] stage Intent ↔ prod 앱 App Group',
    intentBody: PAYMENT,
    intentSender: ALLOW,
    ...settingsOk,
    flushed: true,
    appGroupMismatch: true,
  },
  {
    id: 'G3',
    label: '[빈틈] enqueue OK · 앱 미기동(flush 전)',
    intentBody: PAYMENT,
    intentSender: ALLOW,
    ...settingsOk,
    flushed: false,
    appGroupMismatch: false,
  },
  {
    id: 'G4',
    label: '[빈틈] 본문 포맷 이상 → no-amount (USD only)',
    intentBody: '에이월렛카드 해외승인 USD 12.34 09/10 16:05',
    intentSender: ALLOW,
    ...settingsOk,
    flushed: true,
    appGroupMismatch: false,
  },
  {
    id: 'G5',
    label: '[빈틈] 본문·발신 변수 뒤바뀜',
    intentBody: ALLOW,
    intentSender: PAYMENT,
    ...settingsOk,
    flushed: true,
    appGroupMismatch: false,
  },
];

console.log('=== Remaining gaps (settings ON + allowlist set, user did not clear them) ===\n');

for (const g of gaps) {
  const o = run(g);
  const inbox = o.inbox ? 'INBOX✓' : 'INBOX✗';
  const q = o.queue ? 'queue:left' : 'queue:empty';
  const ran = o.osRan ? '단축어✓' : '단축어✗';
  console.log(`[${g.id}] ${ran} ${inbox} ${q}`);
  console.log(`     ${g.label}`);
  console.log(`     → ${o.path}`);
}

console.log(`
재설정하면 나아지기 쉬운 것: G1(본문 미전달), G2(stage/prod Intent), G5(변수 뒤바뀜)
앱만 열면 나올 수 있는 것: G3
결제 문자가 정상이면 거의 안 타는 것: G4`);
