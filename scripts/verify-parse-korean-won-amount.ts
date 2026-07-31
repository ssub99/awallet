/**
 * 한글·혼합 원화 금액 파서 회귀.
 * 사용: npx tsx scripts/verify-parse-korean-won-amount.ts
 */
import {
  collectKoreanWonAmountsFromMessage,
  parseKoreanWonExpression,
} from '../utils/parse-korean-won-amount';
import { collectAmountsFromMessage, extractParseExpenseSlots } from '../utils/parse-expense-slots';

const EXPR_CASES: Array<[string, number]> = [
  ['오천', 5_000],
  ['오만', 50_000],
  ['일만1천', 11_000],
  ['1억오천', 100_005_000],
  ['삼만오천', 35_000],
  ['십이만', 120_000],
  ['이백삼십', 230],
  ['1만5천', 15_000],
  ['만오천', 15_000],
  ['억', 100_000_000],
];

const MESSAGE_CASES: Array<[string, number]> = [
  ['오늘 맥주 사마셨어. 오만원 메모도 넣어.', 50_000],
  ['오천원 썼어', 5_000],
  ['일만1천원 결제', 11_000],
  ['1억 오천원', 100_005_000],
  ['식비 삼만오천원', 35_000],
];

let failed = 0;

for (const [expr, expected] of EXPR_CASES) {
  const actual = parseKoreanWonExpression(expr);
  if (actual !== expected) {
    console.error(`[FAIL] expr "${expr}": expected ${expected}, got ${actual}`);
    failed += 1;
  }
}

for (const [message, expected] of MESSAGE_CASES) {
  const korean = collectKoreanWonAmountsFromMessage(message);
  const all = [...new Set(collectAmountsFromMessage(message))];
  if (!all.includes(expected)) {
    console.error(`[FAIL] message amount "${message}": expected ${expected} in`, all, 'korean', korean);
    failed += 1;
  }
}

// 사용자 문장: 금액은 잡히고, 메모 AI 필요로 Simple은 스킵될 수 있음
const userMsg = '오늘 맥주 사마셨어. 오만원 메모도 넣어.';
const slots = extractParseExpenseSlots(userMsg, '2026.07.31', ['식비', '술']);
if (slots.amount !== 50_000) {
  console.error('[FAIL] user message slots.amount', slots);
  failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}

console.log(
  `verify-parse-korean-won-amount: ${EXPR_CASES.length} exprs + ${MESSAGE_CASES.length} messages passed`,
);
