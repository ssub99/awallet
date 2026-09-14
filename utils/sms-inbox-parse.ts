/**
 * 카드사 SMS 파서 — §9 정책.
 * allowlist는 ingest에서 검사. 여기선 본문만.
 * 키워드: 취소/입금 우선 → 승인/출금. 부분취소 미지원.
 */

export type SmsInboxParseKind = 'approval' | 'cancel' | 'ignore';

export type SmsInboxParsedFields = {
  amount: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  merchant?: string;
  cardHint?: string;
};

export type SmsInboxParseResult =
  | ({ kind: 'approval' | 'cancel' } & SmsInboxParsedFields)
  | { kind: 'ignore'; reason: string };

const CANCEL_KEYWORDS = ['취소', '입금'] as const;
const APPROVAL_KEYWORDS = ['승인', '출금'] as const;

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

export function isSenderAllowed(sender: string, allowlist: string[]): boolean {
  const normalizedSender = normalizeSmsSender(sender);
  if (!normalizedSender) return false;
  return allowlist.some((entry) => {
    const normalizedEntry = normalizeSmsSender(entry);
    if (!normalizedEntry) return false;
    return (
      normalizedSender === normalizedEntry ||
      normalizedSender.endsWith(normalizedEntry) ||
      normalizedEntry.endsWith(normalizedSender)
    );
  });
}

function detectKind(body: string): 'approval' | 'cancel' | null {
  // 취소 먼저 (승인취소)
  if (CANCEL_KEYWORDS.some((kw) => body.includes(kw))) {
    return 'cancel';
  }
  if (APPROVAL_KEYWORDS.some((kw) => body.includes(kw))) {
    return 'approval';
  }
  return null;
}

/**
 * 건별 금액. 누적/잔액/합계에 붙은 금액만 제외 (같은 줄에 있어도 건별은 유지).
 * 카드사 공통: `5,190원`, `39,500원(일시불)`, `일시불/3,500원`, `13,000`(원 없음) 등.
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

  // 2) 원 없는 줄 (체크카드출금 다음 줄 등). 누적 줄은 제외.
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

export function extractSmsDateTime(
  body: string,
  now: Date = new Date(),
): Pick<SmsInboxParsedFields, 'year' | 'month' | 'day' | 'hour' | 'minute'> {
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

export function parsedFieldsToIso(fields: SmsInboxParsedFields): string {
  const d = new Date(fields.year, fields.month - 1, fields.day, fields.hour, fields.minute, 0, 0);
  return d.toISOString();
}

export function parseSmsInboxBody(body: string, now: Date = new Date()): SmsInboxParseResult {
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

  const dateTime = extractSmsDateTime(trimmed, now);
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
