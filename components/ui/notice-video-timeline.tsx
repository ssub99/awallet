import { themeColors } from '@/constants/theme-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatNoticeVideoTime } from '@/utils/notice-media';
import { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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
  const [trackWidth, setTrackWidth] = useState(0);

  const seekAtLocationX = useCallback(
    (locationX: number) => {
      const trackWidth = trackWidthRef.current;
      if (trackWidth <= 0 || duration <= 0) {
        return;
      }
      const ratio = Math.min(1, Math.max(0, locationX / trackWidth));
      onSeek(ratio * duration);
    },
    [duration, onSeek],
  );

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        onScrubStart?.();
        seekAtLocationX(event.nativeEvent.locationX);
      },
      onPanResponderMove: (event) => {
        seekAtLocationX(event.nativeEvent.locationX);
      },
      onPanResponderRelease: () => {
        onScrubEnd?.();
      },
      onPanResponderTerminate: () => {
        onScrubEnd?.();
      },
    }),
  ).current;

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    trackWidthRef.current = width;
    setTrackWidth(width);
  };

  const progressRatio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const handleLeft = trackWidth > 0
    ? progressRatio * trackWidth - HANDLE_SIZE / 2
    : 0;

  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel="영상 재생 위치"
      accessibilityValue={{
        min: 0,
        max: Math.max(duration, 0),
        now: currentTime,
        text: `${formatNoticeVideoTime(currentTime)} / ${formatNoticeVideoTime(duration)}`,
      }}
    >
      <Text style={[styles.timeLabel, { color: colors.staticWhite }]}>
        {formatNoticeVideoTime(currentTime)}
      </Text>

      <View
        style={styles.trackWrap}
        onLayout={handleTrackLayout}
        {...panResponder.panHandlers}
      >
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
              transform: [{ translateX: Math.max(0, handleLeft) }],
            },
          ]}
          pointerEvents="none"
        />
      </View>

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
    left: 0,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    borderRadius: HANDLE_SIZE / 2,
    top: (HANDLE_SIZE - TRACK_HEIGHT) / 2,
  },
});
