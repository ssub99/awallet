/**
 * parse-expense-simple 규칙 회귀 점검 (Gemini 호출 없음).
 *
 * 사용: npm run verify:simple
 */
import {
  isSimpleExpenseCandidate,
  tryParseSimpleExpense,
} from '../utils/parse-expense-simple';

const TODAY = '2026.06.27';
const CATEGORIES = ['식비', '쇼핑', '교통', '구독 서비스'];
const PAYMENT_SUBTYPES = [
  { type: 'credit' as const, label: '신한카드' },
  { type: 'debit' as const, label: '국민체크' },
];

interface Case {
  label: string;
  message: string;
  candidate: boolean;
  category?: string;
  amount?: number;
  date?: string;
  paymentMethod?: 'credit' | 'debit' | 'cash';
  paymentSubtypeLabel?: string;
}

const CASES: Case[] = [
  {
    label: '기본 단순',
    message: '식비 계란 4800원',
    candidate: true,
    category: '식비',
    amount: 4800,
    date: TODAY,
  },
  {
    label: '카테고리+만원',
    message: '식비 점심 2만원',
    candidate: true,
    category: '식비',
    amount: 20_000,
    date: TODAY,
  },
  {
    label: '신한카드',
    message: '신한카드 쇼핑 15000원',
    candidate: true,
    category: '쇼핑',
    amount: 15_000,
    paymentMethod: 'credit',
    paymentSubtypeLabel: '신한카드',
    date: TODAY,
  },
  {
    label: '어제',
    message: '교통 3500원 어제',
    candidate: true,
    category: '교통',
    amount: 3500,
    date: '2026.06.26',
  },
  {
    label: '메모 의도 → 스킵',
    message: '메모 치킨 25000원',
    candidate: false,
  },
  {
    label: '정기 → 스킵',
    message: '구독 서비스 8000원 매달',
    candidate: false,
  },
  {
    label: '금액 없음 → 스킵',
    message: '식비 점심',
    candidate: false,
  },
  {
    label: '복수 금액 → 스킵',
    message: '식비 3000원 교통 2000원',
    candidate: false,
  },
];

let failed = 0;

for (const c of CASES) {
  const candidate = isSimpleExpenseCandidate(c.message, 0);
  if (candidate !== c.candidate) {
    console.error(`[FAIL] ${c.label}: candidate expected ${c.candidate}, got ${candidate}`);
    failed += 1;
    continue;
  }

  if (!c.candidate) {
    const parsed = tryParseSimpleExpense(c.message, CATEGORIES, TODAY, PAYMENT_SUBTYPES);
    if (parsed != null) {
      console.error(`[FAIL] ${c.label}: expected null parse, got`, parsed);
      failed += 1;
    }
    continue;
  }

  const parsed = tryParseSimpleExpense(c.message, CATEGORIES, TODAY, PAYMENT_SUBTYPES);
  if (parsed == null || parsed.records.length !== 1) {
    console.error(`[FAIL] ${c.label}: parse returned null or empty`);
    failed += 1;
    continue;
  }

  const r = parsed.records[0];
  const checks: Array<[string, unknown, unknown]> = [
    ['category', r.category, c.category],
    ['amount', r.amount, c.amount],
    ['date', r.date, c.date],
    ['paymentMethod', r.paymentMethod, c.paymentMethod ?? 'credit'],
    ['paymentSubtypeLabel', r.paymentSubtypeLabel, c.paymentSubtypeLabel],
  ];

  for (const [field, actual, expected] of checks) {
    if (expected === undefined) continue;
    if (actual !== expected) {
      console.error(`[FAIL] ${c.label}: ${field} expected ${expected}, got ${actual}`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}

console.log(`All ${CASES.length} simple-parse cases passed.`);
