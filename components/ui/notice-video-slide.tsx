import {
  NoticeVideoPlaybackOverlay,
  type NoticeVideoPlaybackOverlayMode,
} from '@/components/ui/notice-video-playback-overlay';
import { ZoomableView } from '@/components/ui/zoomable-view';
import { themeColors } from '@/constants/theme-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface NoticeVideoSlideProps {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
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
  isScrubbing,
  seekTime,
  seekSeq,
  onProgressChange,
  onZoomActiveChange,
}: NoticeVideoSlideProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const [overlayMode, setOverlayMode] = useState<NoticeVideoPlaybackOverlayMode | null>(null);
  const [playAutoHide, setPlayAutoHide] = useState(true);
  const resumedFromPauseRef = useRef(false);
  const endedNaturallyRef = useRef(false);
  const playAtEndRef = useRef(false);
  const isScrubbingRef = useRef(false);
  const wasPlayingBeforeScrubRef = useRef(false);

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
    if (!isActive || isScrubbingRef.current) {
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

    void player.play();
  }, [isActive, player]);

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
    if (player.playing) {
      player.pause();
      return;
    }
    void player.play();
  }, [player]);

  return (
    <View style={[styles.container, { width, height, backgroundColor: colors.fill }]}>
      <ZoomableView
        width={width}
        height={height}
        isActive={isActive}
        onZoomActiveChange={onZoomActiveChange}
        onSingleTap={handleTogglePlayback}
      >
        <VideoView
          style={styles.video}
          player={player}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
          allowsPictureInPicture={false}
          accessibilityLabel="확대 가능한 공지 영상"
        />
        {overlayMode != null ? (
          <NoticeVideoPlaybackOverlay
            mode={overlayMode}
            playAutoHide={playAutoHide}
            onHidden={handleOverlayHidden}
          />
        ) : null}
      </ZoomableView>
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
});
