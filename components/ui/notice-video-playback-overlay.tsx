import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Figma Frame 287 — 48×48 playback control badge on video viewer. */
export const NOTICE_VIDEO_PLAYBACK_OVERLAY_SIZE = 48;
const OVERLAY_ICON_SIZE = 24;
const OVERLAY_BACKGROUND = `${atomicColors.neutral[800]}B3`;
const PLAY_OVERLAY_VISIBLE_MS = 1000;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 220;

export type NoticeVideoPlaybackOverlayMode = 'play' | 'pause';

interface NoticeVideoPlaybackOverlayProps {
  mode: NoticeVideoPlaybackOverlayMode;
  /** false면 play 아이콘을 1초 후 숨기지 않음 (재생 완료 후 0초 상태). */
  playAutoHide?: boolean;
  onHidden?: () => void;
}

export function NoticeVideoPlaybackOverlay({
  mode,
  playAutoHide = true,
  onHidden,
}: NoticeVideoPlaybackOverlayProps) {
  const [visibleMode, setVisibleMode] = useState(mode);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const previousModeRef = useRef<NoticeVideoPlaybackOverlayMode | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const fadeIn = useCallback(() => {
    opacity.value = withTiming(1, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(1, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [opacity, scale]);

  const fadeOut = useCallback(
    (onComplete?: () => void) => {
      opacity.value = withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      });
      scale.value = withTiming(0.92, { duration: FADE_OUT_MS });
    },
    [opacity, scale],
  );

  const schedulePlayAutoHide = useCallback(() => {
    clearHideTimer();
    if (visibleMode !== 'play' || !playAutoHide) {
      return;
    }

    hideTimerRef.current = setTimeout(() => {
      fadeOut(() => {
        onHidden?.();
      });
      hideTimerRef.current = null;
    }, PLAY_OVERLAY_VISIBLE_MS);
  }, [clearHideTimer, fadeOut, onHidden, playAutoHide, visibleMode]);

  useEffect(() => {
    const previousMode = previousModeRef.current;

    if (previousMode == null) {
      previousModeRef.current = mode;
      setVisibleMode(mode);
      fadeIn();
      schedulePlayAutoHide();
      return;
    }

    if (previousMode === mode) {
      schedulePlayAutoHide();
      return;
    }

    previousModeRef.current = mode;
    clearHideTimer();
    fadeOut(() => {
      setVisibleMode(mode);
      fadeIn();
    });
  }, [clearHideTimer, fadeIn, fadeOut, mode, schedulePlayAutoHide]);

  useEffect(() => {
    if (visibleMode === mode) {
      schedulePlayAutoHide();
    }
  }, [mode, playAutoHide, schedulePlayAutoHide, visibleMode]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, animatedStyle]} pointerEvents="none">
      <Animated.View style={styles.badge}>
        <Icon
          name={visibleMode === 'play' ? 'play' : 'pause'}
          variant="solid"
          size={OVERLAY_ICON_SIZE}
          color={atomicColors.common[0]}
          accessibilityLabel={visibleMode === 'play' ? '재생' : '일시정지'}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: NOTICE_VIDEO_PLAYBACK_OVERLAY_SIZE,
    height: NOTICE_VIDEO_PLAYBACK_OVERLAY_SIZE,
    borderRadius: NOTICE_VIDEO_PLAYBACK_OVERLAY_SIZE / 2,
    backgroundColor: OVERLAY_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
