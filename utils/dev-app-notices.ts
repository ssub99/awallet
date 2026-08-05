import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseAppNoticesPayload,
  type AppNotice,
} from '@/utils/fetch-app-notices';
import { isLocalDevOnlyUIEnabled } from '@/utils/dev-only-ui';
import { noticeUnreadEvent } from '@/utils/notice-read-state';

/** __DEV__ 로컬 등록 공지 AsyncStorage 키 — 전체 초기화 시 보존 */
export const DEV_PUBLISHED_NOTICES_STORAGE_KEY = 'devPublishedAppNotices';

/** AsyncStorage 로컬 공지 — dev에서 작성, stage/prod/dev 모든 환경에서 목록 표시. */
export async function loadDevAppNotices(): Promise<AppNotice[]> {
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

export async function publishDevAppNotice(notice: AppNotice): Promise<void> {
  if (!isLocalDevOnlyUIEnabled()) {
    return;
  }

  const existing = await loadDevAppNotices();
  const merged = parseAppNoticesPayload({ notices: [notice, ...existing] });
  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY, JSON.stringify(merged));
  noticeUnreadEvent.emit();
}

/** __DEV__ 로컬 등록 공지 단건 조회. */
export async function getDevAppNoticeById(noticeId: string): Promise<AppNotice | null> {
  if (!isLocalDevOnlyUIEnabled()) {
    return null;
  }

  const existing = await loadDevAppNotices();
  return existing.find((notice) => notice.id === noticeId) ?? null;
}

/** __DEV__ 로컬 등록 공지 수정. 수정됐으면 true. */
export async function updateDevAppNotice(updated: AppNotice): Promise<boolean> {
  if (!isLocalDevOnlyUIEnabled()) {
    return false;
  }

  const existing = await loadDevAppNotices();
  const index = existing.findIndex((notice) => notice.id === updated.id);
  if (index < 0) {
    return false;
  }

  const next = [...existing];
  next[index] = updated;
  await AsyncStorage.setItem(
    DEV_PUBLISHED_NOTICES_STORAGE_KEY,
    JSON.stringify(parseAppNoticesPayload({ notices: next })),
  );
  noticeUnreadEvent.emit();
  return true;
}

/** __DEV__ 로컬 등록 공지 삭제. 삭제됐으면 true. */
export async function deleteDevAppNotice(noticeId: string): Promise<boolean> {
  if (!isLocalDevOnlyUIEnabled()) {
    return false;
  }

  const existing = await loadDevAppNotices();
  const next = existing.filter((notice) => notice.id !== noticeId);
  if (next.length === existing.length) {
    return false;
  }

  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY, JSON.stringify(next));
  noticeUnreadEvent.emit();
  return true;
}

/** __DEV__ 전체 초기화 전 — 작성한 로컬 공지 스냅샷 */
export async function backupDevPublishedNoticesForReset(): Promise<string | null> {
  if (!isLocalDevOnlyUIEnabled()) {
    return null;
  }
  return AsyncStorage.getItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY);
}

/** __DEV__ 전체 초기화 후 — 작성한 로컬 공지 복원 */
export async function restoreDevPublishedNoticesAfterReset(snapshot: string | null): Promise<void> {
  if (!isLocalDevOnlyUIEnabled() || snapshot == null) {
    return;
  }
  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_STORAGE_KEY, snapshot);
  noticeUnreadEvent.emit();
}
