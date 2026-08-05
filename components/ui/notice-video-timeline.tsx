import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  clampNoticeVideoSeekTime,
  formatNoticeVideoTime,
} from '@/utils/notice-media';
import { useCallback, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

/** Figma Frame 284 — video viewer timeline bar. */
export const NOTICE_VIDEO_TIMELINE_HEIGHT = 48;
const TRACK_HEIGHT = 4;
const HANDLE_SIZE = 16;
const HORIZONTAL_PADDING = 16;

interface NoticeVideoTimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (timeSeconds: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export function NoticeVideoTimeline({
  currentTime,
  duration,
  onSeek,
  onScrubStart,
  onScrubEnd,
}: NoticeVideoTimelineProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const trackWidthRef = useRef(0);
  const durationRef = useRef(duration);
  const onSeekRef = useRef(onSeek);
  const onScrubStartRef = useRef(onScrubStart);
  const onScrubEndRef = useRef(onScrubEnd);
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  durationRef.current = duration;
  onSeekRef.current = onSeek;
  onScrubStartRef.current = onScrubStart;
  onScrubEndRef.current = onScrubEnd;

  const seekAtLocationX = useCallback((locationX: number, updateScrubState: boolean) => {
    const width = trackWidthRef.current;
    const currentDuration = durationRef.current;
    if (width <= 0 || currentDuration <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, locationX / width));
    const nextTime = clampNoticeVideoSeekTime(ratio * currentDuration, currentDuration);
    if (updateScrubState) {
      setScrubTime(nextTime);
    }
    onSeekRef.current(nextTime);
  }, []);

  const handleScrubStart = useCallback(() => {
    onScrubStartRef.current?.();
  }, []);

  const handleScrubEnd = useCallback(() => {
    setScrubTime(null);
    onScrubEndRef.current?.();
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((event) => {
          runOnJS(handleScrubStart)();
          runOnJS(seekAtLocationX)(event.x, true);
        })
        .onUpdate((event) => {
          runOnJS(seekAtLocationX)(event.x, true);
        })
        .onFinalize(() => {
          runOnJS(handleScrubEnd)();
        }),
    [handleScrubEnd, handleScrubStart, seekAtLocationX],
  );

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  const displayTime = scrubTime ?? currentTime;
  const progressRatio =
    duration > 0 ? Math.min(1, Math.max(0, displayTime / duration)) : 0;
  const handleLeft =
    trackWidth > 0
      ? Math.min(
          Math.max(0, progressRatio * trackWidth - HANDLE_SIZE / 2),
          Math.max(0, trackWidth - HANDLE_SIZE),
        )
      : 0;

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
            <View
              style={[
                styles.trackProgress,
                {
                  backgroundColor: colors.primary,
                  width: `${progressRatio * 100}%`,
                },
              ]}
            />
          </View>
          <View
            style={[
              styles.handle,
              {
                backgroundColor: colors.primary,
                left: handleLeft,
              },
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
