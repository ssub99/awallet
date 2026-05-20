import { AtomicColors } from '@/constants/atomic-colors';

const withOpacity = (hex: string, opacity: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/** Per-platform blur intensity (1–100). Keys kept for future per-platform tuning. */
export type PlatformBlurIntensity = {
  ios: number;
  android: number;
};

/** Per-platform frost overlay on top of blur. */
export type PlatformBlurOverlay = {
  ios: string;
  android: string;
};

/** iOS design value applied to both platforms (ios/android keys stay in sync). */
function platformBlurIntensity(value: number): PlatformBlurIntensity {
  return { ios: value, android: value };
}

function platformBlurOverlay(ios: string, android: string): PlatformBlurOverlay {
  return { ios, android };
}

/**
 * Blur tokens — intensities match HEAD / iOS on both platforms.
 * Keypad overlay: iOS 80% neutral (HEAD); Android lower so dimezis blur stays visible.
 */
export const BlurTokens = {
  quickInputShort: platformBlurIntensity(48),
  keypad: {
    ...platformBlurIntensity(16),
    overlay: platformBlurOverlay(
      withOpacity(AtomicColors.neutral[300], 0.8),
      withOpacity(AtomicColors.neutral[300], 0.38)
    ),
  },
  timelineFilter: {
    ...platformBlurIntensity(24),
    overlay: platformBlurOverlay(
      'rgba(144, 146, 158, 0.1)',
      'rgba(144, 146, 158, 0.1)'
    ),
  },
  settlementDropdown: {
    ...platformBlurIntensity(100),
    androidFallbackBackground: 'rgba(253, 253, 253, 0.98)',
  },
} as const;
