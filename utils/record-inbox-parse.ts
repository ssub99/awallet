/**
 * 카드사 문자·앱 알림 파서 — §9 정책.
 * allowlist는 ingest에서 검사. 여기선 본문만.
 * 취소 우선 → 지출(승인·출금). 입금·입금형 알림은 미적재(ignore).
 * `입출금` 등 상품명은 출금 키워드에서 제외. 부분취소 미지원.
 */

export type RecordInboxParseKind = 'approval' | 'cancel' | 'ignore';

export type RecordInboxParsedFields = {
  amount: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  merchant?: string;
  cardHint?: string;
};

export type RecordInboxParseResult =
  | ({ kind: 'approval' | 'cancel' } & RecordInboxParsedFields)
  | { kind: 'ignore'; reason: string };

const CANCEL_KEYWORDS = ['취소'] as const;

/** `출금` 부분 문자열 오탐 방지 (계좌·상품명). 긴 구문부터 치환 */
const WITHDRAW_FALSE_POSITIVE_PHRASES = ['입출금통장', '자동입출금', '입출금'] as const;

const MEANINGFUL_LINE_SKIP = /^\[?Web발신\]?$/;

/** 숫자만 남겨 발신번호 비교 (국가코드·선행 0 제거) */
export function normalizeSmsSender(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 10) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

/**
 * UI 표시용 발신번호. iOS·설정 입력 형식과 동일하게 `+82 1544-7200` / `+82 10-1234-5678`.
 * 숫자가 없으면(이름 등) 원문을 유지한다.
 */
export function formatSmsSenderDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '발신번호 없음';
  const digits = normalizeSmsSender(trimmed);
  if (!digits) return trimmed;
  return `+82 ${formatKrNationalNumber(digits)}`;
}

/** 국가코드·선행 0이 제거된 국내 번호에 하이픈 */
function formatKrNationalNumber(digits: string): string {
  // 휴대폰: 10xxxxxxxx → 10-xxxx-xxxx
  if (digits.length === 10 && digits.startsWith('10')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // 대표번호 등 8자리: 15447200 → 1544-7200
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  // 7자리: 1588123 → 158-8123 (드묾)
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  // 서울(02) 9자리: 2xxxxxxx → 2-xxxx-xxxx
  if (digits.length === 9 && digits.startsWith('2')) {
    return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5)}`;
  }
  // 지역번호 10자리: 31xxxxxxx → 31-xxx-xxxx
  if (digits.length === 10) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

export function isSenderAllowed(sender: string, allowlist: string[]): boolean {
  const normalizedSender = normalizeSmsSender(sender);
  if (!normalizedSender) return false;
  return allowlist.some((entry) => {
    const normalizedEntry = normalizeSmsSender(entry);
    if (!normalizedEntry) return false;
    return (
      normalizedSender === normalizedEntry ||
      normalizedSender.endsWith(normalizedEntry) ||
      normalizedEntry.endsWith(normalizedSender) ||
      // 1544/1588 같은 대표번호 축약 전달 허용 (예: 1544 -> 15447200)
      (normalizedSender.length >= 4 &&
        normalizedSender.length <= 5 &&
        normalizedEntry.startsWith(normalizedSender))
    );
  });
}

/**
 * 딥링크/쿼리에서 발신번호의 '+'가 공백으로 풀린 경우 복구.
 * `application/x-www-form-urlencoded`: '+' ≡ 공백 → "+82 …"가 "82 …"가 됨.
 */
export function restoreSmsSenderFromQueryParam(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('+')) return trimmed;
  if (/^\d{1,3}\s[\d\-()\s]+$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  return trimmed;
}

function meaningfulLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !MEANINGFUL_LINE_SKIP.test(line));
}

/** 계좌 상품명 등 — 이 구간의 `출금`은 지출 키워드로 쓰지 않음 */
export function maskWithdrawFalsePositives(body: string): string {
  let masked = body;
  for (const phrase of WITHDRAW_FALSE_POSITIVE_PHRASES) {
    masked = masked.split(phrase).join('\uFFFD'.repeat(phrase.length));
  }
  return masked;
}

function hasWithdrawKeyword(maskedBody: string): boolean {
  if (maskedBody.includes('체크카드출금')) return true;
  // KB `인터넷출금10,000` · `ATM출금` 등
  if (/[0-9A-Za-z가-힣]+출금/.test(maskedBody)) return true;
  if (/출금\s*[\d,]/.test(maskedBody)) return true;
  if (/^출금$/m.test(maskedBody)) return true;
  if (/(?:^|\s)출금(?:\s|$)/m.test(maskedBody)) return true;
  return false;
}

function hasExpenseKeyword(body: string): boolean {
  const masked = maskWithdrawFalsePositives(body);
  if (masked.includes('승인')) return true;
  return hasWithdrawKeyword(masked);
}

/** 입금 거래 알림 — 수신함에는 쌓지 않음 (오탐·취소 매칭 방지용 판별) */
export function isIncomeTransactionBody(body: string): boolean {
  const lines = meaningfulLines(body);
  if (lines.length === 0) return false;

  const first = lines[0]!;
  if (first === '입금' || /^입금[\s([]/.test(first) || /^입금\d/.test(first)) {
    return true;
  }
  if (/^NH입금/.test(first)) return true;
  if (/^입금[:：]/.test(first)) return true;
  if (/입금\s+\d/.test(first)) return true;
  if (/\d\s+입금\b/.test(first)) return true;

  // 알림: "토스" 다음 줄 / 한 줄 "입금 N원"
  if (lines.length >= 2 && lines[1]!.includes('입금') && !hasExpenseKeyword(body)) {
    return true;
  }
  if (lines.some((line, index) => index < 2 && line === '입금')) {
    return true;
  }

  if (/입금/.test(first) && !first.includes('승인') && !hasWithdrawKeyword(maskWithdrawFalsePositives(first))) {
    return true;
  }

  return false;
}

function detectKind(body: string): 'approval' | 'cancel' | null {
  // 취소 먼저 (승인취소)
  if (CANCEL_KEYWORDS.some((kw) => body.includes(kw))) {
    return 'cancel';
  }

  if (isIncomeTransactionBody(body)) {
    return null;
  }

  if (hasExpenseKeyword(body)) {
    return 'approval';
  }

  if (body.includes('입금') && !body.includes('승인')) {
    return null;
  }

  return null;
}

/**
 * `KRW 5,292` / `KRW5,292.00` → 정수 원.
 * 승인·취소 공통. USD/EUR 등은 매칭하지 않음.
 */
function parseKrwCodeAmount(raw: string): number | null {
  const amount = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount);
}

/**
 * 건별 금액. 누적/잔액/합계에 붙은 금액만 제외 (같은 줄에 있어도 건별은 유지).
 * 카드사 공통: `5,190원`, `KRW 5,292`, `KRW 5,292.00`, `일시불/3,500원`, `13,000`(원 없음) 등.
 */
export function extractPerTxnAmount(body: string): number | null {
  const candidates: number[] = [];

  // 1) …원 — 「누적/잔액/합계」바로 뒤 금액은 스킵
  for (const match of body.matchAll(/(\d{1,3}(?:,\d{3})*|\d+)원/g)) {
    const index = match.index ?? 0;
    const prefix = body.slice(Math.max(0, index - 8), index);
    if (/(?:누적|잔액|합계)\s*:?\s*$/.test(prefix)) {
      continue;
    }
    const amount = Number(match[1]!.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      candidates.push(amount);
    }
  }

  if (candidates.length > 0) {
    // 건별이 누적보다 앞에 오는 경우가 대부분
    return candidates[0] ?? null;
  }

  // 1b) KB 입출금통지 등 — `1,000,000 입금` (원 없음, 쉼표 필수 — 계좌 끝자리 오탐 방지)
  for (const match of body.matchAll(/(\d{1,3}(?:,\d{3})+)\s+입금(?=\s|$|잔액)/g)) {
    const index = match.index ?? 0;
    const prefix = body.slice(Math.max(0, index - 8), index);
    if (/(?:누적|잔액|합계)\s*:?\s*$/.test(prefix)) continue;
    const amount = Number(match[1]!.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      candidates.push(amount);
    }
  }
  if (candidates.length > 0) {
    return candidates[0] ?? null;
  }

  // 1b-2) `입금 120,000` · `입금:25,000` (원 없음 — `입금1644` 고객센터 번호 제외)
  for (const match of body.matchAll(/입금(?:\s*[:：]\s*|\s+)(\d{1,3}(?:,\d{3})*|\d+)(?=\s|$|원|잔액)/g)) {
    const index = match.index ?? 0;
    const prefix = body.slice(Math.max(0, index - 8), index);
    if (/(?:누적|잔액|합계)\s*:?\s*$/.test(prefix)) continue;
    const amount = Number(match[1]!.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      candidates.push(amount);
    }
  }
  if (candidates.length > 0) {
    return candidates[0] ?? null;
  }

  // 1c) 은행 출금 — `인터넷출금10,000` · `출금 10,000`
  for (const match of body.matchAll(
    /(?:인터넷|ATM|창구|스마트|폰)?출금\s*[:：]?\s*(\d{1,3}(?:,\d{3})*|\d+)/g,
  )) {
    const amount = Number(match[1]!.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }
  for (const match of body.matchAll(/출금\s+(\d{1,3}(?:,\d{3})*|\d+)\b/g)) {
    const amount = Number(match[1]!.replace(/,/g, ''));
    if (Number.isFinite(amount) && amount > 0) {
      return amount;
    }
  }

  // 2) 해외원화 등 — `KRW 5,292` / `KRW5,292.00` (승인·취소 공통)
  for (const match of body.matchAll(/\bKRW\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/gi)) {
    const index = match.index ?? 0;
    const prefix = body.slice(Math.max(0, index - 8), index);
    if (/(?:누적|잔액|합계)\s*:?\s*$/.test(prefix)) {
      continue;
    }
    const amount = parseKrwCodeAmount(match[1]!);
    if (amount != null) {
      candidates.push(amount);
    }
  }

  if (candidates.length > 0) {
    return candidates[0] ?? null;
  }

  // 3) 원 없는 줄 (체크카드출금 다음 줄 등). 누적 줄은 제외.
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/(?:누적|잔액|합계)/.test(line)) continue;

    if (/^\d{1,3}(?:,\d{3})+$/.test(line)) {
      const amount = Number(line.replace(/,/g, ''));
      if (Number.isFinite(amount) && amount > 0) {
        return amount;
      }
    } else if (/^\d{1,7}$/.test(line)) {
      const amount = Number(line);
      if (Number.isFinite(amount) && amount >= 100) {
        return amount;
      }
    }
  }

  return null;
}

export function extractRecordInboxDateTime(
  body: string,
  now: Date = new Date(),
): Pick<RecordInboxParsedFields, 'year' | 'month' | 'day' | 'hour' | 'minute'> {
  // MM/DD HH:mm or M/D H:mm
  const withTime = body.match(/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (withTime) {
    const month = parseInt(withTime[1], 10);
    const day = parseInt(withTime[2], 10);
    const hour = parseInt(withTime[3], 10);
    const minute = parseInt(withTime[4], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59) {
      return { year: now.getFullYear(), month, day, hour, minute };
    }
  }

  // MM/DD only
  const dateOnly = body.match(/(\d{1,2})\/(\d{1,2})(?!\d)/);
  if (dateOnly) {
    const month = parseInt(dateOnly[1], 10);
    const day = parseInt(dateOnly[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { year: now.getFullYear(), month, day, hour: 0, minute: 0 };
    }
  }

  // MM.DD HH:mm (은행 SMS)
  const withTimeDot = body.match(/(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (withTimeDot) {
    const month = parseInt(withTimeDot[1], 10);
    const day = parseInt(withTimeDot[2], 10);
    const hour = parseInt(withTimeDot[3], 10);
    const minute = parseInt(withTimeDot[4], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && hour <= 23 && minute <= 59) {
      return { year: now.getFullYear(), month, day, hour, minute };
    }
  }

  // 원문에 날짜 없음(현대 일부) → 기기 오늘
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

/** (3757), 2*5*, (9*0*) 등 */
export function extractCardHint(body: string): string | undefined {
  const paren = body.match(/\((\d[\d*]{1,6})\)/);
  if (paren) return paren[1];
  const starred = body.match(/\b(\d\*+\d*)\b/);
  if (starred) return starred[1];
  return undefined;
}

/**
 * 가맹점 휴리스틱: 금액·일시·누적·헤더가 아닌 짧은 한글/영문 토큰 줄.
 */
export function extractMerchant(body: string): string | undefined {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const skip = /Web발신|승인|취소|입금|출금|누적|잔액|일시불|체크카드|님$|카드/;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    if (skip.test(line)) continue;
    if (/^\d/.test(line) && /원/.test(line)) continue;
    if (/^\d{1,3}(?:,\d{3})*$/.test(line)) continue;
    if (/\d{1,2}\/\d{1,2}/.test(line) && line.length < 20) continue;
    // 줄에서 가맹점만 뽑기: "… 쿠팡" / 단독 상호
    const trailing = line.match(/[가-힣A-Za-z0-9*·&.\-\s]{2,40}$/);
    if (!trailing) continue;
    let merchant = trailing[0].trim();
    merchant = merchant.replace(/^\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s+/, '');
    merchant = merchant.replace(/^\d{1,3}(?:,\d{3})*원(?:\([^)]*\))?\s*/, '');
    merchant = merchant.replace(/\(일시불\)/g, '').trim();
    if (merchant.length >= 2 && !skip.test(merchant) && !/^\d+$/.test(merchant)) {
      return merchant.slice(0, 40);
    }
  }
  return undefined;
}

export function parsedFieldsToIso(fields: RecordInboxParsedFields): string {
  const d = new Date(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, 0, 0);
  return d.toISOString();
}

export function parseRecordInboxBody(body: string, now: Date = new Date()): RecordInboxParseResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return { kind: 'ignore', reason: 'empty' };
  }

  const kind = detectKind(trimmed);
  if (!kind) {
    return { kind: 'ignore', reason: 'no-keyword' };
  }

  const amount = extractPerTxnAmount(trimmed);
  if (amount == null) {
    return { kind: 'ignore', reason: 'no-amount' };
  }

  const dateTime = extractRecordInboxDateTime(trimmed, now);
  const merchant = extractMerchant(trimmed);
  const cardHint = extractCardHint(trimmed);

  return {
    kind,
    amount,
    ...dateTime,
    merchant,
    cardHint,
  };
}
