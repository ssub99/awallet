import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  clampNoticeVideoSeekTime,
  formatNoticeVideoTime,
} from '@/utils/notice-media';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Figma Frame 284 — video viewer timeline bar. */
export const NOTICE_VIDEO_TIMELINE_HEIGHT = 48;
const TRACK_HEIGHT = 4;
const HANDLE_SIZE = 16;
const HORIZONTAL_PADDING = 16;
/** 드래그 중 player.currentTime 갱신·시간 라벨 갱신 간격 (초기 터치 제외) */
const SCRUB_PREVIEW_INTERVAL_MS = 200;

interface NoticeVideoTimelineProps {
  currentTime: number;
  duration: number;
  /** 드래그 종료(또는 탭) 시 최종 시크 */
  onSeek: (timeSeconds: number) => void;
  /** 드래그 중 영상 프레임 미리보기 — throttle 적용 */
  onScrubPreview?: (timeSeconds: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function NoticeVideoTimeline({
  currentTime,
  duration,
  onSeek,
  onScrubPreview,
  onScrubStart,
  onScrubEnd,
}: NoticeVideoTimelineProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const trackWidthRef = useRef(0);
  const durationRef = useRef(duration);
  const isScrubbingRef = useRef(false);
  const onSeekRef = useRef(onSeek);
  const onScrubPreviewRef = useRef(onScrubPreview);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubEndRef = useRef(onScrubEnd);
  const lastPreviewSeekMsRef = useRef(0);
  const justDroppedTimeRef = useRef(0);
  const [scrubTimeLabel, setScrubTimeLabel] = useState<number | null>(null);

  const trackWidthSv = useSharedValue(0);
  const scrubRatioSv = useSharedValue(0);

  durationRef.current = duration;
  onSeekRef.current = onSeek;
  onScrubPreviewRef.current = onScrubPreview;
  onScrubStartRef.current = onScrubStart;
  onScrubEndRef.current = onScrubEnd;

  useEffect(() => {
    if (isScrubbingRef.current || duration <= 0) {
      return;
    }
    // 드롭 직후 150ms는 무시 (seek 완료 대기)
    const timeSinceDropped = Date.now() - justDroppedTimeRef.current;
    if (timeSinceDropped < 150) {
      return;
    }
    const targetRatio = Math.min(1, Math.max(0, currentTime / duration));
    // 부드러운 전환 (드롭 후 또는 일반 재생 중)
    scrubRatioSv.value = withTiming(targetRatio, { duration: 100 });
  }, [currentTime, duration, scrubRatioSv]);

  const resolveSeekTime = useCallback((locationX: number): number | null => {
    const width = trackWidthRef.current;
    const currentDuration = durationRef.current;
    if (width <= 0 || currentDuration <= 0) {
      return null;
    }
    const ratio = Math.min(1, Math.max(0, locationX / width));
    return clampNoticeVideoSeekTime(ratio * currentDuration, currentDuration);
  }, []);

  const immediatePreviewSeek = useCallback((locationX: number) => {
    const nextTime = resolveSeekTime(locationX);
    if (nextTime == null) {
      return;
    }
    lastPreviewSeekMsRef.current = Date.now();
    setScrubTimeLabel(nextTime);
    onScrubPreviewRef.current?.(nextTime);
  }, [resolveSeekTime]);

  const maybePreviewSeek = useCallback((locationX: number) => {
    const nextTime = resolveSeekTime(locationX);
    if (nextTime == null) {
      return;
    }
    const now = Date.now();
    if (now - lastPreviewSeekMsRef.current < SCRUB_PREVIEW_INTERVAL_MS) {
      return;
    }
    lastPreviewSeekMsRef.current = now;
    setScrubTimeLabel(nextTime);
    onScrubPreviewRef.current?.(nextTime);
  }, [resolveSeekTime]);

  const commitSeek = useCallback((locationX: number) => {
    const nextTime = resolveSeekTime(locationX);
    if (nextTime == null) {
      return;
    }
    setScrubTimeLabel(nextTime);
    onSeekRef.current(nextTime);
  }, [resolveSeekTime]);

  const handleScrubStart = useCallback(() => {
    isScrubbingRef.current = true;
    onScrubStartRef.current?.();
  }, []);

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false;
    justDroppedTimeRef.current = Date.now();
    setScrubTimeLabel(null);
    onScrubEndRef.current?.();
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((event) => {
          'worklet';
          const width = trackWidthSv.value;
          if (width > 0) {
            scrubRatioSv.value = Math.min(1, Math.max(0, event.x / width));
          }
          runOnJS(handleScrubStart)();
          runOnJS(immediatePreviewSeek)(event.x);
        })
        .onUpdate((event) => {
          'worklet';
          const width = trackWidthSv.value;
          if (width > 0) {
            scrubRatioSv.value = Math.min(1, Math.max(0, event.x / width));
          }
          runOnJS(maybePreviewSeek)(event.x);
        })
        .onFinalize((event) => {
          'worklet';
          const width = trackWidthSv.value;
          if (width > 0) {
            scrubRatioSv.value = Math.min(1, Math.max(0, event.x / width));
          }
          runOnJS(commitSeek)(event.x);
          runOnJS(handleScrubEnd)();
        }),
    [
      commitSeek,
      handleScrubEnd,
      handleScrubStart,
      immediatePreviewSeek,
      maybePreviewSeek,
      scrubRatioSv,
      trackWidthSv,
    ],
  );

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    trackWidthSv.value = width;
  };

  const handleAnimatedStyle = useAnimatedStyle(() => {
    const width = trackWidthSv.value;
    const ratio = scrubRatioSv.value;
    if (width <= 0) {
      return { left: 0 };
    }
    const maxLeft = Math.max(0, width - HANDLE_SIZE);
    const left = Math.min(Math.max(0, ratio * width - HANDLE_SIZE / 2), maxLeft);
    return { left };
  });

  const progressAnimatedStyle = useAnimatedStyle(() => {
    const width = trackWidthSv.value;
    const ratio = scrubRatioSv.value;
    return { width: Math.max(0, ratio * width) };
  });

  const displayTime = scrubTimeLabel ?? currentTime;

  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel="영상 재생 위치"
      accessibilityValue={{
        text: `${formatNoticeVideoTime(displayTime)} / ${formatNoticeVideoTime(duration)}`,
      }}
    >
      <Text style={[styles.timeLabel, { color: colors.staticWhite }]}>
        {formatNoticeVideoTime(displayTime)}
      </Text>

      <GestureDetector gesture={panGesture}>
        <View style={styles.trackWrap} onLayout={handleTrackLayout}>
          <View style={[styles.track, { backgroundColor: colors.fill }]}>
            <Animated.View
              style={[
                styles.trackProgress,
                { backgroundColor: colors.primary },
                progressAnimatedStyle,
              ]}
            />
          </View>
          <Animated.View
            style={[
              styles.handle,
              { backgroundColor: colors.primary },
              handleAnimatedStyle,
            ]}
            pointerEvents="none"
          />
        </View>
      </GestureDetector>

      <Text style={[styles.timeLabel, styles.durationLabel, { color: colors.staticWhite }]}>
        {formatNoticeVideoTime(duration)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: NOTICE_VIDEO_TIMELINE_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: HORIZONTAL_PADDING,
    gap: 10,
  },
  timeLabel: {
    ...typographyLayout.uiLineBody02Medium,
    minWidth: 30,
  },
  durationLabel: {
    textAlign: 'right',
    minWidth: 28,
  },
  trackWrap: {
    flex: 1,
    height: HANDLE_SIZE,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 8,
    overflow: 'hidden',
  },
  trackProgress: {
    height: TRACK_HEIGHT,
    borderRadius: 8,
  },
  handle: {
    position: 'absolute',
    top: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
  },
});
