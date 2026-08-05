import type { NoticeMediaItem } from '@/utils/notice-media';

export function encodeNoticeImageViewerParams(images: string[], initialIndex: number) {
  const media: NoticeMediaItem[] = images.map((uri) => ({ type: 'image', uri }));
  return encodeNoticeMediaViewerParams(media, initialIndex);
}

export function encodeNoticeMediaViewerParams(media: NoticeMediaItem[], initialIndex: number) {
  return {
    media: JSON.stringify(media),
    initialIndex: String(initialIndex),
  };
}

function parseMediaParam(rawMedia: string | undefined): NoticeMediaItem[] {
  if (rawMedia == null || rawMedia.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(rawMedia);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items: NoticeMediaItem[] = [];
    for (const item of parsed) {
      if (typeof item !== 'object' || item == null) {
        continue;
      }
      const record = item as Record<string, unknown>;
      const uri = typeof record.uri === 'string' ? record.uri : '';
      if (uri.length === 0) {
        continue;
      }
      if (record.type === 'video') {
        items.push({ type: 'video', uri });
      } else if (record.type === 'image') {
        items.push({ type: 'image', uri });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function parseLegacyImagesParam(rawImages: string | undefined): NoticeMediaItem[] {
  if (rawImages == null || rawImages.length === 0) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(rawImages);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .map((uri) => ({ type: 'image' as const, uri }));
  } catch {
    return [];
  }
}

export function parseNoticeMediaViewerParams(
  mediaParam: string | string[] | undefined,
  imagesParam: string | string[] | undefined,
  initialIndexParam: string | string[] | undefined,
): { media: NoticeMediaItem[]; initialIndex: number } {
  const rawMedia = Array.isArray(mediaParam) ? mediaParam[0] : mediaParam;
  const rawImages = Array.isArray(imagesParam) ? imagesParam[0] : imagesParam;
  const rawIndex = Array.isArray(initialIndexParam) ? initialIndexParam[0] : initialIndexParam;

  const mediaFromParam = parseMediaParam(rawMedia);
  const media = mediaFromParam.length > 0 ? mediaFromParam : parseLegacyImagesParam(rawImages);

  const parsedIndex = typeof rawIndex === 'string' ? Number.parseInt(rawIndex, 10) : 0;
  const initialIndex =
    Number.isFinite(parsedIndex) && parsedIndex >= 0 && parsedIndex < media.length
      ? parsedIndex
      : 0;

  return { media, initialIndex };
}

/** @deprecated Use parseNoticeMediaViewerParams */
export function parseNoticeImageViewerParams(
  imagesParam: string | string[] | undefined,
  initialIndexParam: string | string[] | undefined,
): { images: string[]; initialIndex: number } {
  const { media, initialIndex } = parseNoticeMediaViewerParams(undefined, imagesParam, initialIndexParam);
  return {
    images: media.filter((item) => item.type === 'image').map((item) => item.uri),
    initialIndex,
  };
}
