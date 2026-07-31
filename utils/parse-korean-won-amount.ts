/**
 * 한글·아라비아 혼합 원화 금액 파싱.
 * 예: 오천원, 오만원, 일만1천원, 1억 오천원, 삼만오천원
 */

const SMALL_DIGIT: Record<string, number> = {
  영: 0,
  공: 0,
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
  칠: 7,
  팔: 8,
  구: 9,
};

const SPOKEN_DIGITS: Array<[string, number]> = [
  ['다섯', 5],
  ['여섯', 6],
  ['일곱', 7],
  ['여덟', 8],
  ['아홉', 9],
  ['하나', 1],
  ['한', 1],
  ['둘', 2],
  ['두', 2],
  ['셋', 3],
  ['세', 3],
  ['넷', 4],
  ['네', 4],
];

const WON_EXPR_RE =
  /([0-9일이삼사오육칠팔구영공하나둘두셋세넷네다섯여섯일곱여덟아홉십백천만억,\s]+)\s*원/g;

function readDigitToken(s: string, i: number): { value: number; next: number } | null {
  for (const [word, value] of SPOKEN_DIGITS) {
    if (s.startsWith(word, i)) {
      return { value, next: i + word.length };
    }
  }
  const ch = s[i];
  if (ch && ch in SMALL_DIGIT) {
    return { value: SMALL_DIGIT[ch], next: i + 1 };
  }
  return null;
}

function readArabicNumber(s: string, i: number): { value: number; next: number } | null {
  if (i >= s.length || !/\d/.test(s[i]!)) return null;
  let j = i;
  while (j < s.length && /\d/.test(s[j]!)) j += 1;
  const n = parseInt(s.slice(i, j), 10);
  if (!Number.isFinite(n)) return null;
  return { value: n, next: j };
}

/**
 * 만 미만 구간 (0 ~ 9999). 아라비아·한글·혼합.
 * 예: 1234, 오천, 1천, 이백삼십, 십이
 */
export function parseKoreanUnderMan(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '');
  if (s.length === 0) return 0;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  let i = 0;
  let total = 0;
  let current = 0;

  while (i < s.length) {
    const arabic = readArabicNumber(s, i);
    if (arabic) {
      current = arabic.value;
      i = arabic.next;
      continue;
    }

    const ch = s[i];
    if (ch === '천' || ch === '백' || ch === '십') {
      const unit = ch === '천' ? 1_000 : ch === '백' ? 100 : 10;
      const mul = current > 0 ? current : 1;
      total += mul * unit;
      current = 0;
      i += 1;
      continue;
    }

    const dig = readDigitToken(s, i);
    if (dig) {
      current = dig.value;
      i = dig.next;
      continue;
    }

    return null;
  }

  return total + current;
}

/**
 * 억 미만 (만 단위 포함). 예: 오만, 일만1천, 삼만오천, 십이만
 */
export function parseKoreanUnderEok(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '');
  if (s.length === 0) return 0;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  }

  const parts = s.split('만');
  if (parts.length > 2) return null;

  if (parts.length === 2) {
    const leftRaw = parts[0] ?? '';
    const rightRaw = parts[1] ?? '';
    const left = leftRaw.length === 0 ? '일' : leftRaw;
    const manMul = parseKoreanUnderMan(left);
    if (manMul == null) return null;
    let total = manMul * 10_000;
    if (rightRaw.length > 0) {
      const rest = parseKoreanUnderMan(rightRaw);
      if (rest == null) return null;
      total += rest;
    }
    return total;
  }

  return parseKoreanUnderMan(s);
}

/**
 * 원 앞 표현 전체. 억 지원.
 */
export function parseKoreanWonExpression(raw: string): number | null {
  const s = raw.replace(/[,\s]/g, '');
  if (s.length === 0) return null;
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const parts = s.split('억');
  if (parts.length > 2) return null;

  if (parts.length === 2) {
    const leftRaw = parts[0] ?? '';
    const rightRaw = parts[1] ?? '';
    const left = leftRaw.length === 0 ? '일' : leftRaw;
    const eokMul = parseKoreanUnderEok(left);
    if (eokMul == null) return null;
    let total = eokMul * 100_000_000;
    if (rightRaw.length > 0) {
      const rest = parseKoreanUnderEok(rightRaw);
      if (rest == null) return null;
      total += rest;
    }
    return total > 0 ? total : null;
  }

  const value = parseKoreanUnderEok(s);
  if (value == null || value <= 0) return null;
  return value;
}

/**
 * 문장에서 한글·혼합 원화 금액을 모두 수집.
 * 순수 숫자+원은 기존 숫자 파서와 중복되지 않도록 제외.
 */
export function collectKoreanWonAmountsFromMessage(message: string): number[] {
  const amounts: number[] = [];
  for (const match of message.matchAll(WON_EXPR_RE)) {
    const expr = (match[1] ?? '').trim();
    if (expr.length === 0) continue;
    const compact = expr.replace(/[,\s]/g, '');
    if (/^\d+$/.test(compact)) continue;
    if (!/[일이삼사오육칠팔구영공하나둘두셋세넷네다섯여섯일곱여덟아홉십백천만억]/.test(compact)) {
      continue;
    }
    const n = parseKoreanWonExpression(expr);
    if (n != null && n > 0) amounts.push(n);
  }
  return amounts;
}
