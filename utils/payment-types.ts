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

/** 앱 부트스트랩·설정 화면 — AsyncStorage 로드 전 첫 프레임용 */
let paymentSubtypesMemoryCache: PaymentSubtype[] | null = null;

export interface LoadPaymentSubtypesOptions {
  /** true면 메모리 캐시를 무시하고 Storage에서 읽음 (앱 기동 초기화 등) */
  forceStorage?: boolean;
}

export function getPaymentSubtypesMemoryCache(): PaymentSubtype[] | null {
  return paymentSubtypesMemoryCache;
}

function commitPaymentSubtypesCache(subtypes: PaymentSubtype[]): PaymentSubtype[] {
  const normalized = normalizePaymentSubtypes(subtypes);
  paymentSubtypesMemoryCache = normalized;
  return normalized;
}

async function persistPaymentSubtypesIfChanged(
  normalized: PaymentSubtype[],
  storedJson: string | null,
): Promise<void> {
  const serialized = JSON.stringify(normalized);
  if (storedJson === serialized) {
    return;
  }
  await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, serialized);
}

export function arePaymentSubtypesSame(a: PaymentSubtype[], b: PaymentSubtype[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right) {
      return false;
    }
    if (
      left.id !== right.id ||
      left.type !== right.type ||
      left.label !== right.label ||
      left.description !== right.description ||
      left.color !== right.color
    ) {
      return false;
    }
  }
  return true;
}

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

export async function loadPaymentSubtypes(
  options?: LoadPaymentSubtypesOptions,
): Promise<PaymentSubtype[]> {
  const forceStorage = options?.forceStorage === true;
  if (!forceStorage && paymentSubtypesMemoryCache != null) {
    return paymentSubtypesMemoryCache;
  }

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
      const defaults = commitPaymentSubtypesCache(DEFAULT_PAYMENT_SUBTYPES);
      await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      const defaults = commitPaymentSubtypesCache(DEFAULT_PAYMENT_SUBTYPES);
      await AsyncStorage.setItem(PAYMENT_SUBTYPES_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const normalized = commitPaymentSubtypesCache(parsed as PaymentSubtype[]);
    await persistPaymentSubtypesIfChanged(normalized, stored);
    return normalized;
  } catch (error) {
    console.error('결제 유형 설정 로드 실패:', error);
    return commitPaymentSubtypesCache(DEFAULT_PAYMENT_SUBTYPES);
  }
}

/** 앱 기동 시 Storage 기준으로 메모리 캐시를 채움 */
export async function initializePaymentSubtypes(): Promise<PaymentSubtype[]> {
  return loadPaymentSubtypes({ forceStorage: true });
}

export async function savePaymentSubtypes(subtypes: PaymentSubtype[]): Promise<void> {
  const normalized = commitPaymentSubtypesCache(subtypes);
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
