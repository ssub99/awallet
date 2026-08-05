/**
 * Settings Notice Image Viewer
 *
 * Full-screen media gallery (images + videos). Matches Figma: settings.notice.imageViewer.default
 */

import { Icon } from '@/components/ui/icon';
import { NoticeVideoSlide } from '@/components/ui/notice-video-slide';
import { NOTICE_VIDEO_TIMELINE_HEIGHT, NoticeVideoTimeline } from '@/components/ui/notice-video-timeline';
import { ZoomableImage } from '@/components/ui/zoomable-image';
import { atomicColors } from '@/constants/atomic-colors';
import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  encodeNoticeMediaViewerParams,
  parseNoticeMediaViewerParams,
} from '@/utils/notice-image-viewer-params';
import type { NoticeMediaItem } from '@/utils/notice-media';
import { clampNoticeVideoSeekTime } from '@/utils/notice-media';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export { encodeNoticeMediaViewerParams };

const imageViewerStackScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  // iOS: Stack statusBarStyle는 Expo Go·일부 바이너리에서 UIViewControllerBasedStatusBarAppearance 크래시 유발 → RN StatusBar만 사용
  ...(Platform.OS === 'android'
    ? { statusBarStyle: 'light' as const, statusBarBackgroundColor: atomicColors.neutral[900] }
    : {}),
} as const;

function resolvePageIndex(offsetX: number, pageWidth: number, itemCount: number): number {
  if (pageWidth <= 0 || itemCount <= 0) {
    return 0;
  }
  const nextIndex = Math.round(offsetX / pageWidth);
  return Math.max(0, Math.min(itemCount - 1, nextIndex));
}

export default function SettingsNoticeImageViewerScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    media?: string | string[];
    images?: string | string[];
    initialIndex?: string | string[];
  }>();
  const { width } = useWindowDimensions();
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];

  const { media, initialIndex } = useMemo(
    () => parseNoticeMediaViewerParams(params.media, params.images, params.initialIndex),
    [params.images, params.initialIndex, params.media],
  );

  const galleryHasVideo = useMemo(
    () => media.some((item) => item.type === 'video'),
    [media],
  );

  const [pageIndex, setPageIndex] = useState(initialIndex);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const [viewerSize, setViewerSize] = useState({ width, height: 0 });
  const [videoProgress, setVideoProgress] = useState({ currentTime: 0, duration: 0 });
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [seekSeq, setSeekSeq] = useState(0);
  const [isVideoScrubbing, setIsVideoScrubbing] = useState(false);
  const videoDurationRef = useRef(0);
  const zoomActiveRef = useRef(false);
  const listRef = useRef<FlatList<NoticeMediaItem>>(null);

  const currentItem = media[pageIndex];
  const showVideoTimeline = galleryHasVideo && currentItem?.type === 'video';

  videoDurationRef.current = videoProgress.duration;

  const handleViewerLayout = (event: LayoutChangeEvent) => {
    const { width: layoutWidth, height: layoutHeight } = event.nativeEvent.layout;
    setViewerSize({ width: layoutWidth, height: layoutHeight });
  };

  const handleClose = () => {
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

  const handleVideoSeek = useCallback((timeSeconds: number) => {
    const clampedTime = clampNoticeVideoSeekTime(timeSeconds, videoDurationRef.current);
    setVideoProgress((current) => ({ ...current, currentTime: clampedTime }));
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

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') {
        return undefined;
      }
      StatusBar.setBarStyle('light-content');
      return () => {
        StatusBar.setBarStyle('dark-content');
      };
    }, []),
  );

  if (media.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.emptyContainer]} edges={['top', 'bottom']}>
        <Stack.Screen options={imageViewerStackScreenOptions} />
        {Platform.OS === 'ios' ? (
          <StatusBar barStyle="light-content" backgroundColor={atomicColors.neutral[900]} />
        ) : null}
        <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Icon name="close" variant="line" size={24} color={colors.staticWhite} />
        </Pressable>
      </SafeAreaView>
    );
  }

  const pageLabel = `${pageIndex + 1}/${media.length}`;

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <StatusBar barStyle="light-content" backgroundColor={atomicColors.neutral[900]} />
      ) : null}
      <Stack.Screen
        options={{
          ...imageViewerStackScreenOptions,
          gestureEnabled: !zoomActiveRef.current,
        }}
      />

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
          {viewerSize.height > 0 ? (
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
                length: viewerSize.width,
                offset: viewerSize.width * index,
                index,
              })}
              onMomentumScrollEnd={handleScrollEnd}
              onScrollEndDrag={handleScrollEndDrag}
              renderItem={({ item, index }) => {
                if (item.type === 'video') {
                  return (
                    <NoticeVideoSlide
                      uri={item.uri}
                      width={viewerSize.width}
                      height={viewerSize.height}
                      isActive={index === pageIndex}
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
                    width={viewerSize.width}
                    height={viewerSize.height}
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
                onSeek={handleVideoSeek}
                onScrubStart={handleScrubStart}
                onScrubEnd={handleScrubEnd}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottomSafeArea} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: atomicColors.neutral[900],
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
