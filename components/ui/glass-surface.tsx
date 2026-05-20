import { BlurView, type BlurTint } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { EXPO_BLUR_ANDROID_PROPS, resolveBlurTint } from '@/utils/expo-blur-platform';

export type GlassSurfaceProps = {
  intensity?: number;
  tint?: BlurTint;
  /** Frosted tint on top of blur (platform-specific opacity may apply). */
  overlayColor?: string;
  /** Uniform corner radius (all corners). */
  borderRadius?: number;
  /** Sheet style: top corners only (bottom stays square). */
  topCornerRadius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * Frosted glass: children inside BlurView (expo-blur lays NativeBlurView behind children).
 */
export function GlassSurface({
  intensity = 48,
  tint = 'light',
  overlayColor,
  borderRadius = 0,
  topCornerRadius,
  style,
  children,
}: GlassSurfaceProps) {
  const cornerStyle =
    topCornerRadius != null
      ? {
          borderTopLeftRadius: topCornerRadius,
          borderTopRightRadius: topCornerRadius,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }
      : borderRadius > 0
        ? { borderRadius }
        : undefined;

  return (
    <BlurView
      intensity={intensity}
      tint={resolveBlurTint(tint)}
      style={[cornerStyle, { overflow: 'hidden' }, style]}
      {...EXPO_BLUR_ANDROID_PROPS}
    >
      {overlayColor ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor }]}
        />
      ) : null}
      {children}
    </BlurView>
  );
}
