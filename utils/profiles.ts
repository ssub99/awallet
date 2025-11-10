import { supabase, isSupabaseConfigured } from '@/utils/supabase-client';

interface UpsertProfileParams {
  authUid: string;
  email?: string | null;
  name?: string | null; // maps to nm
  deviceId?: string | null;
  loginAt?: string | null; // ISO string
  birthDate?: string | null; // YYYY-MM-DD
}

/**
 * Upsert a profile row keyed by auth_uid.
 * Requires RLS policy allowing insert/update when auth.uid() = auth_uid.
 */
export async function upsertProfile(params: UpsertProfileParams): Promise<void> {
  if (!isSupabaseConfigured) return;

  const { authUid, email, name, deviceId, loginAt, birthDate } = params;

  const payload: Record<string, string | null> & { auth_uid: string } = {
    auth_uid: authUid,
  };

  if (email !== undefined) {
    payload.email = email;
  }
  if (name !== undefined) {
    payload.nm = name;
  }
  if (deviceId !== undefined) {
    payload.device_id = deviceId;
  }
  if (loginAt !== undefined) {
    payload.login_at = loginAt;
  }
  if (birthDate !== undefined) {
    payload.birth_date = birthDate;
  }

  const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'auth_uid' });

  if (error) {
    // Fail silently for now; caller can decide to surface
    console.warn('[profiles.upsert] error:', error.message);
  }
}


