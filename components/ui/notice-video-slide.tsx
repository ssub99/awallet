import {
  NoticeVideoPlaybackOverlay,
  type NoticeVideoPlaybackOverlayMode,
} from '@/components/ui/notice-video-playback-overlay';
import { ZoomableView } from '@/components/ui/zoomable-view';
import { themeColors } from '@/constants/theme-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNoticeVideoThumbnail } from '@/hooks/use-notice-video-thumbnail';
import { useEventListener } from 'expo';
import { useNavigation } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface NoticeVideoSlideProps {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  isDismissing?: boolean;
  isScrubbing: boolean;
  seekTime: number | null;
  seekSeq: number;
  onProgressChange: (currentTime: number, duration: number) => void;
  onZoomActiveChange?: (active: boolean) => void;
}

export function NoticeVideoSlide({
  uri,
  width,
  height,
  isActive,
  isDismissing = false,
  isScrubbing,
  seekTime,
  seekSeq,
  onProgressChange,
  onZoomActiveChange,
}: NoticeVideoSlideProps) {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const posterUri = useNoticeVideoThumbnail(uri);
  const [overlayMode, setOverlayMode] = useState<NoticeVideoPlaybackOverlayMode | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [playAutoHide, setPlayAutoHide] = useState(true);
  const resumedFromPauseRef = useRef(false);
  const endedNaturallyRef = useRef(false);
  const playAtEndRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);
  const isClosingRef = useRef(false);

  const player = useVideoPlayer(uri, (instance) => {
    instance.timeUpdateEventInterval = 0.03;
  });

  const handleOverlayHidden = useCallback(() => {
    setOverlayMode(null);
  }, []);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (isActive && !isScrubbingRef.current) {
      onProgressChange(currentTime, player.duration);
    }
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (isActive && status === 'readyToPlay') {
      onProgressChange(player.currentTime, player.duration);
    }
  });

  useEventListener(player, 'playToEnd', () => {
    if (!isActive || isScrubbingRef.current) {
      return;
    }

    endedNaturallyRef.current = true;
    playAtEndRef.current = true;
    player.pause();
    player.currentTime = 0;
    onProgressChange(0, player.duration);
    setPlayAutoHide(false);
    setOverlayMode('play');
    resumedFromPauseRef.current = false;
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isActive || isScrubbingRef.current || isClosingRef.current) {
      return;
    }

    if (!isPlaying) {
      if (endedNaturallyRef.current) {
        endedNaturallyRef.current = false;
        return;
      }

      setPlayAutoHide(false);
      setOverlayMode('pause');
      resumedFromPauseRef.current = true;
      playAtEndRef.current = false;
      return;
    }

    if (playAtEndRef.current) {
      playAtEndRef.current = false;
      setPlayAutoHide(true);
      if (overlayMode === 'play') {
        setOverlayMode(null);
        queueMicrotask(() => {
          setOverlayMode('play');
        });
      } else {
        setOverlayMode('play');
      }
      resumedFromPauseRef.current = false;
      return;
    }

    if (resumedFromPauseRef.current) {
      setPlayAutoHide(true);
      setOverlayMode('play');
      resumedFromPauseRef.current = false;
      return;
    }

    setOverlayMode(null);
  });

  useEffect(() => {
    if (!isDismissing) {
      return;
    }
    isClosingRef.current = true;
    setOverlayMode(null);
    player.pause();
  }, [isDismissing, player]);

  useEffect(() => {
    const onTransitionStart = navigation.addListener('transitionStart', (event) => {
      if (event.data?.closing !== true) {
        return;
      }
      isClosingRef.current = true;
      setIsClosing(true);
      setOverlayMode(null);
      player.pause();
    });

    const onTransitionEnd = navigation.addListener('transitionEnd', (event) => {
      if (event.data?.closing !== true) {
        return;
      }
      isClosingRef.current = false;
      setIsClosing(false);
    });

    return () => {
      onTransitionStart();
      onTransitionEnd();
    };
  }, [navigation, player]);

  useEffect(() => {
    if (!isActive) {
      player.pause();
      player.currentTime = 0;
      setOverlayMode(null);
      setPlayAutoHide(true);
      resumedFromPauseRef.current = false;
      endedNaturallyRef.current = false;
      playAtEndRef.current = false;
      isScrubbingRef.current = false;
      wasPlayingBeforeScrubRef.current = false;
      return;
    }

    if (isClosingRef.current || isDismissing) {
      player.pause();
      return;
    }

    void player.play();
  }, [isActive, isDismissing, player]);

  useEffect(() => {
    if (isScrubbing) {
      if (!isScrubbingRef.current) {
        wasPlayingBeforeScrubRef.current = player.playing;
        isScrubbingRef.current = true;
        player.pause();
      }
      return;
    }

    if (!isScrubbingRef.current) {
      return;
    }

    isScrubbingRef.current = false;
    if (wasPlayingBeforeScrubRef.current) {
      void player.play();
    }
    wasPlayingBeforeScrubRef.current = false;
  }, [isScrubbing, player]);

  useEffect(() => {
    if (seekTime == null || !isActive || seekSeq <= 0) {
      return;
    }

    player.currentTime = seekTime;

    if (wasPlayingBeforeScrubRef.current || player.playing) {
      void player.play();
    }
  }, [isActive, player, seekSeq, seekTime]);

  const handleTogglePlayback = useCallback(() => {
    if (isClosingRef.current || isDismissing) {
      return;
    }
    if (player.playing) {
      player.pause();
      return;
    }
    void player.play();
  }, [isDismissing, player]);

  const showDismissPoster = (isClosing || isDismissing) && posterUri != null;

  return (
    <View style={[styles.container, { width, height, backgroundColor: colors.fill }]}>
      <ZoomableView
        width={width}
        height={height}
        isActive={isActive && !isClosing && !isDismissing}
        onZoomActiveChange={onZoomActiveChange}
        onSingleTap={handleTogglePlayback}
      >
        <VideoView
          style={[styles.video, showDismissPoster ? styles.videoHidden : null]}
          player={player}
          contentFit="contain"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          accessibilityLabel="확대 가능한 공지 영상"
        />
        {overlayMode != null && !showDismissPoster ? (
          <NoticeVideoPlaybackOverlay
            mode={overlayMode}
            playAutoHide={playAutoHide}
            onHidden={handleOverlayHidden}
          />
        ) : null}
      </ZoomableView>
      {showDismissPoster ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.dismissPoster}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={0}
          pointerEvents="none"
          accessibilityLabel="공지 영상"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoHidden: {
    opacity: 0,
  },
  dismissPoster: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
});
