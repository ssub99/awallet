import { GlassSurface } from '@/components/ui/glass-surface';
import { BlurTokens } from '@/constants/blur-tokens';
import { resolveBlurIntensity, resolveBlurOverlay } from '@/utils/expo-blur-platform';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type KeypadGlassShellProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Frosted background behind CustomKeypad (expense / income / challenge screens).
 * iOS: intensity 16 + neutral 80% (HEAD). Android: same intensity, lighter overlay so blur shows.
 */
export function KeypadGlassShell({ children, style }: KeypadGlassShellProps) {
  return (
    <GlassSurface
      style={[styles.shell, style]}
      topCornerRadius={16}
      intensity={resolveBlurIntensity(BlurTokens.keypad)}
      tint="light"
      overlayColor={resolveBlurOverlay(BlurTokens.keypad.overlay)}
    >
      <View style={styles.content}>{children}</View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
  },
  content: {
    width: '100%',
  },
});
