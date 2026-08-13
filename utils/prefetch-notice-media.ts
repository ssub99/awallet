import { awaitNoticeVideoThumbnail } from '@/hooks/use-notice-video-thumbnail';
import type { AppNotice } from '@/utils/fetch-app-notices';
import { buildNoticeMediaItems, type NoticeMediaItem } from '@/utils/notice-media';
import { Image } from 'expo-image';

async function prefetchNoticeImage(uri: string): Promise<void> {
  try {
    await Image.prefetch(uri, 'memory-disk');
  } catch {
    // ponytail: 한 항목 실패해도 전체 목록 표시는 진행
  }
}

async function prefetchNoticeMediaItem(item: NoticeMediaItem): Promise<void> {
  if (item.type === 'image') {
    await prefetchNoticeImage(item.uri);
    return;
  }

  const posterUri = await awaitNoticeVideoThumbnail(item.uri);
  if (posterUri != null) {
    await prefetchNoticeImage(posterUri);
  }
}

/** 공지 첨부 이미지·영상 썸네일 전부 프리로드 */
export async function prefetchNoticeMediaItems(items: NoticeMediaItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await Promise.all(items.map((item) => prefetchNoticeMediaItem(item)));
}

/** 여러 공지의 첨부 미디어 일괄 프리로드 */
export async function prefetchNoticesMedia(notices: AppNotice[]): Promise<void> {
  const items = notices.flatMap((notice) => buildNoticeMediaItems(notice));
  await prefetchNoticeMediaItems(items);
}
