/**
 * 간편생성(parse-expense) 수동 테스트 — 앱과 동일하게
 * 1) 로컬 Simple/슬롯
 * 2) 실패 시 Vercel parse-expense API (Gemini 포함)
 *
 * 사용:
 *   npx tsx scripts/try-parse-expense.ts "오늘 맥주 사마셨어. 오만원 메모도 넣어."
 *   npm run try:parse -- "식비 오천원"
 *
 * 환경(선택):
 *   AWALLET_API_BASE_URL  기본: stage(ing) 호스트
 *   AWALLET_INTERNAL_API_SECRET
 */

import {
  isSimpleExpenseCandidate,
  tryParseSimpleExpense,
} from '../utils/parse-expense-simple';
import { extractParseExpenseSlots } from '../utils/parse-expense-slots';
import { applySyncParseExpenseReviews } from '../utils/parse-expense-reviews';

const DEFAULT_STAGE_API =
  'https://awallet-git-ing-awallet-vercel-api.vercel.app';
const INTERNAL_API_SECRET_FALLBACK = 'awallet-internal-2026-Yv9pZQkR8F2M';

const DEFAULT_CATEGORIES = [
  '식비',
  '카페',
  '술',
  '교통',
  '쇼핑',
  '생활',
  '주거',
  '의료',
  '문화',
  '급여',
  '용돈',
];

function todayDot(): string {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function resolveSecret(): string {
  return (
    process.env.AWALLET_INTERNAL_API_SECRET?.trim() ||
    process.env.EXPO_PUBLIC_AWALLET_INTERNAL_API_SECRET?.trim() ||
    INTERNAL_API_SECRET_FALLBACK
  );
}

function resolveApiBase(): string {
  const fromEnv =
    process.env.AWALLET_API_BASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_AWALLET_API_BASE_URL?.trim();
  return (fromEnv || DEFAULT_STAGE_API).replace(/\/+$/, '');
}

async function main(): Promise<void> {
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) {
    console.error('사용법: npx tsx scripts/try-parse-expense.ts "문장"');
    process.exit(1);
  }

  const today = todayDot();
  const categories = DEFAULT_CATEGORIES;
  const apiBase = resolveApiBase();

  console.log('=== 간편생성 테스트 (앱 경로와 동일) ===');
  console.log('message:', message);
  console.log('today:', today);
  console.log('api:', `${apiBase}/api/parse-expense`);
  console.log('');

  // 1) 로컬 슬롯 진단
  const slots = extractParseExpenseSlots(message, today, categories);
  console.log('--- 1) 로컬 슬롯 ---');
  console.log(JSON.stringify(slots, null, 2));
  console.log('');

  // 2) Simple (API와 동일 게이트)
  const candidate = isSimpleExpenseCandidate(message, 0);
  console.log('--- 2) Simple ---');
  console.log('candidate:', candidate);
  let simple = tryParseSimpleExpense(message, categories, today);
  if (simple != null) {
    simple = applySyncParseExpenseReviews(message, today, simple) as typeof simple;
    console.log('result: Simple 성공 (Gemini 생략)');
    console.log(JSON.stringify(simple, null, 2));
    return;
  }
  console.log('result: Simple 실패 → API(Gemini) 호출');
  console.log('');

  // 3) 앱과 같이 parse-expense API
  console.log('--- 3) parse-expense API ---');
  const res = await fetch(`${apiBase}/api/parse-expense`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-awallet-internal-secret': resolveSecret(),
      'x-device-id': 'cli-try-parse',
    },
    body: JSON.stringify({ message, categories, today }),
  });

  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    // keep raw
  }

  console.log('status:', res.status);
  console.log(JSON.stringify(body, null, 2));

  if (!res.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
