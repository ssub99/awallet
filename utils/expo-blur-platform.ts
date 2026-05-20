import type { BlurTint, BlurViewProps } from 'expo-blur';
import { Platform } from 'react-native';

import type { PlatformBlurIntensity, PlatformBlurOverlay } from '@/constants/blur-tokens';

/**
 * Android requires dimezisBlurView; default "none" is only a flat tint (no real blur).
 * blurReductionFactor: 1 — default 4 divides native radius and looks like no blur.
 * @see https://docs.expo.dev/versions/latest/sdk/blur-view/
 */
export const EXPO_BLUR_ANDROID_PROPS: Pick<
  BlurViewProps,
  'experimentalBlurMethod' | 'blurReductionFactor'
> =
  Platform.OS === 'android'
    ? {
        experimentalBlurMethod: 'dimezisBlurView',
        blurReductionFactor: 1,
      }
    : {};

/** Resolve design-token intensity for the current platform. */
export function resolveBlurIntensity({ ios, android }: PlatformBlurIntensity): number {
  const value = Platform.OS === 'android' ? android : ios;
  return Platform.OS === 'android' ? clampAndroidBlurRadius(value) : value;
}

/** Resolve frost overlay color for the current platform. */
export function resolveBlurOverlay(overlay: PlatformBlurOverlay): string {
  return Platform.OS === 'android' ? overlay.android : overlay.ios;
}

/**
 * Android dimezisBlurView bakes frost into setOverlayColor(tint).
 * "light" + high intensity ≈ opaque white — extra React overlays hide blur entirely.
 */
export function resolveBlurTint(iosTint: BlurTint = 'light'): BlurTint {
  return Platform.OS === 'android' ? 'default' : iosTint;
}

/**
 * React-side fill (e.g. colors.fill) — iOS only on quick-input short pill.
 * Android dimezis + fill stacks opaque; keypad uses GlassSurface overlay instead.
 */
export function shouldApplyReactBlurOverlay(): boolean {
  return Platform.OS === 'ios';
}

/** Android RenderScript / dimezis native radius must be in (0, 25]; app caps at 24. */
export const ANDROID_BLUR_RADIUS_MAX = 24;

export function clampAndroidBlurRadius(intensity: number): number {
  return Math.min(Math.max(intensity, 1), ANDROID_BLUR_RADIUS_MAX);
}

export type AndroidBlurProps = {
  intensity: number;
  experimentalBlurMethod?: BlurViewProps['experimentalBlurMethod'];
  blurReductionFactor?: BlurViewProps['blurReductionFactor'];
};

const androidBlurPropsCache = new Map<number, AndroidBlurProps>();

/** Intensity + Android-only BlurView props (radius clamped, cached per intensity). */
export function getAndroidBlurProps(intensity: number): AndroidBlurProps {
  if (Platform.OS !== 'android') {
    return { intensity };
  }

  const clamped = clampAndroidBlurRadius(intensity);
  const cached = androidBlurPropsCache.get(clamped);
  if (cached) {
    return cached;
  }

  const props: AndroidBlurProps = {
    intensity: clamped,
    ...EXPO_BLUR_ANDROID_PROPS,
  };
  androidBlurPropsCache.set(clamped, props);
  return props;
}

const resolvedBlurTintCache = new Map<BlurTint, BlurTint>();

/** Cached per-request tint resolution (Android maps most tints to default). */
export function resolveBlurTintCached(iosTint: BlurTint = 'light'): BlurTint {
  const cached = resolvedBlurTintCache.get(iosTint);
  if (cached) {
    return cached;
  }
  const resolved = resolveBlurTint(iosTint);
  resolvedBlurTintCache.set(iosTint, resolved);
  return resolved;
}
