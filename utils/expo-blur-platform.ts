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
  return Platform.OS === 'android' ? android : ios;
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
