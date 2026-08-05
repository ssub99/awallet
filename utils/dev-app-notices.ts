import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  deleteDevNoticeFromStaticFile,
  fetchDevNoticesFromStaticFile,
  upsertDevNoticeToStaticFile,
  type DevNoticeSyncFailureReason,
} from '@/utils/dev-notices-sync';
import {
  parseAppNoticesPayload,
  type AppNotice,
} from '@/utils/fetch-app-notices';
import { isLocalDevOnlyUIEnabled } from '@/utils/dev-only-ui';
import { noticeUnreadEvent } from '@/utils/notice-read-state';

/** 레거시 AsyncStorage 키 — migrate 스크립트·오프라인 fallback용 */
export const DEV_PUBLISHED_NOTICES_STORAGE_KEY = 'devPublishedAppNotices';

async function loadDevAppNoticesFromAsyncStorage(): Promise<AppNotice[]> {
  try {
    const raw = await AsyncStorage.getItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY);
    if (raw == null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return parseAppNoticesPayload({ notices: Array.isArray(parsed) ? parsed : [] });
  } catch {
    return [];
  }
}

/** __DEV__ 공지 — static sync + AsyncStorage 병합(마이그레이션·편집→저장용). */
export async function loadDevAppNotices(): Promise<AppNotice[]> {
  const fromAsync = await loadDevAppNoticesFromAsyncStorage();

  if (!isLocalDevOnlyUIEnabled()) {
    return fromAsync;
  }

  const fromSync = await fetchDevNoticesFromStaticFile();
  if (fromSync == null) {
    return fromAsync;
  }

  const byId = new Map<string, AppNotice>();
  for (const notice of [...fromAsync, ...fromSync]) {
    byId.set(notice.id, notice);
  }
  return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt);
}

async function persistDevAppNoticesToAsyncStorage(notices: AppNotice[]): Promise<void> {
  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY, JSON.stringify(notices));
}

export type DevNoticeSaveResult = {
  saved: boolean;
  synced: boolean;
  syncFailure?: DevNoticeSyncFailureReason;
};

/** __DEV__ 공지 등록 — static/app-notices.json sync 우선. */
export async function publishDevAppNotice(notice: AppNotice): Promise<DevNoticeSaveResult> {
  if (!isLocalDevOnlyUIEnabled()) {
    return { saved: false, synced: false };
  }

  const { synced, failure } = await upsertDevNoticeToStaticFile(notice);
  if (synced) {
    noticeUnreadEvent.emit();
    return { saved: true, synced: true };
  }

  const existing = await loadDevAppNoticesFromAsyncStorage();
  const merged = parseAppNoticesPayload({ notices: [notice, ...existing] });
  await persistDevAppNoticesToAsyncStorage(merged);
  noticeUnreadEvent.emit();
  return { saved: true, synced: false, syncFailure: failure };
}

export async function getDevAppNoticeById(noticeId: string): Promise<AppNotice | null> {
  if (!isLocalDevOnlyUIEnabled()) {
    return null;
  }

  const existing = await loadDevAppNotices();
  return existing.find((notice) => notice.id === noticeId) ?? null;
}

/** 수정 */
export async function updateDevAppNotice(updated: AppNotice): Promise<DevNoticeSaveResult> {
  if (!isLocalDevOnlyUIEnabled()) {
    return { saved: false, synced: false };
  }

  const { synced, failure } = await upsertDevNoticeToStaticFile(updated);
  if (synced) {
    noticeUnreadEvent.emit();
    return { saved: true, synced: true };
  }

  const existing = await loadDevAppNoticesFromAsyncStorage();
  const index = existing.findIndex((notice) => notice.id === updated.id);
  if (index < 0) {
    return { saved: false, synced: false };
  }

  const next = [...existing];
  next[index] = updated;
  await persistDevAppNoticesToAsyncStorage(parseAppNoticesPayload({ notices: next }));
  noticeUnreadEvent.emit();
  return { saved: true, synced: false, syncFailure: failure };
}

/** 삭제 — static에서 제거 성공 시 true. */
export async function deleteDevAppNotice(noticeId: string): Promise<boolean> {
  if (!isLocalDevOnlyUIEnabled()) {
    return false;
  }

  const synced = await deleteDevNoticeFromStaticFile(noticeId);
  if (synced) {
    noticeUnreadEvent.emit();
    return true;
  }

  const existing = await loadDevAppNoticesFromAsyncStorage();
  const next = existing.filter((notice) => notice.id !== noticeId);
  if (next.length === existing.length) {
    return false;
  }

  await persistDevAppNoticesToAsyncStorage(next);
  noticeUnreadEvent.emit();
  return true;
}

/** 레거시 AsyncStorage 백업 — migrate 후에는 static 파일이 SSOT */
export async function backupDevPublishedNoticesForReset(): Promise<string | null> {
  if (!isLocalDevOnlyUIEnabled()) {
    return null;
  }
  return AsyncStorage.getItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY);
}

export async function restoreDevPublishedNoticesAfterReset(snapshot: string | null): Promise<void> {
  if (!isLocalDevOnlyUIEnabled() || snapshot == null) {
    return;
  }
  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY, snapshot);
  noticeUnreadEvent.emit();
}
