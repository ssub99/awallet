import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateRecordId } from './id-generator';

const INCOME_STORAGE_KEY = 'incomeData';

export interface IncomeRecord {
  id?: string; // UUID v4 (생성 시 자동 할당)
  type: 'income';
  amount: number;
  date: string; // YYYY.MM.DD
  memo?: string;
  timestamp: number;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

const DATE_TOKEN_REGEX = /\./g;

function normalizeIncome(record: IncomeRecord): IncomeRecord {
  return {
    ...record,
    id: record.id ?? generateRecordId(),
    type: 'income',
    isDeleted: record.isDeleted ?? false,
    deletedAt: record.deletedAt ?? null,
  };
}

function sortIncomesAscending(records: IncomeRecord[]): IncomeRecord[] {
  return [...records].sort((a, b) => a.timestamp - b.timestamp);
}

async function persistIncomes(records: IncomeRecord[]): Promise<void> {
  const normalized = records.map(normalizeIncome);
  const sorted = sortIncomesAscending(normalized);
  await AsyncStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(sorted));
}

async function loadLocalIncomes(): Promise<IncomeRecord[]> {
  try {
    const stored = await AsyncStorage.getItem(INCOME_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortIncomesAscending(
      parsed.map((item) =>
        normalizeIncome({
          ...item,
          timestamp: typeof item.timestamp === 'number' ? item.timestamp : Number(item.timestamp),
        }),
      ),
    );
  } catch (error) {
    console.error('[incomes] Failed to load local incomes:', error);
    return [];
  }
}

function isWithinDateRange(date: string, startDate: string, endDate: string): boolean {
  const normalizedDate = date.replace(DATE_TOKEN_REGEX, '');
  const normalizedStart = startDate.replace(DATE_TOKEN_REGEX, '');
  const normalizedEnd = endDate.replace(DATE_TOKEN_REGEX, '');
  return normalizedDate >= normalizedStart && normalizedDate <= normalizedEnd;
}

export async function createIncome(record: IncomeRecord): Promise<IncomeRecord> {
  const income = normalizeIncome(record);
  const existing = await loadLocalIncomes();
  const filtered = existing.filter(
    (item) =>
      !(item.id && income.id && item.id === income.id) && item.timestamp !== income.timestamp,
  );
  filtered.push(income);
  await persistIncomes(filtered);
  return income;
}

export async function updateIncome(
  id: string,
  updates: Partial<IncomeRecord>,
): Promise<IncomeRecord | null> {
  const incomes = await loadLocalIncomes();
  let updated: IncomeRecord | null = null;

  const next = incomes.map((income) => {
    if (income.id === id || income.timestamp.toString() === id) {
      updated = normalizeIncome({
        ...income,
        ...updates,
        id: income.id ?? id,
      });
      return updated;
    }
    return income;
  });

  if (!updated) {
    return null;
  }

  await persistIncomes(next);
  return updated;
}

export async function softDeleteIncome(id: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  await updateIncome(id, { isDeleted: true, deletedAt });
}

export async function getIncomeById(id: string): Promise<IncomeRecord | null> {
  const incomes = await loadLocalIncomes();
  return (
    incomes.find(
      (income) => income.id === id || income.timestamp.toString() === id,
    ) ?? null
  );
}

export async function getIncomesByDateRange(
  startDate: string,
  endDate: string,
): Promise<IncomeRecord[]> {
  const incomes = await loadLocalIncomes();
  return incomes.filter(
    (income) =>
      !income.isDeleted && isWithinDateRange(income.date, startDate, endDate),
  );
}

export async function getAllIncomes(): Promise<IncomeRecord[]> {
  return loadLocalIncomes();
}

export async function clearAllIncomes(): Promise<void> {
  await AsyncStorage.removeItem(INCOME_STORAGE_KEY);
}


