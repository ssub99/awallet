import * as VideoThumbnails from 'expo-video-thumbnails';

export async function getNoticeVideoThumbnailUri(videoUri: string): Promise<string | null> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: 0,
      quality: 0.85,
    });
    return uri;
  } catch {
    return null;
  }
}
