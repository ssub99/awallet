import { getNoticeVideoThumbnailUri } from '@/utils/notice-video-thumbnail';
import { useEffect, useState } from 'react';

const thumbnailCache = new Map<string, string>();

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
      setPosterUri(cached);
      return;
    }

    let cancelled = false;
    void getNoticeVideoThumbnailUri(videoUri).then((uri) => {
      if (cancelled || uri == null) {
        return;
      }
      thumbnailCache.set(videoUri, uri);
      setPosterUri(uri);
    });

    return () => {
      cancelled = true;
    };
  }, [videoUri]);

  return posterUri;
}
