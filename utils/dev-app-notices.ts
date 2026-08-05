import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  parseAppNoticesPayload,
  type AppNotice,
} from '@/utils/fetch-app-notices';
import { noticeUnreadEvent } from '@/utils/notice-read-state';

const DEV_PUBLISHED_NOTICES_KEY = 'devPublishedAppNotices';

/** __DEV__ 전용 — 작성 화면에서 등록한 공지 (로컬 URI 이미지 포함). */
export async function loadDevAppNotices(): Promise<AppNotice[]> {
  if (!__DEV__) {
    return [];
  }

  try {
    const raw = await AsyncStorage.getItem(DEV_PUBLISHED_NOTICES_KEY);
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
  if (!__DEV__) {
    return;
  }

  const existing = await loadDevAppNotices();
  const merged = parseAppNoticesPayload({ notices: [notice, ...existing] });
  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_KEY, JSON.stringify(merged));
  noticeUnreadEvent.emit();
}

/** __DEV__ 로컬 등록 공지 삭제. 삭제됐으면 true. */
export async function deleteDevAppNotice(noticeId: string): Promise<boolean> {
  if (!__DEV__) {
    return false;
  }

  const existing = await loadDevAppNotices();
  const next = existing.filter((notice) => notice.id !== noticeId);
  if (next.length === existing.length) {
    return false;
  }

  await AsyncStorage.setItem(DEV_PUBLISHED_NOTICES_KEY, JSON.stringify(next));
  noticeUnreadEvent.emit();
  return true;
}
