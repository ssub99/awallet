import { BlurView, type BlurTint } from 'expo-blur';
import { memo, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { getAndroidBlurProps, resolveBlurTintCached } from '@/utils/expo-blur-platform';

const ANDROID_BLUR_FALLBACK_BG = 'rgba(253, 253, 253, 0.94)';
const OVERFLOW_HIDDEN = { overflow: 'hidden' as const };

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
  /** Android: 블러 대신 쓸 배경색 (미지정 시 overlayColor 또는 기본값) */
  androidFallbackBackground?: string;
  /** Android only: dimezis BlurView (기본 false — 커스텀 키패드 등 명시적 사용처만 true) */
  enableAndroidBlur?: boolean;
};

function GlassSurfaceInner({
  intensity = 48,
  tint = 'light',
  overlayColor,
  borderRadius = 0,
  topCornerRadius,
  style,
  children,
  androidFallbackBackground,
  enableAndroidBlur = false,
}: GlassSurfaceProps) {
  const cornerStyle = useMemo(
    () =>
      topCornerRadius != null
        ? {
            borderTopLeftRadius: topCornerRadius,
            borderTopRightRadius: topCornerRadius,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 0,
          }
        : borderRadius > 0
          ? { borderRadius }
          : undefined,
    [borderRadius, topCornerRadius]
  );

  const containerStyle = useMemo(
    () => [cornerStyle, OVERFLOW_HIDDEN, style],
    [cornerStyle, style]
  );

  const overlayLayer =
    overlayColor != null ? (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor }]}
      />
    ) : null;

  const androidFallbackBg =
    androidFallbackBackground ?? overlayColor ?? ANDROID_BLUR_FALLBACK_BG;

  const resolvedTint = useMemo(() => resolveBlurTintCached(tint), [tint]);

  if (Platform.OS === 'android') {
    if (!enableAndroidBlur) {
      return (
        <View style={[containerStyle, { backgroundColor: androidFallbackBg }]}>
          {overlayLayer}
          {children}
        </View>
      );
    }

    const androidBlur = getAndroidBlurProps(intensity);
    return (
      <BlurView
        intensity={androidBlur.intensity}
        tint={resolvedTint}
        experimentalBlurMethod={androidBlur.experimentalBlurMethod}
        blurReductionFactor={androidBlur.blurReductionFactor}
        style={containerStyle}
      >
        {overlayLayer}
        {children}
      </BlurView>
    );
  }

  return (
    <BlurView intensity={intensity} tint={resolvedTint} style={containerStyle}>
      {overlayLayer}
      {children}
    </BlurView>
  );
}

/**
 * Frosted glass: BlurView + optional overlay.
 * Android: solid fallback by default; set enableAndroidBlur for native blur (e.g. custom keypad).
 */
export const GlassSurface = memo(GlassSurfaceInner);
