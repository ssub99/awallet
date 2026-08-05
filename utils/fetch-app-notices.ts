import { APP_NOTICES_URL } from '@/constants/api';
import { loadDevAppNotices } from '@/utils/dev-app-notices';

const FETCH_TIMEOUT_MS = 12_000;

export interface AppNotice {
  id: string;
  title: string;
  dateLabel: string;
  publishedAt: number;
  body: string;
  images: string[];
  videos?: string[];
}

export interface AppNoticesPayload {
  notices: AppNotice[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePublishedAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseNoticeItem(value: unknown): AppNotice | null {
  if (!isRecord(value)) return null;

  const id = asNonEmptyString(value.id);
  const title = asNonEmptyString(value.title);
  const dateLabel = asNonEmptyString(value.dateLabel);
  const body = asNonEmptyString(value.body) ?? '';
  const publishedAt = parsePublishedAt(value.publishedAt);

  if (id == null || title == null || dateLabel == null || publishedAt == null) {
    return null;
  }

  const images: string[] = [];
  if (Array.isArray(value.images)) {
    for (const item of value.images) {
      const url = asNonEmptyString(item);
      if (url != null) {
        images.push(url);
      }
    }
  }

  const videos: string[] = [];
  if (Array.isArray(value.videos)) {
    for (const item of value.videos) {
      const url = asNonEmptyString(item);
      if (url != null) {
        videos.push(url);
      }
    }
  }

  return {
    id,
    title,
    dateLabel,
    publishedAt,
    body,
    images,
    ...(videos.length > 0 ? { videos } : {}),
  };
}

/** 원격 app-notices.json 파싱. 최신순 정렬. */
export function parseAppNoticesPayload(data: unknown): AppNotice[] {
  if (!isRecord(data) || !Array.isArray(data.notices)) {
    return [];
  }

  const notices: AppNotice[] = [];
  for (const item of data.notices) {
    const parsed = parseNoticeItem(item);
    if (parsed != null) {
      notices.push(parsed);
    }
  }

  return notices.sort((a, b) => b.publishedAt - a.publishedAt);
}

/** Vercel app-notices.json + __DEV__ static sync(static/app-notices.json). */
export async function fetchAppNotices(): Promise<AppNotice[]> {
  const devNotices = await loadDevAppNotices();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(APP_NOTICES_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return devNotices;
    }
    const json: unknown = await res.json();
    const remote = parseAppNoticesPayload(json);
    const byId = new Map<string, AppNotice>();
    for (const notice of [...devNotices, ...remote]) {
      byId.set(notice.id, notice);
    }
    return [...byId.values()].sort((a, b) => b.publishedAt - a.publishedAt);
  } catch {
    return devNotices;
  } finally {
    clearTimeout(timer);
  }
}
