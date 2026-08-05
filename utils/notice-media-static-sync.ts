import * as FileSystem from 'expo-file-system/legacy';

import type { AppNotice } from '@/utils/fetch-app-notices';

const MEDIA_UPLOAD_TIMEOUT_MS = 120_000;

export function isRemoteNoticeMediaUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri.trim());
}

export function isLocalNoticeMediaUri(uri: string): boolean {
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('ph://') ||
    trimmed.startsWith('content://') ||
    trimmed.startsWith('assets-library://')
  );
}

function guessMediaFilename(uri: string, kind: 'image' | 'video', index: number): string {
  const basename = uri.split('/').pop()?.split('?')[0] ?? '';
  if (/\.[a-z0-9]+$/i.test(basename)) {
    return basename;
  }
  return kind === 'video' ? `video-${index}.mp4` : `image-${index}.jpg`;
}

function guessMimeType(filename: string, kind: 'image' | 'video'): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return kind === 'video' ? 'video/mp4' : 'image/jpeg';
}

async function uploadLocalNoticeMediaUri(
  syncBaseUrl: string,
  noticeId: string,
  uri: string,
  kind: 'image' | 'video',
  index: number,
): Promise<string | null> {
  const filename = guessMediaFilename(uri, kind, index);
  const mimeType = guessMimeType(filename, kind);

  let dataBase64: string;
  try {
    dataBase64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MEDIA_UPLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(`${syncBaseUrl}/notices/media`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        noticeId,
        kind,
        index,
        filename,
        mimeType,
        dataBase64,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }
    const json: unknown = await res.json();
    if (
      json != null &&
      typeof json === 'object' &&
      'url' in json &&
      typeof (json as { url: unknown }).url === 'string'
    ) {
      return (json as { url: string }).url;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveNoticeMediaUris(
  syncBaseUrl: string,
  noticeId: string,
  uris: string[],
  kind: 'image' | 'video',
): Promise<string[] | null> {
  const resolved: string[] = [];
  for (let index = 0; index < uris.length; index += 1) {
    const uri = uris[index]?.trim() ?? '';
    if (uri.length === 0) {
      continue;
    }
    if (isRemoteNoticeMediaUri(uri)) {
      resolved.push(uri);
      continue;
    }
    if (!isLocalNoticeMediaUri(uri)) {
      resolved.push(uri);
      continue;
    }
    const uploaded = await uploadLocalNoticeMediaUri(syncBaseUrl, noticeId, uri, kind, index);
    if (uploaded == null) {
      return null;
    }
    resolved.push(uploaded);
  }
  return resolved;
}

/** 로컬 file:// 등 → sync 서버 업로드 후 Vercel 공개 HTTPS URL로 치환. */
export async function prepareNoticeMediaForStaticSync(
  notice: AppNotice,
  syncBaseUrl: string,
): Promise<AppNotice | null> {
  const images = await resolveNoticeMediaUris(syncBaseUrl, notice.id, notice.images, 'image');
  if (images == null) {
    return null;
  }

  let videos: string[] | undefined;
  if (notice.videos != null && notice.videos.length > 0) {
    const resolvedVideos = await resolveNoticeMediaUris(syncBaseUrl, notice.id, notice.videos, 'video');
    if (resolvedVideos == null) {
      return null;
    }
    videos = resolvedVideos;
  }

  return {
    ...notice,
    images,
    ...(videos != null && videos.length > 0 ? { videos } : {}),
  };
}
