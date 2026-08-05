import { Icon } from '@/components/ui/icon';
import { themeColors } from '@/constants/theme-colors';
import { useNoticeVideoThumbnail } from '@/hooks/use-notice-video-thumbnail';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

interface NoticeVideoThumbnailProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
}

export const NoticeVideoThumbnail = memo(function NoticeVideoThumbnail({
  uri,
  style,
}: NoticeVideoThumbnailProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const posterUri = useNoticeVideoThumbnail(uri);

  return (
    <View style={[styles.container, { backgroundColor: colors.staticBlack }, style]}>
      {posterUri != null ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
      ) : null}
      <View style={styles.playBadge}>
        <Icon name="play" variant="solid" size={16} color={colors.staticWhite} accessibilityLabel="영상" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  playBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
  },
});
