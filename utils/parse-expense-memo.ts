/**
 * 간편입력(parse-expense)용 메모 추출·정제 규칙.
 * 구조화 `메모 … 금액` 패턴은 규칙 fast path, 자연어 메모 요청은 API에서 AI 정제.
 */

/** `메모` 지시 접두 — 뒤에 메모 본문이 바로 옴 (공백·콜론·는 허용) */
const MEMO_DIRECTIVE_RE = /(?:^|\s)메모(?:[:：는]?\s+)/;

/** 자연어 메모 요청 (메모도 넣어줘, 메모 남겨, 메모해줘 등) */
const MEMO_NATURAL_INTENT_RE =
  /(?:^|\s)메모(?:도|까지|한번|에|는)?(?:\s+)?(?:넣어|남겨|적어|써|기록|추가|달아|해)(?:\s*줘)?|(?:^|\s)메모\s*(?:좀\s*)?(?:넣어|적어|써)(?:\s*줘)?|(?:^|\s)메모\s*해(?:\s*줘)?/;

const AMOUNT_IN_TEXT_RE = /(\d[\d,]*)\s*(?:원|(만원|천원|백원))/g;

/** 끝 구문(복수 토큰) 서술 패턴 */
const TRAILING_PHRASE_RES: RegExp[] = [
  /\s+[\uAC00-\uD7A3]+러\s+갔(?:어|음|다|을|는|슴)?$/,
  /\s+[\uAC00-\uD7A3]+고\s+있(?:어|음|다|네|슴)?$/,
  /\s+[\uAC00-\uD7A3]+는\s+중$/,
  /\s+[\uAC00-\uD7A3]+다\s+왔(?:어|음|다|슴)?$/,
];

/** 명사형·구어 종결 어미 (먹음, 먹었슴, 마심, 적심 등) — 심/김/참/중은 명사 오탐이 많아 제외 */
const NOMINAL_ACTION_TAIL_RE = /[\uAC00-\uD7A3]+(?:음|슴|냄|움|겸|함|봄)$/;

/** 2글자 명사형 동작 (마심, 적심 등) — 화이트리스트 */
const SHORT_NOMINAL_ACTION_TAILS = new Set(['마심', '적심', '드심', '담심', '씹심']);

/** 어미 패턴과 겹치지만 메모 내용인 명사 — 오탐 방지 */
const ACTION_TAIL_NOUN_BLOCKLIST = new Set([
  '점심',
  '야심',
  '현금',
  '백금',
  '적금',
  '심심',
  '골심',
  '중심',
]);

/** 구어·오타 동작 표현 (먹음 변형) */
const SLANG_ACTION_GOLD_RE = /^(?:머금|무금|먹금)$/;

/** 금액 직전 구간 끝의 반복·할부 힌트 (메모 본문이 아님) */
const TRAILING_RECURRING_HINT_RE =
  /\s+(?:매월|매달|매주|매일|구독|정기|월세|subscription|monthly|recurring|\d+개월(?:\s*할부)?)\s*$/i;

/** 과거·서술 어미 (먹었어, 마셨어, …) */
const PAST_ACTION_TAIL_RE =
  /[\uAC00-\uD7A3]+(?:셨|렸|웠|겼|줬|났|봤|갔|듯|[었았했였])(?:어|음|다|네|지|요|죠|슴)?$/;

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
  if (ACTION_TAIL_NOUN_BLOCKLIST.has(t)) return false;

  if (/^[\uAC00-\uD7A3]{2,}러$/.test(t)) return true;
  if (PAST_ACTION_TAIL_RE.test(t)) return true;
  if (SHORT_NOMINAL_ACTION_TAILS.has(t)) return true;
  if (NOMINAL_ACTION_TAIL_RE.test(t)) return true;
  if (/[\uAC00-\uD7A3]+겠(?:어|음|다|네|지|요|슴)?$/.test(t)) return true;
  if (SLANG_ACTION_GOLD_RE.test(t)) return true;

  return false;
}

function stripTrailingRecurringHints(span: string): string {
  let result = span.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const next = result.replace(TRAILING_RECURRING_HINT_RE, '').trim();
    if (next !== result) {
      result = next;
      changed = true;
    }
  }
  return result;
}

function hasEmbeddedNarrativeToken(text: string): boolean {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.some((token) => looksLikeActionTail(token));
}

function stillHasNarrativeTail(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  for (const re of TRAILING_PHRASE_RES) {
    if (re.test(trimmed)) return true;
  }

  return hasEmbeddedNarrativeToken(trimmed);
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
  let result = stripTrailingRecurringHints(rawSpan);
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
 * Gemini memo 정제를 시도할지 판단합니다.
 * 규칙만으로 이미 깨끗하면(원문과 동일·서술 없음) 스킵해 토큰을 아낍니다.
 */
export function shouldRefineMemoWithAi(rawSpan: string, ruleMemo: string): boolean {
  const raw = rawSpan.trim();
  const ruled = ruleMemo.trim();
  if (raw.length === 0) return false;

  if (ruled.length === 0) {
    return true;
  }

  if (raw === ruled && !stillHasNarrativeTail(ruled) && !hasEmbeddedNarrativeToken(raw)) {
    return false;
  }

  return true;
}

/** @deprecated shouldRefineMemoWithAi 사용 */
export function needsMemoAiRefinement(rawSpan: string, ruleMemo: string): boolean {
  return shouldRefineMemoWithAi(rawSpan, ruleMemo);
}

export type MemoRefinementMode = 'skip' | 'span' | 'full_message';

export interface MemoRefinementPlan {
  mode: MemoRefinementMode;
  rawSpan: string | null;
  ruleMemo: string | null;
  aiInput: string;
}

/**
 * 메모 기록 의도가 있는지 (구조화 지시 또는 자연어 요청).
 */
export function hasMemoIntent(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) return false;

  if (extractMemoRawSpan(normalized) != null) {
    return true;
  }

  return MEMO_NATURAL_INTENT_RE.test(normalized);
}

/**
 * API memo 정제 단계 계획. 의도 없으면 null.
 * - skip: 규칙만으로 충분 (구조화·깨끗)
 * - span: `메모 … 금액` 구간만 AI에 전달
 * - full_message: 자연어 요청 — 전체 문장(+선택적 메인 AI 초안)을 AI에 전달
 */
export function buildMemoRefinementPlan(
  message: string,
  mainAiMemo?: string | null,
): MemoRefinementPlan | null {
  if (!hasMemoIntent(message)) {
    return null;
  }

  const normalized = message.trim();
  const rawSpan = extractMemoRawSpan(normalized);
  const ruled = rawSpan != null ? applyMemoRulesToSpan(rawSpan) : '';
  const ruleMemo = ruled.length > 0 ? ruled : null;

  if (rawSpan != null && !shouldRefineMemoWithAi(rawSpan, ruled)) {
    return {
      mode: 'skip',
      rawSpan,
      ruleMemo,
      aiInput: '',
    };
  }

  if (rawSpan != null) {
    return {
      mode: 'span',
      rawSpan,
      ruleMemo,
      aiInput: rawSpan,
    };
  }

  const draft = typeof mainAiMemo === 'string' ? mainAiMemo.trim() : '';
  const aiInput =
    draft.length > 0
      ? `문장: ${normalized}\n초안(memo): ${draft}`
      : normalized;

  return {
    mode: 'full_message',
    rawSpan: null,
    ruleMemo: null,
    aiInput,
  };
}
