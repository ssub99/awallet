/**
 * 간편입력(parse-expense)용: "메모 … 금액" 지시에서 memo 필드를 규칙으로 추출합니다.
 * LLM이 메모 구간을 잘못 자르는 경우 API·앱 후처리에 사용합니다.
 */

/** `메모` 지시 접두 (공백·콜론·는 허용) */
const MEMO_DIRECTIVE_RE = /(?:^|\s)메모(?:[:：는]?\s+)/;

const AMOUNT_IN_TEXT_RE = /(\d[\d,]*)\s*(?:원|(만원|천원|백원))/g;

/** 금액 직전 구간 끝에서 제거할 서술·동작 표현 */
const NARRATIVE_SUFFIX_RES: RegExp[] = [
  /\s+(?:먹으러|사러|마시러|보러|타러)\s*갔(?:어|음|다)?$/,
  /\s+(?:먹었|마셨|썼|샀|했|갔|봤|들었|줬|받았|탔|결제했|사용했|이용했|벌었|썼)(?:어|음|다)?$/,
  /\s+먹음$/,
];

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

function stripTrailingNarrative(memo: string): string {
  let result = memo.trim();
  if (result.length === 0) return result;

  let changed = true;
  while (changed) {
    changed = false;
    for (const re of NARRATIVE_SUFFIX_RES) {
      const next = result.replace(re, '').trim();
      if (next !== result) {
        result = next;
        changed = true;
        break;
      }
    }
  }

  return result;
}

/**
 * 메시지에 `메모` 지시가 있으면, 메모 키워드 다음부터 첫 금액 전까지를 memo로 반환합니다.
 * 끝의 서술(먹었어, 썼어 등)은 제거합니다. 지시가 없으면 null.
 */
export function extractMemoFromMessage(message: string): string | null {
  const normalized = message.trim();
  if (normalized.length === 0) return null;

  const directiveMatch = MEMO_DIRECTIVE_RE.exec(normalized);
  if (!directiveMatch || directiveMatch.index === undefined) return null;

  const memoContentStart = directiveMatch.index + directiveMatch[0].length;
  const amountIndex = findFirstAmountIndex(normalized, memoContentStart);
  if (amountIndex === null || amountIndex <= memoContentStart) return null;

  const rawSpan = normalized.slice(memoContentStart, amountIndex).trim();
  const memo = stripTrailingNarrative(rawSpan);
  return memo.length > 0 ? memo : null;
}
