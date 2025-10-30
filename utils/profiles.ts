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
  const { authUid, email = null, name = null, deviceId = null, loginAt = null, birthDate = null } = params;

  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        auth_uid: authUid,
        email,
        nm: name,
        device_id: deviceId,
        login_at: loginAt,
        birth_date: birthDate,
      } as any,
      { onConflict: 'auth_uid' }
    );

  if (error) {
    // Fail silently for now; caller can decide to surface
    console.warn('[profiles.upsert] error:', error.message);
  }
}


