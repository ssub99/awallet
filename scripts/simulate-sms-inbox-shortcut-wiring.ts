/**
 * 「단축어는 돌았는데 안 쌓임 → 단축어 재설정하면 됨」 가설 체크.
 * Intent는 빈 본문도 perform() 성공(.result()) → OS는 실행됨으로 보임.
 *
 *   npx tsx scripts/simulate-sms-inbox-shortcut-wiring.ts
 */

import { parseSmsInboxBody, normalizeSmsSender, isSenderAllowed } from '../utils/sms-inbox-parse';

const ALLOW = '+82 1544-7200';
const PAYMENT = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

type Wiring = {
  id: string;
  label: string;
  /** 단축어「입력 내용」에 연결된 값 */
  bodyParam: string;
  senderParam: string;
  /** 재설정 후 배선이 고쳐진 상태 */
  afterResets?: boolean;
};

/** Intent.perform → enqueue 미러 (Swift SmsInboxAppGroupQueue.enqueue) */
function intentEnqueue(body: string, sender: string): {
  osShowsRan: true;
  enqueued: boolean;
  lastIntent: string;
} {
  const trimmed = body.replace(/^\s+|\s+$/g, '');
  if (!trimmed) {
    return { osShowsRan: true, enqueued: false, lastIntent: 'empty-body' };
  }
  return { osShowsRan: true, enqueued: true, lastIntent: 'enqueued' };
}

function flushIngest(body: string, sender: string): { stacked: boolean; reason: string } {
  if (!body.trim()) return { stacked: false, reason: 'empty-body' };
  const allowlist = [ALLOW];
  const norm = normalizeSmsSender(sender);
  if (norm && !isSenderAllowed(sender, allowlist)) {
    return { stacked: false, reason: 'sender-not-allowed' };
  }
  const parsed = parseSmsInboxBody(body);
  if (parsed.kind === 'ignore') return { stacked: false, reason: parsed.reason };
  return { stacked: true, reason: `${parsed.kind}:${parsed.amount}` };
}

function run(w: Wiring): void {
  const intent = intentEnqueue(w.bodyParam, w.senderParam);
  let stacked = false;
  let detail = intent.lastIntent;
  if (intent.enqueued) {
    const ing = flushIngest(w.bodyParam, w.senderParam);
    stacked = ing.stacked;
    detail = intent.enqueued ? `enqueued→${ing.reason}` : intent.lastIntent;
  }
  const mark = stacked ? 'INBOX✓' : 'INBOX✗';
  const ran = intent.osShowsRan ? '단축어실행✓' : '단축어실행✗';
  console.log(`[${w.id}] ${ran} ${mark}  ${w.label}`);
  console.log(`     lastIntent/path: ${detail}`);
  console.log(
    `     bodyLen=${w.bodyParam.length} sender=${JSON.stringify(w.senderParam)}`,
  );
}

const cases: Wiring[] = [
  {
    id: 'W0',
    label: '[정상] 본문←메시지내용, 발신←발신자',
    bodyParam: PAYMENT,
    senderParam: '+82 1544-7200',
  },
  {
    id: 'W1',
    label: '[핵심] 본문 미연결/빈값 — OS는 실행됨, 큐 없음 (재설정으로 고쳐지는 패턴)',
    bodyParam: '',
    senderParam: '+82 1544-7200',
  },
  {
    id: 'W2',
    label: '[핵심] 본문에 잘못된 매직변수(빈 문자열) 연결',
    bodyParam: '   ',
    senderParam: '+82 1544-7200',
  },
  {
    id: 'W3',
    label: '본문은 OK, 발신자만 미연결(빈 sender) → 번호 스킵 후 쌓임',
    bodyParam: PAYMENT,
    senderParam: '',
  },
  {
    id: 'W4',
    label: '본문·발신 뒤집힘(본문에 번호, 발신에 메시지) → no-keyword',
    bodyParam: '+82 1544-7200',
    senderParam: PAYMENT,
  },
  {
    id: 'W5',
    label: '[재설정 후] 배선 복구 → 다시 쌓임',
    bodyParam: PAYMENT,
    senderParam: '+82 1544-7200',
    afterResets: true,
  },
];

console.log('=== Shortcut wiring loss (matches “ran but empty inbox, reset fixes”) ===\n');
for (const c of cases) run(c);
console.log(`
코드 근거 (SmsInboxAppIntent.swift):
  - perform()은 빈 본문에도 throw 없이 .result() → 단축어「실행됨」
  - enqueue는 빈 본문이면 lastIntent=empty-body 만 기록, 큐 미적재
→ 사용자 증상과 W1/W2가 일치. 파싱 실패(W0 본문)와는 무관.`);
