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

/** Clamp seek position to [0, duration] — centisecond precision (0.01s). */
export function clampNoticeVideoSeekTime(seconds: number, duration: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const clamped = Math.min(seconds, duration);
  return Math.round(clamped * 100) / 100;
}

/** Scrub/재생 중 타임라인 라벨 — 0.01초(1/100초) 단위. */
export function formatNoticeVideoTimeFine(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00.00';
  }
  const totalCentis = Math.floor(seconds * 100);
  const minutes = Math.floor(totalCentis / 6000);
  const secs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** @deprecated Use formatNoticeVideoTimeFine */
export function formatNoticeVideoTimePrecise(seconds: number): string {
  return formatNoticeVideoTimeFine(seconds);
}

/** @deprecated Use clampNoticeVideoSeekTime for smooth timeline scrubbing. */
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
  console.assert(clampNoticeVideoSeekTime(12.4567, 65.9) === 12.46, 'centisecond seek');
  console.assert(clampNoticeVideoSeekTime(70, 65.9) === 65.9, 'seek clamp');
  return true;
}
