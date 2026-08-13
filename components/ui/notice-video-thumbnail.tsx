import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
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
    <View style={[styles.container, { backgroundColor: colors.fill }, style]}>
      {posterUri != null ? (
        <Image
          source={posterUri}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
          priority="high"
        />
      ) : null}
      {posterUri == null ? (
        <Icon
          name="image"
          variant="solid"
          size={20}
          color={atomicColors.neutral[300]}
          accessibilityLabel="썸네일"
        />
      ) : (
        <View style={[styles.playBadge, { backgroundColor: colors.staticBlack }]}>
          <Icon name="play" variant="solid" size={14} color={colors.staticWhite} accessibilityLabel="영상" />
        </View>
      )}
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
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
