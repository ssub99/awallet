import { APP_VERSION_POLICY_URL } from '@/constants/api';
import { Platform } from 'react-native';

const FETCH_TIMEOUT_MS = 12_000;

export interface AppVersionPolicy {
  minVersion: string;
  minVersionIos?: string;
  minVersionAndroid?: string;
  forceUpdate: boolean;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

/** 원격 JSON을 `AppVersionPolicy`로 파싱. 형식이 맞지 않으면 null. */
export function parseAppVersionPolicy(data: unknown): AppVersionPolicy | null {
  if (!isRecord(data)) return null;

  const minVersion = asNonEmptyString(data.minVersion);
  const minVersionIos = asNonEmptyString(data.minVersionIos) ?? undefined;
  const minVersionAndroid = asNonEmptyString(data.minVersionAndroid) ?? undefined;

  if (minVersion == null) return null;

  const message =
    asNonEmptyString(data.message) ??
    '새로운 버전이 출시 되었습니다.\n원활한 이용을 위해 업데이트를 진행해 주세요.';

  return {
    minVersion,
    minVersionIos,
    minVersionAndroid,
    forceUpdate: asBoolean(data.forceUpdate, false),
    message,
  };
}

export function getEffectiveMinVersion(policy: AppVersionPolicy): string {
  if (Platform.OS === 'ios' && policy.minVersionIos != null && policy.minVersionIos !== '') {
    return policy.minVersionIos;
  }
  if (
    Platform.OS === 'android' &&
    policy.minVersionAndroid != null &&
    policy.minVersionAndroid !== ''
  ) {
    return policy.minVersionAndroid;
  }
  return policy.minVersion;
}

export async function fetchAppVersionPolicy(): Promise<AppVersionPolicy | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(APP_VERSION_POLICY_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return parseAppVersionPolicy(json);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
