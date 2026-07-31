/**
 * parse-expense-reviews 규칙 회귀 점검 (Gemini 호출 없음).
 * 실행: npx tsx scripts/verify-parse-expense-reviews.ts
 */

import {
  applySyncParseExpenseReviews,
  hasIncomeHintInMessage,
  reviewRecordTypeAndSeries,
} from '../utils/parse-expense-reviews';

type Case = {
  name: string;
  message: string;
  today: string;
  input: {
    recordType?: 'expense' | 'income';
    category: string;
    date: string;
    amount: number;
    isRecurring?: boolean;
    isInstallment?: boolean;
    recurringType?: string;
    totalMonths?: number;
    weekendOption?: 'weekend' | 'friday' | 'monday';
    memo?: string;
  };
  expect: {
    recordType?: 'expense' | 'income';
    isRecurring?: boolean;
    isInstallment?: boolean;
    recurringType?: string;
    date?: string;
    weekendOption?: 'weekend' | 'friday' | 'monday';
    memo?: string;
  };
};

const cases: Case[] = [
  {
    name: 'income hint forces income and clears series',
    message: '월급 300만원',
    today: '2026.07.31',
    input: {
      recordType: 'expense',
      category: '급여',
      date: '2026.07.31',
      amount: 3_000_000,
      isRecurring: true,
      recurringType: '매월',
      totalMonths: 12,
    },
    expect: {
      recordType: 'income',
      isRecurring: undefined,
    },
  },
  {
    name: 'recurring hint fills isRecurring',
    message: '넷플릭스 구독 13500원',
    today: '2026.07.31',
    input: {
      category: '구독',
      date: '2026.07.31',
      amount: 13500,
    },
    expect: {
      isRecurring: true,
      recurringType: '매월',
    },
  },
  {
    name: 'installment hint fills isInstallment',
    message: '노트북 120만원 3개월 할부',
    today: '2026.07.31',
    input: {
      category: '전자기기',
      date: '2026.07.31',
      amount: 1_200_000,
    },
    expect: {
      isInstallment: true,
    },
  },
  {
    name: 'relative weekday overrides date',
    message: '이번주 월요일 점심 8000원',
    today: '2026.07.31', // Friday
    input: {
      category: '식비',
      date: '2026.07.31',
      amount: 8000,
    },
    expect: {
      date: '2026.07.27',
    },
  },
  {
    name: 'monthly + weekend option friday (not weekend recurring)',
    message:
      '매달 31일에 건강보험 22982원 주말옵션은 금요일에 나가도록 해줘 메모도 넣어주고',
    today: '2026.07.31',
    input: {
      category: '세금',
      date: '2026.07.01',
      amount: 22982,
      isRecurring: true,
      recurringType: '주말',
      weekendOption: 'weekend',
      memo: '건강보험 주말옵션',
    },
    expect: {
      isRecurring: true,
      recurringType: '매월',
      date: '2026.07.31',
      weekendOption: 'friday',
      memo: '건강보험',
    },
  },
];

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

let passed = 0;
for (const c of cases) {
  if (c.name.startsWith('income')) {
    if (!hasIncomeHintInMessage(c.message)) {
      throw new Error(`${c.name}: income hint not detected`);
    }
  }

  const reviewed = reviewRecordTypeAndSeries(c.message, { ...c.input });
  const result = applySyncParseExpenseReviews(c.message, c.today, {
    records: [reviewed],
    suggestedCategory: null,
    reply: null,
  });
  const out = result.records[0];

  if (c.expect.recordType !== undefined) {
    assertEqual(out.recordType, c.expect.recordType, `${c.name} recordType`);
  }
  if (c.expect.isRecurring !== undefined) {
    assertEqual(!!out.isRecurring, c.expect.isRecurring, `${c.name} isRecurring`);
  }
  if ('isRecurring' in c.expect && c.expect.isRecurring === undefined) {
    assertEqual(out.isRecurring, undefined, `${c.name} isRecurring cleared`);
  }
  if (c.expect.isInstallment !== undefined) {
    assertEqual(!!out.isInstallment, c.expect.isInstallment, `${c.name} isInstallment`);
  }
  if (c.expect.recurringType !== undefined) {
    assertEqual(out.recurringType, c.expect.recurringType, `${c.name} recurringType`);
  }
  if (c.expect.date !== undefined) {
    assertEqual(out.date, c.expect.date, `${c.name} date`);
  }
  if (c.expect.weekendOption !== undefined) {
    assertEqual(out.weekendOption, c.expect.weekendOption, `${c.name} weekendOption`);
  }
  if (c.expect.memo !== undefined) {
    assertEqual(out.memo, c.expect.memo, `${c.name} memo`);
  }
  passed += 1;
  console.log(`ok  ${c.name}`);
}

console.log(`verify-parse-expense-reviews: ${passed} cases passed`);
