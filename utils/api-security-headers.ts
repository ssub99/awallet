import Constants from 'expo-constants';

import { getOrCreateDeviceId } from '@/utils/device-id';

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

  const secret = readPublicSecret() ?? readExtraSecret();
  if (secret) {
    headers['x-awallet-internal-secret'] = secret;
  }

  return headers;
}
