import {
  NoticeVideoPlaybackOverlay,
  type NoticeVideoPlaybackOverlayMode,
} from '@/components/ui/notice-video-playback-overlay';
import { themeColors } from '@/constants/theme-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const PLAY_OVERLAY_VISIBLE_MS = 1000;

interface NoticeVideoSlideProps {
  uri: string;
  width: number;
  height: number;
  isActive: boolean;
  seekTime: number | null;
  onProgressChange: (currentTime: number, duration: number) => void;
}

export function NoticeVideoSlide({
  uri,
  width,
  height,
  isActive,
  seekTime,
  onProgressChange,
}: NoticeVideoSlideProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const [overlayMode, setOverlayMode] = useState<NoticeVideoPlaybackOverlayMode | null>(null);
  const resumedFromPauseRef = useRef(false);
  const playOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useVideoPlayer(uri, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
  });

  const clearPlayOverlayTimer = () => {
    if (playOverlayTimerRef.current != null) {
      clearTimeout(playOverlayTimerRef.current);
      playOverlayTimerRef.current = null;
    }
  };

  const showPlayOverlayBriefly = () => {
    clearPlayOverlayTimer();
    setOverlayMode('play');
    playOverlayTimerRef.current = setTimeout(() => {
      setOverlayMode(null);
      playOverlayTimerRef.current = null;
    }, PLAY_OVERLAY_VISIBLE_MS);
  };

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (isActive) {
      onProgressChange(currentTime, player.duration);
    }
  });

  useEventListener(player, 'statusChange', ({ status }) => {
    if (isActive && status === 'readyToPlay') {
      onProgressChange(player.currentTime, player.duration);
    }
  });

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (!isActive) {
      return;
    }

    if (!isPlaying) {
      clearPlayOverlayTimer();
      setOverlayMode('pause');
      resumedFromPauseRef.current = true;
      return;
    }

    if (resumedFromPauseRef.current) {
      showPlayOverlayBriefly();
      resumedFromPauseRef.current = false;
      return;
    }

    setOverlayMode(null);
  });

  useEffect(() => {
    if (!isActive) {
      player.pause();
      player.currentTime = 0;
      clearPlayOverlayTimer();
      setOverlayMode(null);
      resumedFromPauseRef.current = false;
      return;
    }

    void player.play();
  }, [isActive, player]);

  useEffect(() => {
    if (seekTime == null || !isActive) {
      return;
    }
    player.currentTime = seekTime;
  }, [isActive, player, seekTime]);

  useEffect(() => {
    return () => {
      clearPlayOverlayTimer();
    };
  }, []);

  const handleTogglePlayback = () => {
    if (player.playing) {
      player.pause();
      return;
    }
    void player.play();
  };

  return (
    <View style={[styles.container, { width, height, backgroundColor: colors.fill }]}>
      <VideoView
        style={styles.video}
        player={player}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      {overlayMode != null ? <NoticeVideoPlaybackOverlay mode={overlayMode} /> : null}
      <Pressable
        style={styles.tapOverlay}
        onPress={handleTogglePlayback}
        accessibilityRole="button"
        accessibilityLabel={player.playing ? '영상 일시정지' : '영상 재생'}
      />
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
  tapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
