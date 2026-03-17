import Constants from 'expo-constants';

import { getOrCreateDeviceId } from '@/utils/device-id';

// 운영 중 시크릿 불일치로 API 호출이 막히는 상황을 줄이기 위한 최후 fallback.
// 우선순위는 env/public -> expo extra -> fallback 순서로 유지한다.
const INTERNAL_API_SECRET_FALLBACK = 'awallet-internal-2026-Yv9pZQkR8F2M';

function normalizeSecret(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '').trim();
  return unquoted.length > 0 ? unquoted : null;
}

function readExtraSecret(): string | null {
  return normalizeSecret(Constants.expoConfig?.extra?.awalletInternalApiSecret);
}

function readPublicSecret(): string | null {
  return normalizeSecret(process.env.EXPO_PUBLIC_AWALLET_INTERNAL_API_SECRET);
}

export async function getApiSecurityHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const deviceId = await getOrCreateDeviceId();
  if (deviceId.trim().length > 0) {
    headers['x-device-id'] = deviceId.trim();
  }

  const secret = readPublicSecret() ?? readExtraSecret() ?? INTERNAL_API_SECRET_FALLBACK;
  if (secret) {
    headers['x-awallet-internal-secret'] = secret;
  }

  return headers;
}
