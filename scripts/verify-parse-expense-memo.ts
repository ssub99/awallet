/**
 * parse-expense-memo 규칙 회귀 점검 (Gemini 호출 없음).
 *
 * 사용: npm run verify:memo
 */
import {
  applyMemoRulesToSpan,
  extractMemoFromMessage,
  extractMemoRawSpan,
  looksLikeActionTail,
  shouldRefineMemoWithAi,
} from '../utils/parse-expense-memo';

interface MessageCase {
  label: string;
  message: string;
  rawSpan: string | null;
  memo: string | null;
  shouldAi: boolean | null;
}

interface ActionTailCase {
  token: string;
  isAction: boolean;
}

const MESSAGE_CASES: MessageCase[] = [
  {
    label: '서술 없는 메모',
    message: '메모 형이랑 점심밥 25000원',
    rawSpan: '형이랑 점심밥',
    memo: '형이랑 점심밥',
    shouldAi: false,
  },
  {
    label: '점심 명사 오탐 방지',
    message: '메모 형이랑 점심 25000원',
    rawSpan: '형이랑 점심',
    memo: '형이랑 점심',
    shouldAi: false,
  },
  {
    label: '현금 명사 오탐 방지',
    message: '메모 현금 5000원',
    rawSpan: '현금',
    memo: '현금',
    shouldAi: false,
  },
  {
    label: '백금 반지 복합 명사',
    message: '메모 백금 반지 100000원',
    rawSpan: '백금 반지',
    memo: '백금 반지',
    shouldAi: false,
  },
  {
    label: '과거 서술 제거',
    message: '메모 엄마랑 치킨 먹었어 25000원',
    rawSpan: '엄마랑 치킨 먹었어',
    memo: '엄마랑 치킨',
    shouldAi: true,
  },
  {
    label: '구어 종결 어미',
    message: '메모 엄마랑 치킨 먹었슴 25000원',
    rawSpan: '엄마랑 치킨 먹었슴',
    memo: '엄마랑 치킨',
    shouldAi: true,
  },
  {
    label: '명사형 종결',
    message: '메모 친구랑 밥 먹음 18000원',
    rawSpan: '친구랑 밥 먹음',
    memo: '친구랑 밥',
    shouldAi: true,
  },
  {
    label: '점심 + 먹음 (점심 유지)',
    message: '메모 점심 먹음 15000원',
    rawSpan: '점심 먹음',
    memo: '점심',
    shouldAi: true,
  },
  {
    label: '구어 오타 머금',
    message: '메모 형 머금 5000원',
    rawSpan: '형 머금',
    memo: '형',
    shouldAi: true,
  },
  {
    label: '구어 오타 무금',
    message: '메모 형 무금 5000원',
    rawSpan: '형 무금',
    memo: '형',
    shouldAi: true,
  },
  {
    label: '반복 힌트 매월 + 서술',
    message: '메모 엄마랑 치킨 먹었어 매월 25000원',
    rawSpan: '엄마랑 치킨 먹었어 매월',
    memo: '엄마랑 치킨',
    shouldAi: true,
  },
  {
    label: '메모는 접두',
    message: '메모는 형이랑 점심 25000원',
    rawSpan: '형이랑 점심',
    memo: '형이랑 점심',
    shouldAi: false,
  },
  {
    label: '문장 중간 메모 지시',
    message: '신한카드 메모 초이한테 박카스랑 계란 4800원',
    rawSpan: '초이한테 박카스랑 계란',
    memo: '초이한테 박카스랑 계란',
    shouldAi: false,
  },
  {
    label: '콤마 금액',
    message: '메모 계란 4,800원',
    rawSpan: '계란',
    memo: '계란',
    shouldAi: false,
  },
  {
    label: '원 없는 금액 — 미지원',
    message: '메모 계란 4800',
    rawSpan: null,
    memo: null,
    shouldAi: null,
  },
  {
    label: '메모 지시 없음',
    message: '계란 4800원',
    rawSpan: null,
    memo: null,
    shouldAi: null,
  },
];

const ACTION_TAIL_CASES: ActionTailCase[] = [
  { token: '점심', isAction: false },
  { token: '현금', isAction: false },
  { token: '백금', isAction: false },
  { token: '먹음', isAction: true },
  { token: '먹었슴', isAction: true },
  { token: '머금', isAction: true },
  { token: '무금', isAction: true },
  { token: '마심', isAction: true },
  { token: '먹었어', isAction: true },
];

function assertEqual<T>(label: string, actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function runMessageCases(): number {
  let passed = 0;

  for (const testCase of MESSAGE_CASES) {
    const prefix = `[${testCase.label}]`;

    const rawSpan = extractMemoRawSpan(testCase.message);
    assertEqual(`${prefix} rawSpan`, rawSpan, testCase.rawSpan);

    const memo = extractMemoFromMessage(testCase.message);
    assertEqual(`${prefix} memo`, memo, testCase.memo);

    if (testCase.shouldAi === null) {
      if (rawSpan != null) {
        throw new Error(`${prefix} shouldAi: expected null gate but rawSpan exists`);
      }
    } else {
      const ruled = rawSpan != null ? applyMemoRulesToSpan(rawSpan) : '';
      const shouldAi = shouldRefineMemoWithAi(rawSpan ?? '', ruled);
      assertEqual(`${prefix} shouldAi`, shouldAi, testCase.shouldAi);
    }

    passed += 1;
  }

  return passed;
}

function runActionTailCases(): number {
  let passed = 0;

  for (const testCase of ACTION_TAIL_CASES) {
    const actual = looksLikeActionTail(testCase.token);
    assertEqual(`looksLikeActionTail(${testCase.token})`, actual, testCase.isAction);
    passed += 1;
  }

  return passed;
}

function main(): void {
  const messagePassed = runMessageCases();
  const actionPassed = runActionTailCases();
  const total = messagePassed + actionPassed;

  console.log(`verify-parse-expense-memo: ${total} cases passed`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`verify-parse-expense-memo: FAILED — ${message}`);
  process.exit(1);
}
