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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { setStatusBarStyle, StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export { encodeNoticeMediaViewerParams };

const IMAGE_VIEWER_STATUS_BAR_STYLE = 'light' as const;

const imageViewerStackScreenOptions = {
  headerShown: false,
  gestureEnabled: true,
  statusBarStyle: IMAGE_VIEWER_STATUS_BAR_STYLE,
} as const;

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

  const [pageIndex, setPageIndex] = useState(initialIndex);
  const [pagerScrollEnabled, setPagerScrollEnabled] = useState(true);
  const [viewerSize, setViewerSize] = useState({ width, height: 0 });
  const [videoProgress, setVideoProgress] = useState({ currentTime: 0, duration: 0 });
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const zoomActiveRef = useRef(false);
  const listRef = useRef<FlatList<NoticeMediaItem>>(null);

  const currentItem = media[pageIndex];
  const showVideoTimeline = currentItem?.type === 'video';

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

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const nextIndex = viewableItems[0]?.index;
    if (typeof nextIndex === 'number') {
      setPageIndex(nextIndex);
    }
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  useEffect(() => {
    if (viewerSize.height <= 0 || initialIndex <= 0) {
      return;
    }
    listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
  }, [initialIndex, viewerSize.height]);

  useEffect(() => {
    setVideoProgress({ currentTime: 0, duration: 0 });
    setSeekTime(null);
  }, [pageIndex]);

  const handleVideoProgressChange = useCallback((currentTime: number, duration: number) => {
    setVideoProgress({ currentTime, duration });
  }, []);

  const handleVideoSeek = useCallback((timeSeconds: number) => {
    setSeekTime(timeSeconds);
    setVideoProgress((current) => ({ ...current, currentTime: timeSeconds }));
  }, []);

  const handleScrubStart = useCallback(() => {
    setPagerScrollEnabled(false);
  }, []);

  const handleScrubEnd = useCallback(() => {
    setPagerScrollEnabled(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle(IMAGE_VIEWER_STATUS_BAR_STYLE);
      return () => {
        setStatusBarStyle('dark');
      };
    }, []),
  );

  if (media.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.emptyContainer]} edges={['top', 'bottom']}>
        <Stack.Screen options={imageViewerStackScreenOptions} />
        <StatusBar style={IMAGE_VIEWER_STATUS_BAR_STYLE} />
        <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="닫기">
          <Icon name="close" variant="line" size={24} color={colors.staticWhite} />
        </Pressable>
      </SafeAreaView>
    );
  }

  const pageLabel = `${pageIndex + 1}/${media.length}`;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...imageViewerStackScreenOptions,
          gestureEnabled: !zoomActiveRef.current,
        }}
      />
      <StatusBar style={IMAGE_VIEWER_STATUS_BAR_STYLE} />

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
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              renderItem={({ item, index }) => {
                if (item.type === 'video') {
                  return (
                    <NoticeVideoSlide
                      uri={item.uri}
                      width={viewerSize.width}
                      height={viewerSize.height}
                      isActive={index === pageIndex}
                      seekTime={index === pageIndex ? seekTime : null}
                      onProgressChange={handleVideoProgressChange}
                    />
                  );
                }

                return (
                  <ZoomableImage
                    uri={item.uri}
                    width={viewerSize.width}
                    height={viewerSize.height}
                    onZoomActiveChange={handleZoomActiveChange}
                  />
                );
              }}
            />
          ) : null}
        </View>

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
  bottomSafeArea: {
    backgroundColor: atomicColors.neutral[900],
  },
});

/** Exported for layout tests — video body is shorter by timeline height vs image-only. */
export const NOTICE_IMAGE_VIEWER_VIDEO_BODY_INSET = NOTICE_VIDEO_TIMELINE_HEIGHT;
