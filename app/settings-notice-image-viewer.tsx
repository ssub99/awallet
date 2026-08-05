/**
 * Settings Notice Image Viewer
 *
 * Full-screen media gallery (images + videos). Matches Figma: settings.notice.imageViewer.default
 */

import { Icon } from '@/components/ui/icon';
import { NoticeImageViewerStatusBarSync } from '@/components/navigation/notice-image-viewer-status-bar-sync';
import { NoticeVideoSlide } from '@/components/ui/notice-video-slide';
import { NOTICE_VIDEO_TIMELINE_HEIGHT, NoticeVideoTimeline } from '@/components/ui/notice-video-timeline';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { atomicColors } from '@/constants/atomic-colors';
import {
  NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS,
} from '@/constants/notice-image-viewer-navigation-options';
import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  encodeNoticeMediaViewerParams,
  parseNoticeMediaViewerParams,
} from '@/utils/notice-image-viewer-params';
import type { NoticeMediaItem } from '@/utils/notice-media';
import { clampNoticeVideoSeekTime } from '@/utils/notice-media';
import { prefetchNoticeMediaItems } from '@/utils/prefetch-notice-media';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export { encodeNoticeMediaViewerParams };

export const options = NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS;

function resolvePageIndex(offsetX: number, pageWidth: number, itemCount: number): number {
  if (pageWidth <= 0 || itemCount <= 0) {
    return 0;
  }
  const nextIndex = Math.round(offsetX / pageWidth);
  return Math.max(0, Math.min(itemCount - 1, nextIndex));
}

export default function SettingsNoticeImageViewerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{
    media?: string | string[];
    images?: string | string[];
    initialIndex?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];

  // dismiss 중 route params가 비워져도 미디어·인덱스 유지 (재프리로드·로딩 분기 방지)
  const [{ media, initialIndex }] = useState(() =>
    parseNoticeMediaViewerParams(params.media, params.images, params.initialIndex),
  );

  const galleryHasVideo = useMemo(
    () => media.some((item) => item.type === 'video'),
    [media],
  );

  const [pageIndex, setPageIndex] = useState(initialIndex);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const [viewerSize, setViewerSize] = useState({ width, height: 0 });
  const viewerSizeRef = useRef({ width, height: 0 });
  const [videoProgress, setVideoProgress] = useState({ currentTime: 0, duration: 0 });
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [seekSeq, setSeekSeq] = useState(0);
  const [isVideoScrubbing, setIsVideoScrubbing] = useState(false);
  const [isMediaReady, setIsMediaReady] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const hasShownContentRef = useRef(false);
  const videoDurationRef = useRef(0);
  const zoomActiveRef = useRef(false);
  const listRef = useRef<FlatList<NoticeMediaItem>>(null);

  const currentItem = media[pageIndex];
  const showVideoTimeline = galleryHasVideo && currentItem?.type === 'video';

  videoDurationRef.current = videoProgress.duration;

  const handleViewerLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    if (layoutWidth <= 0 || layoutHeight <= 0) {
      return;
    }
    viewerSizeRef.current = { width: layoutWidth, height: layoutHeight };
    setViewerSize({ width: layoutWidth, height: layoutHeight });
  };

  const effectiveViewerSize =
    viewerSize.height > 0 ? viewerSize : viewerSizeRef.current;

  const handleClose = () => {
    setIsDismissing(true);
    router.back();
  };

  const handleZoomActiveChange = useCallback((active: boolean) => {
    zoomActiveRef.current = active;
    setPagerScrollEnabled(!active);
  }, []);

  const commitPageIndex = useCallback(
    (offsetX: number) => {
      const nextIndex = resolvePageIndex(offsetX, viewerSize.width, media.length);
      setPageIndex((current) => (current === nextIndex ? current : nextIndex));
    },
    [media.length, viewerSize.width],
  );

  const handleScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      commitPageIndex(event.nativeEvent.contentOffset.x);
    },
    [commitPageIndex],
  );

  const handleScrollEndDrag = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const velocityX = event.nativeEvent.velocity?.x ?? 0;
      if (Math.abs(velocityX) <= 0.05) {
        commitPageIndex(event.nativeEvent.contentOffset.x);
      }
    },
    [commitPageIndex],
  );

  useEffect(() => {
    if (viewerSize.height <= 0 || initialIndex <= 0) {
      return;
    }
    listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
  }, [initialIndex, viewerSize.height]);

  useEffect(() => {
    setVideoProgress({ currentTime: 0, duration: 0 });
    setSeekTime(null);
    setSeekSeq(0);
    setIsVideoScrubbing(false);
    setPagerScrollEnabled(true);
    zoomActiveRef.current = false;
  }, [pageIndex]);

  const handleVideoProgressChange = useCallback((currentTime: number, duration: number) => {
    setVideoProgress({ currentTime, duration });
  }, []);

  const handleVideoSeekCommit = useCallback((timeSeconds: number) => {
    const clampedTime = clampNoticeVideoSeekTime(timeSeconds, videoDurationRef.current);
    setVideoProgress((current) => ({ ...current, currentTime: clampedTime }));
    setSeekTime(clampedTime);
    setSeekSeq((seq) => seq + 1);
  }, []);

  const handleVideoSeekPreview = useCallback((timeSeconds: number) => {
    const clampedTime = clampNoticeVideoSeekTime(timeSeconds, videoDurationRef.current);
    setSeekTime(clampedTime);
    setSeekSeq((seq) => seq + 1);
  }, []);

  const handleScrubStart = useCallback(() => {
    setIsVideoScrubbing(true);
    setPagerScrollEnabled(false);
  }, []);

  const handleScrubEnd = useCallback(() => {
    setIsVideoScrubbing(false);
    setPagerScrollEnabled(true);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: pagerScrollEnabled });
  }, [navigation, pagerScrollEnabled]);

  useEffect(() => {
    let cancelled = false;

    const prepareMedia = async () => {
      if (media.length === 0) {
        hasShownContentRef.current = true;
        setIsMediaReady(true);
        return;
      }

      try {
        await prefetchNoticeMediaItems(media);
      } finally {
        if (cancelled) {
          return;
        }
        hasShownContentRef.current = true;
        setIsMediaReady(true);
      }
    };

    void prepareMedia();

    return () => {
      cancelled = true;
    };
  }, [media]);

  if (media.length === 0) {
    return (
      <>
        <NoticeImageViewerStatusBarSync />
        <SafeAreaView style={[styles.container, styles.emptyContainer]} edges={['top', 'bottom']}>
        <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Icon name="close" variant="line" size={24} color={colors.staticWhite} />
        </Pressable>
      </SafeAreaView>
      </>
    );
  }

  const pageLabel = `${pageIndex + 1}/${media.length}`;

  if (!isMediaReady && !hasShownContentRef.current) {
    return (
      <>
        <NoticeImageViewerStatusBarSync />
        <View style={styles.container} />
      </>
    );
  }

  return (
    <>
      <NoticeImageViewerStatusBarSync />
      <View style={styles.container}>

      <View style={styles.viewerContent}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            onPress={handleClose}
            style={styles.headerIconButton}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Icon name="close" variant="line" size={24} color={colors.staticWhite} />
          </Pressable>

          <Text style={[styles.headerTitle, { color: colors.staticWhite }]}>{pageLabel}</Text>

          <View style={styles.headerIconButton} />
        </View>
      </SafeAreaView>

      <View style={styles.contentColumn}>
        <View
          style={[styles.viewerBody, { backgroundColor: colors.fill }]}
          onLayout={handleViewerLayout}
        >
          {effectiveViewerSize.height > 0 ? (
            <FlatList
              ref={listRef}
              data={media}
              keyExtractor={(item, index) => `${item.type}-${item.uri}-${index}`}
              horizontal
              pagingEnabled
              scrollEnabled={pagerScrollEnabled}
              showsHorizontalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
              initialScrollIndex={initialIndex}
              getItemLayout={(_, index) => ({
                length: effectiveViewerSize.width,
                offset: effectiveViewerSize.width * index,
                index,
              })}
              onMomentumScrollEnd={handleScrollEnd}
              onScrollEndDrag={handleScrollEndDrag}
              renderItem={({ item, index }) => {
                if (item.type === 'video') {
                  return (
                    <NoticeVideoSlide
                      uri={item.uri}
                      width={effectiveViewerSize.width}
                      height={effectiveViewerSize.height}
                      isActive={index === pageIndex}
                      isDismissing={isDismissing && index === pageIndex}
                      isScrubbing={index === pageIndex && isVideoScrubbing}
                      seekTime={index === pageIndex ? seekTime : null}
                      seekSeq={index === pageIndex ? seekSeq : 0}
                      onProgressChange={handleVideoProgressChange}
                      onZoomActiveChange={handleZoomActiveChange}
                    />
                  );
                }

                return (
                  <ZoomableImage
                    uri={item.uri}
                    width={effectiveViewerSize.width}
                    height={effectiveViewerSize.height}
                    isActive={index === pageIndex}
                    onZoomActiveChange={handleZoomActiveChange}
                  />
                );
              }}
            />
          ) : null}
        </View>

        {galleryHasVideo ? (
          <View style={styles.timelineSlot}>
            {showVideoTimeline ? (
              <NoticeVideoTimeline
                currentTime={videoProgress.currentTime}
                duration={videoProgress.duration}
                onSeek={handleVideoSeekCommit}
                onScrubPreview={handleVideoSeekPreview}
                onScrubStart={handleScrubStart}
                onScrubEnd={handleScrubEnd}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomSafeArea} />
      </View>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: atomicColors.neutral[900],
  },
  viewerContent: {
    flex: 1,
  },
  emptyContainer: {
    justifyContent: 'flex-start',
    padding: 16,
  },
  safeArea: {
    backgroundColor: atomicColors.neutral[900],
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    ...typographyLayout.uiLineBody01Bold,
  },
  contentColumn: {
    flex: 1,
    minHeight: 0,
  },
  viewerBody: {
    flex: 1,
    minHeight: 0,
  },
  timelineSlot: {
    height: NOTICE_VIDEO_TIMELINE_HEIGHT,
    backgroundColor: atomicColors.neutral[900],
  },
  bottomSafeArea: {
    backgroundColor: atomicColors.neutral[900],
  },
});

/** Exported for layout tests — video body is shorter by timeline height vs image-only. */
export const NOTICE_IMAGE_VIEWER_VIDEO_BODY_INSET = NOTICE_VIDEO_TIMELINE_HEIGHT;
