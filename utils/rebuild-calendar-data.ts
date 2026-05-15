import { getAllExpenses } from '@/utils/expenses';
import { getAllIncomes } from '@/utils/incomes';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CALENDAR_DATA_KEY = 'calendarData';

type CalendarBucket = {
  totalExpense: number;
  totalIncome: number;
  records: Record<string, unknown>[];
};

/**
 * expenseData / incomeData 기준으로 calendarData를 전체 재구성합니다.
 * (지출 기록 화면의 rebuildCalendarData와 동일한 동작)
 */
export async function rebuildCalendarDataFromStores(): Promise<void> {
  const [expenses, incomes] = await Promise.all([getAllExpenses(), getAllIncomes()]);

  const calendarData: Record<string, CalendarBucket> = {};

  expenses.forEach((expense) => {
    if (expense.isDeleted) {
      return;
    }

    const dateKey = expense.date.replace(/\./g, '-');
    if (!calendarData[dateKey]) {
      calendarData[dateKey] = { totalExpense: 0, totalIncome: 0, records: [] };
    }

    calendarData[dateKey].records.push({
      ...expense,
      type: 'expense',
      originalAmountBeforeRefund: expense.originalAmountBeforeRefund,
    });

    if (!expense.isRefunded) {
      calendarData[dateKey].totalExpense += expense.amount || 0;
    }
  });

  incomes.forEach((income) => {
    if (income.isDeleted) {
      return;
    }

    const dateKey = income.date.replace(/\./g, '-');
    if (!calendarData[dateKey]) {
      calendarData[dateKey] = { totalExpense: 0, totalIncome: 0, records: [] };
    }

    calendarData[dateKey].records.push({
      ...income,
      type: 'income',
      category: income.category ?? '수입',
    });
    calendarData[dateKey].totalIncome += income.amount || 0;
  });

  Object.keys(calendarData).forEach((dateKey) => {
    const bucket = calendarData[dateKey];
    if (!bucket.records || bucket.records.length === 0) {
      delete calendarData[dateKey];
    }
  });

  const stringified = JSON.stringify(calendarData, (key, value) => {
    if (key === 'recurringType' && value === undefined) {
      return null;
    }
    return value;
  });

  await AsyncStorage.setItem(CALENDAR_DATA_KEY, stringified);
}
