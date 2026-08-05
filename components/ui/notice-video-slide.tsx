import { themeColors } from '@/constants/theme-colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEventListener } from 'expo';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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

  const player = useVideoPlayer(uri, (instance) => {
    instance.timeUpdateEventInterval = 0.25;
  });

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

  useEffect(() => {
    if (!isActive) {
      player.pause();
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

  const handleTogglePlayback = () => {
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
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
