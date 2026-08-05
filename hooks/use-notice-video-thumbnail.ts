import { getNoticeVideoThumbnailUri } from '@/utils/notice-video-thumbnail';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';

const thumbnailCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function loadNoticeVideoThumbnail(videoUri: string): Promise<string | null> {
  const cached = thumbnailCache.get(videoUri);
  if (cached != null) {
    return Promise.resolve(cached);
  }

  const pending = inflight.get(videoUri);
  if (pending != null) {
    return pending;
  }

  const promise = getNoticeVideoThumbnailUri(videoUri).then((uri) => {
    inflight.delete(videoUri);
    if (uri == null) {
      return null;
    }
    thumbnailCache.set(videoUri, uri);
    void Image.prefetch(uri);
    return uri;
  });
  inflight.set(videoUri, promise);
  return promise;
}

/** 리스트 등장 시 백그라운드 썸네일 생성 — 펼치기 전 캐시 워밍 */
export function prefetchNoticeVideoThumbnail(videoUri: string): void {
  void loadNoticeVideoThumbnail(videoUri);
}

export function useNoticeVideoThumbnail(videoUri: string | null): string | null {
  const [posterUri, setPosterUri] = useState<string | null>(() => {
    if (videoUri == null) {
      return null;
    }
    return thumbnailCache.get(videoUri) ?? null;
  });

  useEffect(() => {
    if (videoUri == null) {
      setPosterUri(null);
      return;
    }

    const cached = thumbnailCache.get(videoUri);
    if (cached != null) {
      setPosterUri((current) => (current === cached ? current : cached));
      return;
    }

    let cancelled = false;
    void loadNoticeVideoThumbnail(videoUri).then((uri) => {
      if (cancelled || uri == null) {
        return;
      }
      setPosterUri(uri);
    });

    return () => {
      cancelled = true;
    };
  }, [videoUri]);

  return posterUri;
}
