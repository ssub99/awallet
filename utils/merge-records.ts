import { getOrCreateDeviceId } from './device-id';
import { isSupabaseConfigured, supabase } from './supabase-client';

interface MergeResult {
  expenses: number;
  incomes: number;
  challenges: number;
}

interface LogFailureParams {
  deviceId: string | null;
  operation: string;
  error: unknown;
  context?: Record<string, unknown>;
}

function extractErrorDetails(error: unknown): {
  code: string | null;
  message: string;
  payload: Record<string, unknown>;
} {
  if (error && typeof error === 'object') {
    const errObj = error as { code?: string; message?: string; details?: unknown };
    return {
      code: typeof errObj.code === 'string' ? errObj.code : null,
      message: typeof errObj.message === 'string' ? errObj.message : String(error),
      payload:
        errObj && typeof errObj === 'object' && 'details' in errObj
          ? { details: errObj.details }
          : {},
    };
  }

  return {
    code: null,
    message: typeof error === 'string' ? error : 'unknown error',
    payload: {},
  };
}

async function logMergeFailure({ deviceId, operation, error, context }: LogFailureParams) {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const { code, message, payload } = extractErrorDetails(error);
    const mergedPayload = { ...payload, ...(context ?? {}) };

    await supabase.rpc('log_merge_failure', {
      p_device_id: deviceId ?? null,
      p_operation: operation,
      p_error_code: code,
      p_error_message: message,
      p_payload: mergedPayload,
    });
  } catch (logError) {
    console.error('[merge-records] Failed to log merge failure:', logError);
  }
}

export async function mergeGuestRecords(): Promise<MergeResult | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const deviceId = await getOrCreateDeviceId();
  if (!deviceId) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc('merge_guest_records', {
      p_device_id: deviceId,
    });

    if (error) {
      throw error;
    }

    if (data && typeof data === 'object') {
      return {
        expenses: Number((data as Record<string, unknown>).expenses ?? 0),
        incomes: Number((data as Record<string, unknown>).incomes ?? 0),
        challenges: Number((data as Record<string, unknown>).challenges ?? 0),
      };
    }

    return { expenses: 0, incomes: 0, challenges: 0 };
  } catch (error) {
    console.error('[merge-records] Failed to merge guest records:', error);
    await logMergeFailure({
      deviceId,
      operation: 'merge_guest_records',
      error,
    });
    throw error;
  }
}

