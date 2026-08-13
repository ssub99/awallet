/**
 * parse-expense-slots 어순·생략 회귀 (Gemini 없음).
 * 사용: npm run verify:slots
 */
import { extractParseExpenseSlots } from '../utils/parse-expense-slots';

const TODAY = '2026.07.31';
const CATEGORIES = ['식비', '교통', '쇼핑', '급여'];

type Expect = {
  category?: string;
  amount?: number;
  date?: string;
  recordType?: 'expense' | 'income';
  memo?: string | null;
  isRecurring?: boolean;
  isInstallment?: boolean;
  rejectReason?: string | null;
};

const CASES: { label: string; message: string; expect: Expect }[] = [
  {
    label: 'min: type+category+amount',
    message: '식비 9000원',
    expect: { category: '식비', amount: 9000, date: TODAY, recordType: 'expense', rejectReason: null },
  },
  {
    label: 'order amount-category',
    message: '9000원 식비',
    expect: { category: '식비', amount: 9000, date: TODAY, rejectReason: null },
  },
  {
    label: 'order date-amount-category',
    message: '어제 9000원 식비',
    expect: { category: '식비', amount: 9000, date: '2026.07.30', rejectReason: null },
  },
  {
    label: 'order category-date-amount',
    message: '식비 어제 9000원',
    expect: { category: '식비', amount: 9000, date: '2026.07.30', rejectReason: null },
  },
  {
    label: 'optional memo trailing',
    message: '식비 9000원 메모 김밥',
    expect: { category: '식비', amount: 9000, memo: '김밥', rejectReason: null },
  },
  {
    label: 'optional series',
    message: '매달 식비 9000원',
    expect: { category: '식비', amount: 9000, isRecurring: true, rejectReason: null },
  },
  {
    label: 'optional installment',
    message: '쇼핑 12만원 6개월 할부',
    expect: { category: '쇼핑', amount: 120_000, isInstallment: true, rejectReason: null },
  },
  {
    label: 'income + category',
    message: '급여 월급 200만원',
    expect: { category: '급여', amount: 2_000_000, recordType: 'income', rejectReason: null },
  },
  {
    label: 'omit date ok',
    message: '교통 1500원',
    expect: { category: '교통', amount: 1500, date: TODAY, rejectReason: null },
  },
  {
    label: 'natural memo needs ai',
    message: '식비 9000원 메모도 넣어줘',
    expect: { rejectReason: 'memo_needs_ai' },
  },
];

let failed = 0;

for (const c of CASES) {
  const slots = extractParseExpenseSlots(c.message, TODAY, CATEGORIES);
  const e = c.expect;

  const checks: [string, unknown, unknown][] = [
    ['rejectReason', slots.rejectReason ?? null, e.rejectReason === undefined ? null : e.rejectReason],
    ['category', slots.category, e.category],
    ['amount', slots.amount, e.amount],
    ['date', slots.date, e.date],
    ['recordType', slots.recordType, e.recordType],
    ['memo', slots.memo ?? null, e.memo],
    ['isRecurring', !!slots.isRecurring, e.isRecurring],
    ['isInstallment', !!slots.isInstallment, e.isInstallment],
  ];

  for (const [field, actual, expected] of checks) {
    if (expected === undefined) continue;
    if (actual !== expected) {
      console.error(`[FAIL] ${c.label}: ${field} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      failed += 1;
    }
  }
  if (failed === 0 || true) {
    // continue counting all field fails
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}

console.log(`verify-parse-expense-slots: ${CASES.length} cases passed`);
