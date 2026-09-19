/**
 * 실결제 번호(+82 1544-7200) 기준:
 * 「메시지 본문이 Intent에 붙었는지」만 A/B로 비교.
 * (기기 SMS/단축어는 이 스크립트가 대신 실행할 수 없음 — 앱 enqueue 로직 미러)
 *
 *   npx tsx scripts/simulate-sms-inbox-body-attach.ts
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
} from '../utils/sms-inbox-parse';

/** 사용자가 설정·단축어·카드사에 쓴 실번호 */
const REAL_NUMBER = '+82 1544-7200';

/** 실결제와 같은 포맷의 승인 SMS (가명 픽스처) */
const REAL_PAYMENT_BODY = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

function intentEnqueue(body: string, sender: string) {
  const trimmed = body.trim();
  // SmsInboxAppIntent.perform → enqueue 미러
  if (!trimmed) {
    return {
      shortcutShowsRan: true as const,
      enqueued: false as const,
      lastIntent: {
        ok: false,
        reason: 'empty-body',
        sender,
        bodyPreview: '',
      },
    };
  }
  return {
    shortcutShowsRan: true as const,
    enqueued: true as const,
    lastIntent: {
      ok: true,
      reason: 'enqueued',
      sender,
      bodyPreview: trimmed.slice(0, 80),
    },
  };
}

function flushIngest(body: string, sender: string) {
  const allowlist = [REAL_NUMBER];
  if (!body.trim()) return { stacked: false, reason: 'empty-body' };
  const n = normalizeSmsSender(sender);
  if (n && !isSenderAllowed(sender, allowlist)) {
    return { stacked: false, reason: 'sender-not-allowed' };
  }
  const p = parseSmsInboxBody(body);
  if (p.kind === 'ignore') return { stacked: false, reason: p.reason };
  return { stacked: true, reason: `${p.kind}:${p.amount}` };
}

type Trial = {
  id: string;
  title: string;
  /** 단축어가 Intent「입력 내용」에 실제로 넘긴 값 */
  bodyPassedToIntent: string;
  senderPassedToIntent: string;
};

const trials: Trial[] = [
  {
    id: 'A',
    title: '본문이 Intent에 붙음 (정상)',
    bodyPassedToIntent: REAL_PAYMENT_BODY,
    senderPassedToIntent: REAL_NUMBER,
  },
  {
    id: 'B',
    title: '단축어는 실행됐지만 본문이 Intent에 안 붙음',
    bodyPassedToIntent: '',
    senderPassedToIntent: REAL_NUMBER,
  },
  {
    id: 'C',
    title: '본문 칸에 공백만 붙음',
    bodyPassedToIntent: '  \n  ',
    senderPassedToIntent: REAL_NUMBER,
  },
];

console.log('=== 실결제 번호로 「본문 부착」 A/B ===');
console.log(`번호: ${REAL_NUMBER} → norm ${normalizeSmsSender(REAL_NUMBER)}`);
console.log('(이 스크립트는 폰 SMS를 대신 받을 수 없음. Intent enqueue 로직만 재현)\n');

for (const t of trials) {
  const intent = intentEnqueue(t.bodyPassedToIntent, t.senderPassedToIntent);
  let stacked = false;
  let after = intent.lastIntent.reason;
  if (intent.enqueued) {
    const ing = flushIngest(t.bodyPassedToIntent, t.senderPassedToIntent);
    stacked = ing.stacked;
    after = `enqueued → ingest ${ing.reason}`;
  }

  console.log(`[${t.id}] ${t.title}`);
  console.log(`    단축어「실행됨」표시: ${intent.shortcutShowsRan ? '예' : '아니오'}`);
  console.log(`    Intent에 넘어온 본문 길이: ${t.bodyPassedToIntent.trim().length}자`);
  console.log(`    lastIntent: ${JSON.stringify(intent.lastIntent)}`);
  console.log(`    수신함 적재: ${stacked ? '됨' : '안 됨'} (${after})`);
  console.log('');
}

console.log(`의미:
  A = 본문이 붙으면 실번호+실결제포맷으로 수신함에 쌓임
  B/C = 「본문이 안 붙음」= 파싱 실패가 아니라 enqueue 자체를 안 함
        (파싱은 본문이 큐에 들어온 뒤에만 돌아감)

기기에서 확인하려면 실문자 직후 stage 앱에서 lastIntent.reason 을 보면 됨:
  enqueued + bodyPreview에 승인 문구 → 본문 붙음
  empty-body → 본문 안 붙음`);
