/**
 * 문자 수신함 적재 게이트 시뮬레이션 (실기기 Focus/DND는 OS 영역).
 * ingestSmsInboxMessage 분기와 동일하게 재현.
 *
 *   npx tsx scripts/simulate-sms-inbox-gates.ts
 */

import {
  isSenderAllowed,
  normalizeSmsSender,
  parseSmsInboxBody,
  restoreSmsSenderFromQueryParam,
} from '../utils/sms-inbox-parse';

type GateCase = {
  label: string;
  enabled: boolean;
  allowlist: string[];
  sender: string;
  body: string;
  /** OS가 단축어를 아예 안 돌린 경우 (Focus 등) */
  shortcutRan?: boolean;
};

function simulateGate(c: GateCase): { ok: boolean; reason: string } {
  if (c.shortcutRan === false) {
    return { ok: false, reason: 'os-shortcut-did-not-run' };
  }

  const body = c.body.replace(/^\n+|\n+$/g, '');
  const sender = c.sender.trim();
  if (!body) return { ok: false, reason: 'empty-body' };
  if (!c.enabled) return { ok: false, reason: 'disabled' };
  if (c.allowlist.length === 0) return { ok: false, reason: 'empty-allowlist' };

  const normalizedSender = normalizeSmsSender(sender);
  if (normalizedSender && !isSenderAllowed(sender, c.allowlist)) {
    return { ok: false, reason: 'sender-not-allowed' };
  }

  const parsed = parseSmsInboxBody(body);
  if (parsed.kind === 'ignore') {
    return { ok: false, reason: parsed.reason };
  }
  return { ok: true, reason: `${parsed.kind}:${parsed.amount}` };
}

const SHINHAN_BODY = `[Web발신]
에이월렛카드(3757)승인 송*섭
44,730원(일시불)09/10 21:46 쿠팡
누적 1,234,567원`;

const OVERSEAS_KRW = `[Web발신]
에이월렛카드(3757)해외승인 송*섭 KRW 5,292 (IE)09/10 16:05 FACEBK *V7 누적1,455,351원`;

const USD_ONLY = `에이월렛카드 해외승인 USD 12.34 09/10 16:05 FACEBK`;

const cases: GateCase[] = [
  // --- 1) 번호 2개+ ---
  {
    label: '앱 allowlist 2개 · 발신=목록1번째 → 통과',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '+82 1544-7200',
    body: SHINHAN_BODY,
  },
  {
    label: '앱 allowlist 2개 · 발신=목록2번째 → 통과',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '1588-8700',
    body: SHINHAN_BODY,
  },
  {
    label: '단축어 자동화에만 있는 번호 · 앱 allowlist에 없음 → sender-not-allowed',
    enabled: true,
    allowlist: ['+82 1544-7200'],
    sender: '+82 1588-8700',
    body: SHINHAN_BODY,
  },
  {
    label: '앱 allowlist 2개 · 발신 전혀 다른 번호 → sender-not-allowed',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '010-9999-0000',
    body: SHINHAN_BODY,
  },
  {
    label: '앱 allowlist 2개 · sender 빈값(이름만/미전달) → 1차 자동화 신뢰 → 통과',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '',
    body: SHINHAN_BODY,
  },
  {
    label: '앱 allowlist 2개 · sender=연락처 이름(숫자 없음) → 1차 신뢰 → 통과',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '신한카드',
    body: SHINHAN_BODY,
  },
  {
    label: '딥링크 +가 공백으로 풀림 · restore 후 allowlist 매칭',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: restoreSmsSenderFromQueryParam('82 1544-7200'),
    body: SHINHAN_BODY,
  },
  {
    label: '앱 allowlist 비어 있음(번호 미설정) → empty-allowlist',
    enabled: true,
    allowlist: [],
    sender: '+82 1544-7200',
    body: SHINHAN_BODY,
  },
  {
    label: '수신 OFF → disabled',
    enabled: false,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '+82 1544-7200',
    body: SHINHAN_BODY,
  },

  // --- 파서/통화 ---
  {
    label: '해외 KRW → 통과',
    enabled: true,
    allowlist: ['+82 1544-7200'],
    sender: '+82 1544-7200',
    body: OVERSEAS_KRW,
  },
  {
    label: 'USD only → no-amount',
    enabled: true,
    allowlist: ['+82 1544-7200'],
    sender: '+82 1544-7200',
    body: USD_ONLY,
  },

  // --- 2) Focus/DND (앱 게이트 없음 → OS가 단축어 미실행만 시뮬) ---
  {
    label: '[Focus] 수면/방해금지 등으로 OS가 단축어 미실행 → enqueue 없음',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '+82 1544-7200',
    body: SHINHAN_BODY,
    shortcutRan: false,
  },
  {
    label: '[Focus] 같은 조건인데 OS가 단축어 실행함 → 앱은 통과',
    enabled: true,
    allowlist: ['+82 1544-7200', '+82 1588-8700'],
    sender: '+82 1544-7200',
    body: SHINHAN_BODY,
    shortcutRan: true,
  },
];

function main(): void {
  console.log('=== SMS inbox gate simulation ===\n');
  let fail = 0;
  for (const c of cases) {
    const result = simulateGate(c);
    const mark = result.ok ? 'PASS' : 'BLOCK';
    if (!result.ok) fail += 1;
    console.log(`[${mark}] ${c.label}`);
    console.log(
      `       sender=${JSON.stringify(c.sender)} norm=${JSON.stringify(normalizeSmsSender(c.sender))} allowlist=${c.allowlist.length} → ${result.reason}`,
    );
  }
  console.log(`\nblocked ${fail}/${cases.length} (blocked≠bug; 게이트가 막은 건수)`);
  console.log(
    '\nNote: Focus/DND/개인/업무/수면은 앱 코드에 게이트 없음. OS가 자동화를 안 돌리면 os-shortcut-did-not-run만 해당.',
  );
}

main();
