import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
import { StyleSheet, View } from 'react-native';

/** Figma Frame 287 — 48×48 playback control badge on video viewer. */
export const NOTICE_VIDEO_PLAYBACK_OVERLAY_SIZE = 48;
const OVERLAY_ICON_SIZE = 24;
const OVERLAY_BACKGROUND = `${atomicColors.neutral[800]}B3`;

export type NoticeVideoPlaybackOverlayMode = 'play' | 'pause';

interface NoticeVideoPlaybackOverlayProps {
  mode: NoticeVideoPlaybackOverlayMode;
}

export function NoticeVideoPlaybackOverlay({ mode }: NoticeVideoPlaybackOverlayProps) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.badge}>
        <Icon
          name={mode === 'play' ? 'play' : 'pause'}
          variant="solid"
          size={OVERLAY_ICON_SIZE}
          color={atomicColors.common[0]}
          accessibilityLabel={mode === 'play' ? '재생 중' : '일시정지'}
        />
      </View>
    </View>
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
