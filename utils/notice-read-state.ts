import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNotice } from '@/utils/fetch-app-notices';

export const NOTICE_INSTALL_BASELINE_KEY = 'noticeInstallBaselineAt';
export const NOTICE_LAST_VIEWED_WATERMARK_KEY = 'noticeLastViewedWatermark';
/** __DEV__ 전용: 뱃지 숫자 확인용으로 unread 개수에 더하는 값 */
export const DEV_NOTICE_UNREAD_BONUS_KEY = 'devNoticeUnreadBonus';

type NoticeUnreadListener = () => void;
const noticeUnreadListeners = new Set<NoticeUnreadListener>();

export const noticeUnreadEvent = {
  subscribe(listener: NoticeUnreadListener): () => void {
    noticeUnreadListeners.add(listener);
    return () => {
      noticeUnreadListeners.delete(listener);
    };
  },
  emit(): void {
    for (const listener of noticeUnreadListeners) {
      listener();
    }
  },
};

function parseTimestamp(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 설치(최초 실행) 시각. 이전 공지는 뱃지 대상에서 제외한다. */
export async function ensureNoticeInstallBaseline(): Promise<number> {
  const existing = parseTimestamp(await AsyncStorage.getItem(NOTICE_INSTALL_BASELINE_KEY));
  if (existing != null) {
    return existing;
  }
  const baseline = Date.now();
  await AsyncStorage.setItem(NOTICE_INSTALL_BASELINE_KEY, String(baseline));
  return baseline;
}

export async function getNoticeLastViewedWatermark(installBaselineAt: number): Promise<number> {
  const stored = parseTimestamp(await AsyncStorage.getItem(NOTICE_LAST_VIEWED_WATERMARK_KEY));
  return stored ?? installBaselineAt;
}

/** 설치 이후 + 마지막 열람 이후에 게시된 공지만 unread 로 센다. */
export function countUnreadNotices(
  notices: AppNotice[],
  installBaselineAt: number,
  lastViewedWatermark: number,
): number {
  return notices.filter(
    (notice) =>
      notice.publishedAt > installBaselineAt && notice.publishedAt > lastViewedWatermark,
  ).length;
}

/** 공지 화면을 나갈 때 호출 — 현재 목록 기준으로 watermark 갱신. */
export async function markNoticesViewed(notices: AppNotice[]): Promise<void> {
  const watermark =
    notices.length > 0
      ? Math.max(...notices.map((notice) => notice.publishedAt))
      : Date.now();
  await AsyncStorage.setItem(NOTICE_LAST_VIEWED_WATERMARK_KEY, String(watermark));
  if (__DEV__) {
    await AsyncStorage.removeItem(DEV_NOTICE_UNREAD_BONUS_KEY);
  }
  noticeUnreadEvent.emit();
}

export async function getDevNoticeUnreadBonus(): Promise<number> {
  if (!__DEV__) return 0;
  return parseTimestamp(await AsyncStorage.getItem(DEV_NOTICE_UNREAD_BONUS_KEY)) ?? 0;
}

export async function incrementDevNoticeUnreadBonus(): Promise<number> {
  const next = (await getDevNoticeUnreadBonus()) + 1;
  await AsyncStorage.setItem(DEV_NOTICE_UNREAD_BONUS_KEY, String(next));
  noticeUnreadEvent.emit();
  return next;
}
