/**
 * 간편입력(parse-expense)용: "메모 … 금액" 지시에서 memo 필드를 규칙으로 추출합니다.
 * 서술 제거는 동사 목록이 아니라 끝 토큰·어미 패턴으로 처리합니다.
 * API에서는 규칙만으로 부족할 때 Gemini micro-call로 보강합니다.
 */

/** `메모` 지시 접두 (공백·콜론·는 허용) */
const MEMO_DIRECTIVE_RE = /(?:^|\s)메모(?:[:：는]?\s+)/;

const AMOUNT_IN_TEXT_RE = /(\d[\d,]*)\s*(?:원|(만원|천원|백원))/g;

/** 끝 구문(복수 토큰) 서술 패턴 */
const TRAILING_PHRASE_RES: RegExp[] = [
  /\s+[\uAC00-\uD7A3]+러\s+갔(?:어|음|다|을|는)?$/,
  /\s+[\uAC00-\uD7A3]+고\s+있(?:어|음|다|네)?$/,
  /\s+[\uAC00-\uD7A3]+는\s+중$/,
  /\s+[\uAC00-\uD7A3]+다\s+왔(?:어|음|다)?$/,
];

function findMemoDirectiveMatch(message: string): RegExpExecArray | null {
  const normalized = message.trim();
  if (normalized.length === 0) return null;
  return MEMO_DIRECTIVE_RE.exec(normalized);
}

function findFirstAmountIndex(text: string, searchFrom: number): number | null {
  const slice = text.slice(searchFrom);
  let earliest: number | null = null;

  for (const match of slice.matchAll(AMOUNT_IN_TEXT_RE)) {
    if (match.index === undefined) continue;
    const absoluteIndex = searchFrom + match.index;
    if (earliest === null || absoluteIndex < earliest) {
      earliest = absoluteIndex;
    }
  }

  return earliest;
}

/**
 * 단일 토큰이 동작·서술 어미로 보이는지 (동사 화이트리스트 없이 어미 기준).
 */
export function looksLikeActionTail(token: string): boolean {
  const t = token.trim();
  if (t.length < 2) return false;

  if (/^[\uAC00-\uD7A3]{2,}러$/.test(t)) return true;
  if (/[\uAC00-\uD7A3]+(?:셨|렸|웠|겼|줬|났|봤|갔|듯|[었았했였])(?:어|음|다|네|지|요|죠)?$/.test(t)) return true;
  if (/[\uAC00-\uD7A3]+겠(?:어|음|다|네|지|요)?$/.test(t)) return true;
  if (/[\uAC00-\uD7A3]+(?:함|봄|중)$/.test(t)) return true;

  return false;
}

function stillHasNarrativeTail(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  for (const re of TRAILING_PHRASE_RES) {
    if (re.test(trimmed)) return true;
  }

  const lastSpace = trimmed.lastIndexOf(' ');
  const lastToken = lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed;
  return looksLikeActionTail(lastToken);
}

function stripTrailingTokenNarrative(memo: string): string {
  let result = memo.trim();
  while (result.length > 0) {
    const lastSpace = result.lastIndexOf(' ');
    const lastToken = lastSpace >= 0 ? result.slice(lastSpace + 1) : result;
    if (!looksLikeActionTail(lastToken)) break;
    result = (lastSpace >= 0 ? result.slice(0, lastSpace) : '').trim();
  }
  return result;
}

/** 금액 직전 raw 구간에서 끝 서술·동작 표현을 규칙으로 제거합니다. */
export function applyMemoRulesToSpan(rawSpan: string): string {
  let result = rawSpan.trim();
  if (result.length === 0) return result;

  let changed = true;
  while (changed) {
    changed = false;

    for (const re of TRAILING_PHRASE_RES) {
      const next = result.replace(re, '').trim();
      if (next !== result) {
        result = next;
        changed = true;
        break;
      }
    }
    if (changed) continue;

    const tokenStripped = stripTrailingTokenNarrative(result);
    if (tokenStripped !== result) {
      result = tokenStripped;
      changed = true;
    }
  }

  return result.trim();
}

/**
 * `메모` 지시가 있을 때 금액 직전 원문 구간(서술 포함)을 반환합니다.
 */
export function extractMemoRawSpan(message: string): string | null {
  const directiveMatch = findMemoDirectiveMatch(message);
  if (!directiveMatch || directiveMatch.index === undefined) return null;

  const normalized = message.trim();
  const memoContentStart = directiveMatch.index + directiveMatch[0].length;
  const amountIndex = findFirstAmountIndex(normalized, memoContentStart);
  if (amountIndex === null || amountIndex <= memoContentStart) return null;

  const rawSpan = normalized.slice(memoContentStart, amountIndex).trim();
  return rawSpan.length > 0 ? rawSpan : null;
}

/**
 * 규칙만으로 memo를 추출합니다. 지시가 없으면 null.
 */
export function extractMemoFromMessage(message: string): string | null {
  const rawSpan = extractMemoRawSpan(message);
  if (rawSpan == null) return null;

  const memo = applyMemoRulesToSpan(rawSpan);
  return memo.length > 0 ? memo : null;
}

/**
 * 규칙 후에도 끝 서술이 남아 있거나, 규칙이 전혀 적용되지 않았는데 서술이 보이면 AI 정제가 필요합니다.
 */
export function needsMemoAiRefinement(rawSpan: string, ruleMemo: string): boolean {
  const raw = rawSpan.trim();
  const ruled = ruleMemo.trim();
  if (raw.length === 0 || ruled.length === 0) return false;

  if (raw !== ruled) {
    return stillHasNarrativeTail(ruled);
  }

  return stillHasNarrativeTail(raw);
}
