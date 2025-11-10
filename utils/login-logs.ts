import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from './supabase-client';

export interface LogLoginEventOptions {
  email?: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logLoginEvent({
  email = null,
  deviceId = null,
  userAgent,
  ipAddress,
  metadata,
}: LogLoginEventOptions): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  const baseMetadata = buildDefaultMetadata();
  const finalMetadata =
    metadata !== undefined ? { ...baseMetadata, ...metadata } : baseMetadata;

  const resolvedUserAgent =
    userAgent ?? buildDefaultUserAgent(finalMetadata.appVersion);

  try {
    const payload: Record<string, unknown> = {
      p_email: email,
      p_device_id: deviceId,
      p_user_agent: resolvedUserAgent,
      p_metadata: finalMetadata,
    };

    if (ipAddress) {
      payload.p_ip = ipAddress;
    }

    const { error } = await supabase.rpc('log_login_event', payload);
    if (error) {
      console.error('로그인 이력 저장 중 오류:', error);
    }
  } catch (error) {
    console.error('로그인 이력 저장 중 예외 발생:', error);
  }
}

function buildDefaultUserAgent(appVersion?: unknown): string {
  const version = typeof appVersion === 'string' && appVersion.length > 0 ? appVersion : 'unknown';
  return `awallet/${version} (${Platform.OS}; ${Platform.Version})`;
}

function buildDefaultMetadata(): Record<string, unknown> {
  return {
    platform: Platform.OS,
    platformVersion: Platform.Version,
    appVersion: Constants.expoConfig?.version ?? null,
  };
}

