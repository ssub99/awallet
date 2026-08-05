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

/** Scrubber upper bound — whole seconds from 0 through floor(duration). */
export function getNoticeVideoMaxSeekSecond(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.max(0, Math.floor(duration));
}

/** Playback label / handle position — stays on the current whole second. */
export function floorNoticeVideoDisplaySecond(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.min(Math.floor(seconds), getNoticeVideoMaxSeekSecond(duration));
}

/** Timeline scrub — snaps to the nearest whole second within range. */
export function snapNoticeVideoSeekSecond(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0;
  }
  return Math.min(Math.round(seconds), getNoticeVideoMaxSeekSecond(duration));
}

/* ponytail: self-check only — run via scripts/verify-notice-video-media.ts */
export function verifyNoticeVideoTimeHelpers(): boolean {
  console.assert(getNoticeVideoMaxSeekSecond(65.9) === 65, 'max seek second');
  console.assert(floorNoticeVideoDisplaySecond(12.8, 65.9) === 12, 'floor display');
  console.assert(snapNoticeVideoSeekSecond(12.4, 65.9) === 12, 'snap down');
  console.assert(snapNoticeVideoSeekSecond(12.6, 65.9) === 13, 'snap up');
  console.assert(snapNoticeVideoSeekSecond(70, 65.9) === 65, 'snap clamp');
  return true;
}
