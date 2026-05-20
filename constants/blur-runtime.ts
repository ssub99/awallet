import { BlurTokens } from '@/constants/blur-tokens';
import { resolveBlurIntensity, resolveBlurOverlay } from '@/utils/expo-blur-platform';

/** Resolved blur token values (computed once per app load / platform). */
export const BlurRuntime = {
  quickInputShortIntensity: resolveBlurIntensity(BlurTokens.quickInputShort),
  quickInputShortAndroidFallback: BlurTokens.quickInputShort.androidFallbackBackground,
  keypadIntensity: resolveBlurIntensity(BlurTokens.keypad),
  keypadOverlay: resolveBlurOverlay(BlurTokens.keypad.overlay),
  keypadAndroidFallback: BlurTokens.keypad.androidFallbackBackground,
  timelineFilterIntensity: resolveBlurIntensity(BlurTokens.timelineFilter),
  timelineFilterOverlay: resolveBlurOverlay(BlurTokens.timelineFilter.overlay),
  timelineFilterAndroidFallback: BlurTokens.timelineFilter.androidFallbackBackground,
} as const;
