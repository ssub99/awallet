import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase-client';
import { getOrCreateDeviceId } from './device-id';

const INCOME_STORAGE_KEY = 'incomeData';

export interface IncomeRecord {
  type: 'income';
  amount: number;
  date: string; // YYYY.MM.DD
  memo?: string;
  timestamp: number;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

interface SupabaseIncome {
  id: string;
  amount: number;
  date: string;
  memo: string | null;
  timestamp: number;
  created_at: string;
  auth_uid: string | null;
  device_id: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
}

interface AuthContext {
  authUid: string | null;
  deviceId: string | null;
}

async function getAuthContext(): Promise<AuthContext> {
  if (!isSupabaseConfigured) {
    return { authUid: null, deviceId: null };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (!error && user) {
      return { authUid: user.id, deviceId: null };
    }
  } catch (error) {
    console.warn('[incomes] Failed to get auth user, fallback to guest:', error);
  }

  const deviceId = await getOrCreateDeviceId();
  return { authUid: null, deviceId };
}

function convertToSupabaseFormat(record: IncomeRecord, context: AuthContext): Partial<SupabaseIncome> {
  return {
    id: record.timestamp.toString(),
    amount: record.amount,
    date: record.date,
    memo: record.memo ?? null,
    timestamp: record.timestamp,
    created_at: new Date(record.timestamp).toISOString(),
    auth_uid: context.authUid,
    device_id: context.deviceId,
    is_deleted: record.isDeleted ?? false,
    deleted_at: record.deletedAt ?? null,
  };
}

function convertFromSupabaseFormat(row: SupabaseIncome): IncomeRecord {
  return {
    type: 'income',
    amount: row.amount,
    date: row.date,
    memo: row.memo ?? undefined,
    timestamp: row.timestamp,
    isDeleted: row.is_deleted,
    deletedAt: row.deleted_at ?? undefined,
  };
}

export async function createIncome(record: IncomeRecord): Promise<IncomeRecord | null> {
  if (!isSupabaseConfigured) {
    await saveLocalIncome(record);
    return record;
  }

  try {
    const context = await getAuthContext();
    const payload = convertToSupabaseFormat(record, context);

    const { data, error } = await supabase
      .from('incomes')
      .insert(payload)
      .select()
      .single();

    if (error) {
      throw error;
    }

    const created = convertFromSupabaseFormat(data as SupabaseIncome);
    await saveLocalIncome(created);
    return created;
  } catch (error) {
    console.error('[incomes] Failed to create income:', error);
    await saveLocalIncome(record);
    return record;
  }
}

export async function updateIncome(id: string, updates: Partial<IncomeRecord>): Promise<IncomeRecord | null> {
  if (!isSupabaseConfigured) {
    await updateLocalIncome(id, updates);
    return null;
  }

  try {
    const context = await getAuthContext();
    const supabaseUpdates: Partial<SupabaseIncome> = {};

    if (updates.amount !== undefined) supabaseUpdates.amount = updates.amount;
    if (updates.date !== undefined) supabaseUpdates.date = updates.date;
    if (updates.memo !== undefined) supabaseUpdates.memo = updates.memo ?? null;
    if (updates.timestamp !== undefined) supabaseUpdates.timestamp = updates.timestamp;
    if (updates.isDeleted !== undefined) supabaseUpdates.is_deleted = updates.isDeleted;
    if (updates.deletedAt !== undefined) supabaseUpdates.deleted_at = updates.deletedAt ?? null;

    let query = supabase.from('incomes').update(supabaseUpdates).eq('id', id);

    if (context.authUid) {
      query = query.eq('auth_uid', context.authUid);
    } else if (context.deviceId) {
      query = query.eq('device_id', context.deviceId).is('auth_uid', null);
    }

    const { data, error } = await query.select().single();

    if (error) {
      throw error;
    }

    const updated = convertFromSupabaseFormat(data as SupabaseIncome);
    await updateLocalIncome(id, updates);
    return updated;
  } catch (error) {
    console.error('[incomes] Failed to update income:', error);
    await updateLocalIncome(id, updates);
    return null;
  }
}

export async function softDeleteIncome(id: string): Promise<void> {
  const deletedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    await updateLocalIncome(id, { isDeleted: true, deletedAt });
    return;
  }

  try {
    const context = await getAuthContext();
    let query = supabase
      .from('incomes')
      .update({ is_deleted: true, deleted_at: deletedAt })
      .eq('id', id);

    if (context.authUid) {
      query = query.eq('auth_uid', context.authUid);
    } else if (context.deviceId) {
      query = query.eq('device_id', context.deviceId).is('auth_uid', null);
    }

    const { error } = await query;
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('[incomes] Failed to soft delete income:', error);
  } finally {
    await updateLocalIncome(id, { isDeleted: true, deletedAt });
  }
}

export async function getIncomeById(id: string): Promise<IncomeRecord | null> {
  if (!isSupabaseConfigured) {
    const locals = await loadLocalIncomes();
    return locals.find((income) => income.timestamp.toString() === id) ?? null;
  }

  try {
    const context = await getAuthContext();
    let query = supabase.from('incomes').select('*').eq('id', id);

    if (context.authUid) {
      query = query.eq('auth_uid', context.authUid);
    } else if (context.deviceId) {
      query = query.eq('device_id', context.deviceId).is('auth_uid', null);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    return convertFromSupabaseFormat(data as SupabaseIncome);
  } catch (error) {
    console.error('[incomes] Failed to fetch income by id:', error);
    return null;
  }
}

export async function getIncomesByDateRange(startDate: string, endDate: string): Promise<IncomeRecord[]> {
  if (!isSupabaseConfigured) {
    const locals = await loadLocalIncomes();
    return locals.filter((record) => record.date >= startDate && record.date <= endDate && !record.isDeleted);
  }

  try {
    const context = await getAuthContext();
    let query = supabase
      .from('incomes')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('is_deleted', false);

    if (context.authUid) {
      query = query.eq('auth_uid', context.authUid);
    } else if (context.deviceId) {
      query = query.eq('device_id', context.deviceId).is('auth_uid', null);
    }

    const { data, error } = await query.order('timestamp', { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => convertFromSupabaseFormat(row as SupabaseIncome));
  } catch (error) {
    console.error('[incomes] Failed to fetch incomes by range:', error);
    return [];
  }
}

export async function getAllIncomes(): Promise<IncomeRecord[]> {
  if (!isSupabaseConfigured) {
    return loadLocalIncomes();
  }

  try {
    const context = await getAuthContext();
    let query = supabase.from('incomes').select('*').order('timestamp', { ascending: true });

    if (context.authUid) {
      query = query.eq('auth_uid', context.authUid);
    } else if (context.deviceId) {
      query = query.eq('device_id', context.deviceId).is('auth_uid', null);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const incomes = (data ?? []).map((row) => convertFromSupabaseFormat(row as SupabaseIncome));
    await AsyncStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(incomes));
    return incomes;
  } catch (error) {
    console.error('[incomes] Failed to fetch all incomes:', error);
    return loadLocalIncomes();
  }
}

async function saveLocalIncome(record: IncomeRecord): Promise<void> {
  const locals = await loadLocalIncomes();
  const filtered = locals.filter((income) => income.timestamp !== record.timestamp);
  filtered.push(record);
  await AsyncStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(filtered));
}

async function updateLocalIncome(id: string, updates: Partial<IncomeRecord>): Promise<void> {
  const locals = await loadLocalIncomes();
  const updated = locals.map((income) => {
    if (income.timestamp.toString() === id) {
      return { ...income, ...updates };
    }
    return income;
  });
  await AsyncStorage.setItem(INCOME_STORAGE_KEY, JSON.stringify(updated));
}

async function loadLocalIncomes(): Promise<IncomeRecord[]> {
  try {
    const stored = await AsyncStorage.getItem(INCOME_STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as IncomeRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[incomes] Failed to load local incomes:', error);
    return [];
  }
}


