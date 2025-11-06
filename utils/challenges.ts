import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from './supabase-client';
import { getOrCreateDeviceId } from './device-id';

let softDeleteSupported: boolean | null = null;
let authColumnSupported: boolean | null = null;
let deviceColumnSupported: boolean | null = null;

const MISSING_COLUMN_ERROR_CODE = '42703';

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: string }).code;
  return code === MISSING_COLUMN_ERROR_CODE;
}

type MissingColumnKey = 'softDelete' | 'auth' | 'device' | null;

function getMissingColumnKey(error: unknown): MissingColumnKey {
  if (!isMissingColumnError(error)) {
    return null;
  }

  const message = typeof (error as { message?: string }).message === 'string'
    ? (error as { message: string }).message
    : '';

  if (message.includes('is_deleted') || message.includes('deleted_at')) {
    return 'softDelete';
  }
  if (message.includes('auth_uid')) {
    return 'auth';
  }
  if (message.includes('device_id')) {
    return 'device';
  }

  return null;
}

const CHALLENGE_STORAGE_KEY = 'challengeData';

export interface ChallengeRecord {
  id: string;
  category: string;
  startDate: string; // YYYY.MM.DD
  endDate: string; // YYYY.MM.DD
  targetAmount: number;
  createdAt: number;
  recurringId: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  // Optional legacy fields preserved for compatibility
  startMonth?: string;
  endMonth?: string | null;
  durationMonths?: number | null;
  status?: string;
  updatedAt?: number | null;
}

interface SupabaseChallenge {
  id: string;
  category: string;
  start_date: string;
  end_date: string;
  target_amount: number;
  created_at: string | null;
  recurring_id: string | null;
  is_deleted: boolean | null;
  deleted_at: string | null;
  auth_uid: string | null;
  device_id: string | null;
  start_month: string;
  end_month: string | null;
  duration_months: number | null;
  status: string | null;
  updated_at: string | number | null;
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
    // Ignore and fallback to guest handling below
  }

  const deviceId = await getOrCreateDeviceId();
  return { authUid: null, deviceId };
}

async function fetchLocalChallenges(): Promise<ChallengeRecord[]> {
  try {
    const stored = await AsyncStorage.getItem(CHALLENGE_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as ChallengeRecord[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error('[challenges] Failed to read local cache:', error);
    return [];
  }
}

async function saveLocalChallenges(challenges: ChallengeRecord[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CHALLENGE_STORAGE_KEY, JSON.stringify(challenges));
  } catch (error) {
    console.error('[challenges] Failed to persist local cache:', error);
  }
}

interface SupabasePayloadOptions {
  includeSoftDelete: boolean;
  includeAuth: boolean;
  includeDevice: boolean;
}

const deriveMonthFromDate = (dateString: string): string => {
  const [year, month] = dateString.split('.');
  return `${year}.${month}`;
};

function convertToSupabaseFormat(
  record: ChallengeRecord,
  context: AuthContext,
  { includeSoftDelete, includeAuth, includeDevice }: SupabasePayloadOptions
): Partial<SupabaseChallenge> {
  const payload: Partial<SupabaseChallenge> = {
    id: record.id,
    category: record.category,
    start_date: record.startDate,
    end_date: record.endDate,
    target_amount: record.targetAmount,
    created_at: new Date(record.createdAt).toISOString(),
    recurring_id: record.recurringId,
    start_month: record.startMonth ?? deriveMonthFromDate(record.startDate),
    end_month: record.endMonth ?? deriveMonthFromDate(record.endDate),
    duration_months: record.durationMonths ?? null,
  };

  if (record.status !== undefined) {
    payload.status = record.status;
  }

  if (includeSoftDelete) {
    payload.is_deleted = record.isDeleted ?? false;
    payload.deleted_at = record.deletedAt ?? null;
  }

  if (includeAuth) {
    payload.auth_uid = context.authUid;
  }

  if (includeDevice) {
    payload.device_id = context.deviceId ?? null;
  }

  return payload;
}

function parseSupabaseBigint(
  value: string | number | null | undefined,
  fallback: number | null = Date.now()
): number | null {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return value;
  }

  // Supabase may return bigint columns as strings
  const numericValue = Number(value);
  if (!Number.isNaN(numericValue)) {
    return numericValue;
  }

  const parsedDate = new Date(value);
  const time = parsedDate.getTime();
  return Number.isNaN(time) ? fallback : time;
}

function convertFromSupabaseFormat(row: SupabaseChallenge): ChallengeRecord {
  const createdAt = parseSupabaseBigint(row.created_at) ?? Date.now();
  const updatedAt = parseSupabaseBigint(row.updated_at, null);

  return {
    id: row.id,
    category: row.category,
    startDate: row.start_date,
    endDate: row.end_date,
    targetAmount: row.target_amount,
    createdAt,
    recurringId: row.recurring_id ?? row.id,
    isDeleted: row.is_deleted ?? false,
    deletedAt: row.deleted_at,
    startMonth: row.start_month,
    endMonth: row.end_month,
    durationMonths: row.duration_months,
    status: row.status ?? undefined,
    updatedAt,
  };
}

async function syncLocalChallengesFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    await getAllChallenges();
  } catch (error) {
    console.error('[challenges] Failed to sync local cache from Supabase:', error);
  }
}

export async function createChallenges(records: ChallengeRecord[]): Promise<ChallengeRecord[]> {
  if (records.length === 0) {
    return [];
  }

  if (!isSupabaseConfigured) {
    const existing = await fetchLocalChallenges();
    const merged = [...existing, ...records];
    await saveLocalChallenges(merged);
    return records;
  }

  try {
    const context = await getAuthContext();
    let includeSoftDelete = softDeleteSupported !== false;
    let includeAuthColumn = authColumnSupported !== false;
    let includeDeviceColumn = deviceColumnSupported !== false;

    while (true) {
      const payload = records.map((record) =>
        convertToSupabaseFormat(record, context, {
          includeSoftDelete,
          includeAuth: includeAuthColumn,
          includeDevice: includeDeviceColumn,
        })
      );

      const { data, error } = await supabase
        .from('challenges')
        .insert(payload)
        .select();

      if (error) {
        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDelete) {
          includeSoftDelete = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthColumn) {
          includeAuthColumn = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceColumn) {
          includeDeviceColumn = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDelete;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthColumn;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceColumn;
      }

      const inserted = (data ?? []).map(convertFromSupabaseFormat);
      await syncLocalChallengesFromSupabase();
      return inserted;
    }
  } catch (error) {
    console.error('[challenges] Failed to create challenges:', error);
    throw error;
  }
}

export async function updateChallengesByRecurringId(
  recurringId: string,
  updates: Partial<Pick<
    ChallengeRecord,
    'category' | 'startDate' | 'endDate' | 'targetAmount' | 'createdAt' | 'isDeleted' | 'deletedAt' | 'startMonth' | 'endMonth' | 'durationMonths' | 'status' | 'updatedAt'
  >>
): Promise<ChallengeRecord[]> {
  if (!recurringId) {
    return [];
  }

  if (!isSupabaseConfigured) {
    const challenges = await fetchLocalChallenges();
    const updatedChallenges = challenges.map((challenge) => {
      if (challenge.recurringId !== recurringId) {
        return challenge;
      }

      return {
        ...challenge,
        category: updates.category ?? challenge.category,
        startDate: updates.startDate ?? challenge.startDate,
        endDate: updates.endDate ?? challenge.endDate,
        targetAmount: updates.targetAmount ?? challenge.targetAmount,
        createdAt: updates.createdAt ?? challenge.createdAt,
        isDeleted: updates.isDeleted ?? challenge.isDeleted,
        deletedAt: updates.deletedAt ?? challenge.deletedAt,
      };
    });

    await saveLocalChallenges(updatedChallenges);
    return updatedChallenges.filter((challenge) => challenge.recurringId === recurringId);
  }

  try {
    const context = await getAuthContext();
    let includeSoftDeleteFields = softDeleteSupported !== false;
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;

    const hasUpdatableFields =
      updates.category !== undefined ||
      updates.startDate !== undefined ||
      updates.endDate !== undefined ||
      updates.targetAmount !== undefined ||
      updates.createdAt !== undefined ||
      updates.isDeleted !== undefined ||
      updates.deletedAt !== undefined;

    if (!hasUpdatableFields) {
      return getChallengesByRecurringId(recurringId);
    }

    while (true) {
      const supabaseUpdates: Record<string, string | number | boolean | null> = {};

      if (updates.category !== undefined) {
        supabaseUpdates.category = updates.category;
      }
      if (updates.startDate !== undefined) {
        supabaseUpdates.start_date = updates.startDate;
        supabaseUpdates.start_month = updates.startMonth ?? deriveMonthFromDate(updates.startDate);
      }
      if (updates.endDate !== undefined) {
        supabaseUpdates.end_date = updates.endDate;
        supabaseUpdates.end_month = updates.endMonth ?? deriveMonthFromDate(updates.endDate);
      }
      if (updates.targetAmount !== undefined) {
        supabaseUpdates.target_amount = updates.targetAmount;
      }
      if (updates.createdAt !== undefined) {
        supabaseUpdates.created_at = new Date(updates.createdAt).toISOString();
      }
      if (updates.isDeleted !== undefined && includeSoftDeleteFields) {
        supabaseUpdates.is_deleted = updates.isDeleted;
      }
      if (updates.deletedAt !== undefined && includeSoftDeleteFields) {
        supabaseUpdates.deleted_at = updates.deletedAt ?? null;
      }
      if (updates.durationMonths !== undefined) {
        supabaseUpdates.duration_months = updates.durationMonths;
      }
      if (updates.status !== undefined) {
        supabaseUpdates.status = updates.status;
      }
      if (includeSoftDeleteFields) {
        supabaseUpdates.updated_at = updates.updatedAt ?? Date.now();
      }

      if (Object.keys(supabaseUpdates).length === 0) {
        return getChallengesByRecurringId(recurringId);
      }

      let query = supabase.from('challenges').update(supabaseUpdates).eq('recurring_id', recurringId);

      if (context.authUid) {
        if (includeAuthFilter) {
          query = query.eq('auth_uid', context.authUid);
        }
      } else {
        if (context.deviceId && includeDeviceFilter) {
          query = query.eq('device_id', context.deviceId);
        }
        if (includeAuthFilter) {
          query = query.is('auth_uid', null);
        }
      }

      const { data, error } = await query.select();

      if (error) {
        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDeleteFields) {
          includeSoftDeleteFields = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthFilter) {
          includeAuthFilter = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceFilter) {
          includeDeviceFilter = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDeleteFields;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthFilter;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceFilter;
      }

      const updated = (data ?? []).map(convertFromSupabaseFormat);
      await syncLocalChallengesFromSupabase();
      return updated;
    }
  } catch (error) {
    console.error('[challenges] Failed to update challenges:', error);
    throw error;
  }
}

export async function softDeleteChallengesByRecurringId(recurringId: string): Promise<void> {
  if (!recurringId) {
    return;
  }

  const deletedAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const challenges = await fetchLocalChallenges();
    const updatedChallenges = challenges.map((challenge) => {
      if (challenge.recurringId !== recurringId) {
        return challenge;
      }

      return {
        ...challenge,
        isDeleted: true,
        deletedAt,
      };
    });

    await saveLocalChallenges(updatedChallenges);
    return;
  }

  try {
    const context = await getAuthContext();
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;
    let softDeleteAttempted = softDeleteSupported !== false;
    let softDeleteSucceeded = false;

    if (softDeleteAttempted) {
      const supabaseUpdates = {
        is_deleted: true,
        deleted_at: deletedAt,
      };

      while (true) {
        let query = supabase.from('challenges').update(supabaseUpdates).eq('recurring_id', recurringId);

        if (context.authUid) {
          if (includeAuthFilter) {
            query = query.eq('auth_uid', context.authUid);
          }
        } else {
          if (context.deviceId && includeDeviceFilter) {
            query = query.eq('device_id', context.deviceId);
          }
          if (includeAuthFilter) {
            query = query.is('auth_uid', null);
          }
        }

        const { error } = await query;
        if (error) {
          const missingKey = getMissingColumnKey(error);
          if (missingKey === 'softDelete') {
            softDeleteSupported = false;
            break;
          }
          if (missingKey === 'auth' && includeAuthFilter) {
            includeAuthFilter = false;
            authColumnSupported = false;
            continue;
          }
          if (missingKey === 'device' && includeDeviceFilter) {
            includeDeviceFilter = false;
            deviceColumnSupported = false;
            continue;
          }

          throw error;
        }

        if (softDeleteSupported === null) {
          softDeleteSupported = true;
        }
        if (authColumnSupported === null) {
          authColumnSupported = includeAuthFilter;
        }
        if (deviceColumnSupported === null) {
          deviceColumnSupported = includeDeviceFilter;
        }

        softDeleteSucceeded = true;
        break;
      }
    }

    if (!softDeleteSucceeded) {
      // Hard delete fallback
      let includeAuthForDelete = authColumnSupported !== false;
      let includeDeviceForDelete = deviceColumnSupported !== false;

      while (true) {
        let deleteQuery = supabase.from('challenges').delete().eq('recurring_id', recurringId);

        if (context.authUid) {
          if (includeAuthForDelete) {
            deleteQuery = deleteQuery.eq('auth_uid', context.authUid);
          }
        } else {
          if (context.deviceId && includeDeviceForDelete) {
            deleteQuery = deleteQuery.eq('device_id', context.deviceId);
          }
          if (includeAuthForDelete) {
            deleteQuery = deleteQuery.is('auth_uid', null);
          }
        }

        const { error: deleteError } = await deleteQuery;
        if (deleteError) {
          const missingKey = getMissingColumnKey(deleteError);
          if (missingKey === 'auth' && includeAuthForDelete) {
            includeAuthForDelete = false;
            authColumnSupported = false;
            continue;
          }
          if (missingKey === 'device' && includeDeviceForDelete) {
            includeDeviceForDelete = false;
            deviceColumnSupported = false;
            continue;
          }

          throw deleteError;
        }

        if (authColumnSupported === null) {
          authColumnSupported = includeAuthForDelete;
        }
        if (deviceColumnSupported === null) {
          deviceColumnSupported = includeDeviceForDelete;
        }

        break;
      }
    }

    await syncLocalChallengesFromSupabase();
  } catch (error) {
    console.error('[challenges] Failed to soft delete challenges:', error);
    throw error;
  }
}

export async function getChallengeById(id: string): Promise<ChallengeRecord | null> {
  if (!id) {
    return null;
  }

  if (!isSupabaseConfigured) {
    const challenges = await fetchLocalChallenges();
    return challenges.find((challenge) => challenge.id === id && challenge.isDeleted !== true) ?? null;
  }

  try {
    const context = await getAuthContext();
    let includeSoftDelete = softDeleteSupported !== false;
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;

    while (true) {
      let query = supabase.from('challenges').select('*').eq('id', id);
      if (includeSoftDelete) {
        query = query.or('is_deleted.is.null,is_deleted.eq.false');
      }

      if (context.authUid) {
        if (includeAuthFilter) {
          query = query.eq('auth_uid', context.authUid);
        }
      } else {
        if (context.deviceId && includeDeviceFilter) {
          query = query.eq('device_id', context.deviceId);
        }
        if (includeAuthFilter) {
          query = query.is('auth_uid', null);
        }
      }

      const { data, error } = await query.single();

      if (error) {
        if ((error as { code?: string }).code === 'PGRST116') {
          return null;
        }

        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDelete) {
          includeSoftDelete = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthFilter) {
          includeAuthFilter = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceFilter) {
          includeDeviceFilter = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (!data) {
        return null;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDelete;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthFilter;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceFilter;
      }

      return convertFromSupabaseFormat(data as SupabaseChallenge);
    }
  } catch (error) {
    console.error('[challenges] Failed to fetch challenge by id:', error);
    return null;
  }
}

export async function getChallengesByRecurringId(recurringId: string): Promise<ChallengeRecord[]> {
  if (!recurringId) {
    return [];
  }

  if (!isSupabaseConfigured) {
    const challenges = await fetchLocalChallenges();
    return challenges.filter((challenge) => challenge.recurringId === recurringId && challenge.isDeleted !== true);
  }

  try {
    const context = await getAuthContext();
    let includeSoftDelete = softDeleteSupported !== false;
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;

    while (true) {
      let query = supabase.from('challenges').select('*').eq('recurring_id', recurringId);
      if (includeSoftDelete) {
        query = query.or('is_deleted.is.null,is_deleted.eq.false');
      }

      if (context.authUid) {
        if (includeAuthFilter) {
          query = query.eq('auth_uid', context.authUid);
        }
      } else {
        if (context.deviceId && includeDeviceFilter) {
          query = query.eq('device_id', context.deviceId);
        }
        if (includeAuthFilter) {
          query = query.is('auth_uid', null);
        }
      }

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) {
        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDelete) {
          includeSoftDelete = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthFilter) {
          includeAuthFilter = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceFilter) {
          includeDeviceFilter = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDelete;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthFilter;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceFilter;
      }

      return (data ?? []).map(convertFromSupabaseFormat);
    }
  } catch (error) {
    console.error('[challenges] Failed to fetch challenges by recurring id:', error);
    return [];
  }
}

export async function getChallengesByDateRange(startDate: string, endDate: string): Promise<ChallengeRecord[]> {
  if (!startDate || !endDate) {
    return [];
  }

  if (!isSupabaseConfigured) {
    const challenges = await fetchLocalChallenges();
    return challenges.filter((challenge) => {
      if (challenge.isDeleted) {
        return false;
      }

      return challenge.startDate >= startDate && challenge.startDate <= endDate;
    });
  }

  try {
    const context = await getAuthContext();
    let includeSoftDelete = softDeleteSupported !== false;
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;

    while (true) {
      let query = supabase
        .from('challenges')
        .select('*')
        .gte('start_date', startDate)
        .lte('start_date', endDate);

      if (includeSoftDelete) {
        query = query.or('is_deleted.is.null,is_deleted.eq.false');
      }

      if (context.authUid) {
        if (includeAuthFilter) {
          query = query.eq('auth_uid', context.authUid);
        }
      } else {
        if (context.deviceId && includeDeviceFilter) {
          query = query.eq('device_id', context.deviceId);
        }
        if (includeAuthFilter) {
          query = query.is('auth_uid', null);
        }
      }

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) {
        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDelete) {
          includeSoftDelete = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthFilter) {
          includeAuthFilter = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceFilter) {
          includeDeviceFilter = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDelete;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthFilter;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceFilter;
      }

      return (data ?? []).map(convertFromSupabaseFormat);
    }
  } catch (error) {
    console.error('[challenges] Failed to fetch challenges by date range:', error);
    return [];
  }
}

export async function getAllChallenges(): Promise<ChallengeRecord[]> {
  if (!isSupabaseConfigured) {
    return fetchLocalChallenges();
  }

  try {
    const context = await getAuthContext();
    let includeSoftDelete = softDeleteSupported !== false;
    let includeAuthFilter = authColumnSupported !== false;
    let includeDeviceFilter = deviceColumnSupported !== false;

    while (true) {
      let query = supabase.from('challenges').select('*');
      if (includeSoftDelete) {
        query = query.or('is_deleted.is.null,is_deleted.eq.false');
      }

      if (context.authUid) {
        if (includeAuthFilter) {
          query = query.eq('auth_uid', context.authUid);
        }
      } else {
        if (context.deviceId && includeDeviceFilter) {
          query = query.eq('device_id', context.deviceId);
        }
        if (includeAuthFilter) {
          query = query.is('auth_uid', null);
        }
      }

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) {
        const missingKey = getMissingColumnKey(error);
        if (missingKey === 'softDelete' && includeSoftDelete) {
          includeSoftDelete = false;
          softDeleteSupported = false;
          continue;
        }
        if (missingKey === 'auth' && includeAuthFilter) {
          includeAuthFilter = false;
          authColumnSupported = false;
          continue;
        }
        if (missingKey === 'device' && includeDeviceFilter) {
          includeDeviceFilter = false;
          deviceColumnSupported = false;
          continue;
        }

        throw error;
      }

      if (softDeleteSupported === null) {
        softDeleteSupported = includeSoftDelete;
      }
      if (authColumnSupported === null) {
        authColumnSupported = includeAuthFilter;
      }
      if (deviceColumnSupported === null) {
        deviceColumnSupported = includeDeviceFilter;
      }

      const converted = (data ?? []).map(convertFromSupabaseFormat);
      await saveLocalChallenges(converted);
      return converted;
    }
  } catch (error) {
    console.error('[challenges] Failed to fetch all challenges:', error);
    return fetchLocalChallenges();
  }
}


