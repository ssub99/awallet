import type { AppNotice } from '@/utils/fetch-app-notices';

export type NoticeMediaItem =
  | { type: 'image'; uri: string }
  | { type: 'video'; uri: string };

export function buildNoticeMediaItems(notice: AppNotice): NoticeMediaItem[] {
  const items: NoticeMediaItem[] = [];
  for (const uri of notice.images) {
    items.push({ type: 'image', uri });
  }
  for (const uri of notice.videos ?? []) {
    items.push({ type: 'video', uri });
  }
  return items;
}

export function countNoticeAttachments(notice: Pick<AppNotice, 'images' | 'videos'>): number {
  return notice.images.length + (notice.videos?.length ?? 0);
}

export function formatNoticeVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
