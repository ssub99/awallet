import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { parseAppNoticesPayload, type AppNotice } from '@/utils/fetch-app-notices';

const SYNC_TIMEOUT_MS = 5_000;
const SYNC_PORT = 8787;

/**
 * __DEV__ 공지 등록·편집 시 static/app-notices.json sync 서버 안내.
 * UI(작성·편집 화면)와 토스트에서 공통 사용.
 */
export const DEV_NOTICE_UPLOAD_GUIDE =
  '등록·저장 전 터미널에서 npm run start:ing (또는 npm run dev:notices-sync)으로 공지 sync 서버를 켜 주세요. 서버가 켜져 있어야 static/app-notices.json에 저장되고, git push · Vercel 배포 후 스테이지에서 볼 수 있습니다.';

export const DEV_NOTICE_SYNC_FAILED_TOAST =
  '공지는 기기에만 저장됐습니다. npm run start:ing 으로 sync 서버를 켠 뒤 다시 저장해 주세요.';

function normalizeSyncBaseUrl(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** Expo Go·Metro가 이미 쓰는 LAN IP (실기기 → Mac sync 서버) */
function readMetroHost(): string | null {
  const sources = [Constants.expoGoConfig?.debuggerHost, Constants.expoConfig?.hostUri];
  for (const raw of sources) {
    if (typeof raw !== 'string') continue;
    const withoutScheme = raw.replace(/^[a-z]+:\/\//i, '');
    const host = withoutScheme.split(':')[0]?.trim();
    if (host) return host;
  }
  return null;
}

/** Metro dev — static/app-notices.json sync 서버 (scripts/dev-notices-sync-server.mjs) */
export function getDevNoticesSyncBaseUrl(): string {
  const fromEnv = normalizeSyncBaseUrl(process.env.EXPO_PUBLIC_DEV_NOTICES_SYNC_URL);
  if (fromEnv != null) {
    return fromEnv;
  }

  const metroHost = readMetroHost();
  if (metroHost != null) {
    return `http://${metroHost}:${SYNC_PORT}`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8787';
  }
  return 'http://localhost:8787';
}

async function fetchSyncJson(pathname: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);
  try {
    return await fetch(`${getDevNoticesSyncBaseUrl()}${pathname}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDevNoticesFromStaticFile(): Promise<AppNotice[] | null> {
  try {
    const res = await fetchSyncJson('/app-notices.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return null;
    }
    const json: unknown = await res.json();
    return parseAppNoticesPayload(json);
  } catch {
    return null;
  }
}

export async function upsertDevNoticeToStaticFile(notice: AppNotice): Promise<boolean> {
  try {
    const res = await fetchSyncJson('/notices', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notice),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteDevNoticeFromStaticFile(noticeId: string): Promise<boolean> {
  try {
    const res = await fetchSyncJson(`/notices/${encodeURIComponent(noticeId)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
