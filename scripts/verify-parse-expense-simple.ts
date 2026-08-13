/**
 * parse-expense-simple / slots 규칙 회귀 점검 (Gemini 호출 없음).
 *
 * 사용: npm run verify:simple
 */
import {
  isSimpleExpenseCandidate,
  tryParseSimpleExpense,
} from '../utils/parse-expense-simple';
import { extractParseExpenseSlots } from '../utils/parse-expense-slots';

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
  recordType?: 'expense' | 'income';
  isRecurring?: boolean;
  isInstallment?: boolean;
  recurringType?: string;
  memo?: string;
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
    label: '어순: 금액→카테고리',
    message: '4800원 식비',
    candidate: true,
    category: '식비',
    amount: 4800,
    date: TODAY,
  },
  {
    label: '어순: 날짜→금액→카테고리',
    message: '어제 3500원 교통',
    candidate: true,
    category: '교통',
    amount: 3500,
    date: '2026.06.26',
  },
  {
    label: '구조화 메모 + 어순',
    message: '식비 8000원 메모 점심',
    candidate: true,
    category: '식비',
    amount: 8000,
    date: TODAY,
    memo: '점심',
  },
  {
    label: '정기 포함',
    message: '구독 서비스 13500원 매달',
    candidate: true,
    category: '구독 서비스',
    amount: 13500,
    date: TODAY,
    isRecurring: true,
    recurringType: '매월',
  },
  {
    label: '할부 포함',
    message: '쇼핑 30만원 3개월 할부',
    candidate: true,
    category: '쇼핑',
    amount: 300_000,
    date: TODAY,
    isInstallment: true,
  },
  {
    label: '수입',
    message: '월급 300만원',
    candidate: true,
    // 카테고리 목록에 월급 없음 → parse null, but candidate may be true with amount
    // Use a category that matches: add 급여 to message with category list
    // Actually '월급' is income hint but category won't match - expect parse fail
    // Change to: categories need 급여 - message '급여 월급 300만원' weird
    // Better: CATEGORIES includes nothing for income - skip parse expect
    category: undefined,
    amount: 3_000_000,
  },
  {
    label: '자연어 메모 → 스킵(AI)',
    message: '식비 치킨 먹었는데 25000원 메모도 넣어줘',
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

  // 수입 + 카테고리 미매칭: candidate true, parse null 허용
  if (c.label === '수입') {
    if (parsed != null) {
      console.error(`[FAIL] ${c.label}: expected null without income category`);
      failed += 1;
    }
    continue;
  }

  if (parsed == null || parsed.records.length !== 1) {
    console.error(`[FAIL] ${c.label}: parse returned null or empty`);
    failed += 1;
    continue;
  }

  const r = parsed.records[0];
  const checks: [string, unknown, unknown][] = [
    ['category', r.category, c.category],
    ['amount', r.amount, c.amount],
    ['date', r.date, c.date],
    ['paymentMethod', r.paymentMethod, c.paymentMethod ?? (c.recordType === 'income' ? undefined : 'credit')],
    ['paymentSubtypeLabel', r.paymentSubtypeLabel, c.paymentSubtypeLabel],
    ['memo', r.memo, c.memo],
    ['isRecurring', !!r.isRecurring, !!c.isRecurring],
    ['isInstallment', !!r.isInstallment, !!c.isInstallment],
    ['recurringType', r.recurringType, c.recurringType],
  ];

  for (const [field, actual, expected] of checks) {
    if (expected === undefined) continue;
    if (actual !== expected) {
      console.error(`[FAIL] ${c.label}: ${field} expected ${expected}, got ${actual}`);
      failed += 1;
    }
  }
}

// 슬롯 추출: 코어 3개 어순 몇 가지
const ORDER_CASES: { message: string; category: string; amount: number }[] = [
  { message: '식비 8000원', category: '식비', amount: 8000 },
  { message: '8000원 식비', category: '식비', amount: 8000 },
  { message: '식비 어제 8000원', category: '식비', amount: 8000 },
  { message: '8000원 어제 식비', category: '식비', amount: 8000 },
  { message: '어제 식비 8000원', category: '식비', amount: 8000 },
];

for (const o of ORDER_CASES) {
  const slots = extractParseExpenseSlots(o.message, TODAY, CATEGORIES);
  if (slots.category !== o.category || slots.amount !== o.amount || slots.date == null) {
    console.error(`[FAIL] order slot: ${o.message}`, slots);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed.`);
  process.exit(1);
}

console.log(`All ${CASES.length} simple-parse cases + ${ORDER_CASES.length} order slots passed.`);
