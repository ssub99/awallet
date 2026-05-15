import { type PaymentMethod, type ExpenseRecord } from '@/utils/expenses';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PaymentSubtypeType = 'credit' | 'debit';

export interface PaymentSubtype {
  id: string;
  type: PaymentSubtypeType;
  label: string;
  description: string;
  color: string;
}

const PAYMENT_SUBTYPES_STORAGE_KEY = 'paymentSubtypes';
const LEGACY_PAYMENT_SUBTYPES_STORAGE_KEY = 'paymentSubtypes_v1';

export const DEFAULT_PAYMENT_SUBTYPES: PaymentSubtype[] = [
  {
    id: 'credit-default',
    type: 'credit',
    label: '신용카드',
    description: '기본 결제 유형',
    color: '#3664CE',
  },
  {
    id: 'debit-default',
    type: 'debit',
    label: '체크카드',
    description: '기본 결제 유형',
    color: '#07B63B',
  },
];

function isPaymentSubtype(value: unknown): value is PaymentSubtype {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PaymentSubtype;
  return (
    typeof candidate.id === 'string' &&
    (candidate.type === 'credit' || candidate.type === 'debit') &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.color === 'string'
  );
}

function normalizePaymentSubtypes(input: PaymentSubtype[]): PaymentSubtype[] {
  const valid = input.filter(isPaymentSubtype);
  const hasCredit = valid.some((item) => item.type === 'credit');
  const hasDebit = valid.some((item) => item.type === 'debit');
  const normalized = [...valid];

  if (!hasCredit) {
    normalized.push(DEFAULT_PAYMENT_SUBTYPES.find((item) => item.type === 'credit')!);
  }
  if (!hasDebit) {
    normalized.push(DEFAULT_PAYMENT_SUBTYPES.find((item) => item.type === 'debit')!);
  }

  return normalized;
}

export async function loadPaymentSubtypes(): Promise<PaymentSubtype[]> {
  try {
    let stored = await AsyncStorage.getItem(PAYMENT_SUBTYPES_STORAGE_KEY);
    if (!stored) {
      const legacy = await AsyncStorage.getItem(LEGACY_PAYMENT_SUBTYPES_STORAGE_KEY);
      if (legacy) {
        stored = legacy;
        await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, legacy);
        await AsyncStorage.removeItem(LEGACY_PAYMENT_SUBTYPES_STORAGE_KEY);
      }
    }
    if (!stored) {
      const defaults = normalizePaymentSubtypes(DEFAULT_PAYMENT_SUBTYPES);
      await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      const defaults = normalizePaymentSubtypes(DEFAULT_PAYMENT_SUBTYPES);
      await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const normalized = normalizePaymentSubtypes(parsed as PaymentSubtype[]);
    await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.error('결제 유형 설정 로드 실패:', error);
    return normalizePaymentSubtypes(DEFAULT_PAYMENT_SUBTYPES);
  }
}

export async function initializePaymentSubtypes(): Promise<PaymentSubtype[]> {
  const loaded = await loadPaymentSubtypes();
  const normalized = normalizePaymentSubtypes(loaded);
  await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function savePaymentSubtypes(subtypes: PaymentSubtype[]): Promise<void> {
  const normalized = normalizePaymentSubtypes(subtypes);
  await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(normalized));
}

export function getDefaultSubtypeIdByMethod(
  method: PaymentSubtypeType,
  subtypes: PaymentSubtype[],
): string {
  const found = subtypes.find((item) => item.type === method);
  if (found) return found.id;
  return method === 'credit' ? 'credit-default' : 'debit-default';
}

export function resolvePaymentSubtypeId(
  paymentMethod: PaymentMethod | undefined,
  paymentSubtypeId: string | undefined,
  subtypes: PaymentSubtype[],
): string | undefined {
  if (paymentMethod === 'cash') {
    return undefined;
  }

  const method: PaymentSubtypeType = paymentMethod === 'debit' ? 'debit' : 'credit';
  const found = paymentSubtypeId
    ? subtypes.find((item) => item.id === paymentSubtypeId && item.type === method)
    : undefined;
  if (found) {
    return found.id;
  }
  return getDefaultSubtypeIdByMethod(method, subtypes);
}

export function migrateExpensePaymentSubtypeId(
  record: ExpenseRecord,
  subtypes: PaymentSubtype[],
): ExpenseRecord {
  return {
    ...record,
    paymentSubtypeId: resolvePaymentSubtypeId(record.paymentMethod, record.paymentSubtypeId, subtypes),
  };
}
