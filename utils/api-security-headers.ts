import Constants from 'expo-constants';

import { getOrCreateDeviceId } from '@/utils/device-id';

// 운영 중 시크릿 불일치로 API 호출이 막히는 상황을 줄이기 위한 최후 fallback.
// 우선순위는 env/public -> expo extra -> fallback 순서로 유지한다.
const INTERNAL_API_SECRET_FALLBACK = 'awallet-internal-2026-Yv9pZQkR8F2M';

function readExtraSecret(): string | null {
  const extraValue = Constants.expoConfig?.extra?.awalletInternalApiSecret;
  if (typeof extraValue !== 'string') return null;
  const trimmed = extraValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPublicSecret(): string | null {
  const envSecret = process.env.EXPO_PUBLIC_AWALLET_INTERNAL_API_SECRET;
  if (typeof envSecret !== 'string') return null;
  const trimmed = envSecret.trim();
  return trimmed.length > 0 ? trimmed : null;
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
