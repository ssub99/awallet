import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { parseAppNoticesPayload, type AppNotice } from '@/utils/fetch-app-notices';
import {
  isLocalNoticeMediaUri,
  prepareNoticeMediaForStaticSync,
} from '@/utils/notice-media-static-sync';

const SYNC_TIMEOUT_MS = 5_000;
const SYNC_UPSERT_TIMEOUT_MS = 30_000;
const SYNC_PORT = 8787;

export type DevNoticeSyncFailureReason = 'unreachable' | 'outdated_server' | 'media_upload';

export type DevNoticeUpsertSyncResult = {
  synced: boolean;
  failure?: DevNoticeSyncFailureReason;
};

/**
 * __DEV__ 공지 등록·편집 시 static/app-notices.json sync 서버 안내.
 * UI(작성·편집 화면)와 토스트에서 공통 사용.
 */
export const DEV_NOTICE_UPLOAD_GUIDE =
  '등록·저장 전 npm run start:ing (또는 npm run dev:notices-sync)으로 sync 서버를 켜 주세요. 사진·영상은 static/notices/에 업로드되고 HTTPS URL로 저장됩니다. git push · Vercel 배포 후 스테이지에서 볼 수 있습니다.';

export const DEV_NOTICE_SYNC_FAILED_TOAST =
  '공지는 기기에만 저장됐습니다. sync 서버를 켠 뒤 다시 저장해 주세요.';

export function getDevNoticeSyncFailureToast(failure?: DevNoticeSyncFailureReason): string {
  switch (failure) {
    case 'unreachable':
      return 'sync 서버에 연결할 수 없습니다. npm run start:ing 으로 Metro와 함께 켜 주세요.';
    case 'outdated_server':
      return 'sync 서버가 예전 버전입니다. Metro 터미널을 Ctrl+C로 끈 뒤 npm run start:ing 으로 다시 켜 주세요.';
    case 'media_upload':
      return '사진·영상 업로드에 실패했습니다. sync 서버가 켜져 있는지 확인 후 다시 저장해 주세요.';
    default:
      return DEV_NOTICE_SYNC_FAILED_TOAST;
  }
}

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

async function fetchSyncJson(
  pathname: string,
  init?: RequestInit,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${getDevNoticesSyncBaseUrl()}${pathname}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function probeDevNoticesSyncServer(): Promise<'ok' | 'unreachable' | 'outdated'> {
  try {
    const healthRes = await fetchSyncJson('/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (healthRes.ok) {
      const json: unknown = await healthRes.json();
      if (
        json != null &&
        typeof json === 'object' &&
        'media' in json &&
        (json as { media: unknown }).media === true
      ) {
        return 'ok';
      }
      return 'outdated';
    }

    const legacyRes = await fetchSyncJson('/app-notices.json', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (legacyRes.ok) {
      return 'outdated';
    }
    return 'unreachable';
  } catch {
    return 'unreachable';
  }
}

function noticeHasLocalMedia(notice: AppNotice): boolean {
  const media = [...notice.images, ...(notice.videos ?? [])];
  return media.some(isLocalNoticeMediaUri);
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

export async function upsertDevNoticeToStaticFile(notice: AppNotice): Promise<DevNoticeUpsertSyncResult> {
  const serverStatus = await probeDevNoticesSyncServer();
  if (serverStatus === 'unreachable') {
    return { synced: false, failure: 'unreachable' };
  }
  if (serverStatus === 'outdated') {
    return { synced: false, failure: 'outdated_server' };
  }

  const hasLocalMedia = noticeHasLocalMedia(notice);

  try {
    const prepared = await prepareNoticeMediaForStaticSync(notice, getDevNoticesSyncBaseUrl());
    if (prepared == null) {
      return { synced: false, failure: hasLocalMedia ? 'media_upload' : 'unreachable' };
    }
    const res = await fetchSyncJson(
      '/notices',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(prepared),
      },
      SYNC_UPSERT_TIMEOUT_MS,
    );
    if (!res.ok) {
      return { synced: false, failure: hasLocalMedia ? 'media_upload' : 'unreachable' };
    }
    return { synced: true };
  } catch {
    return { synced: false, failure: hasLocalMedia ? 'media_upload' : 'unreachable' };
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
