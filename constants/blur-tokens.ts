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
  /** Maps to expo-blur native radius on Android (max 24; values > 25 crash). */
  android: number;
};

/** Per-platform frost overlay on top of blur. */
export type PlatformBlurOverlay = {
  ios: string;
  android: string;
};

/** iOS design value; Android native radius must be ≤ 25 (use 24 when ios > 25). */
function platformBlurIntensity(ios: number): PlatformBlurIntensity {
  return { ios, android: ios > 25 ? 24 : ios };
}

function platformBlurOverlay(ios: string, android: string): PlatformBlurOverlay {
  return { ios, android };
}

/**
 * Blur tokens — intensities match HEAD / iOS on both platforms.
 * Keypad overlay: iOS 80% neutral (HEAD); Android lower so dimezis blur stays visible.
 */
/** Android 고정 배경 — Atomic/Cool Neutral/100 */
const COOL_NEUTRAL_100 = AtomicColors.coolNeutral[100];

export const BlurTokens = {
  quickInputShort: {
    ios: 48,
    android: 12,
    androidFallbackBackground: COOL_NEUTRAL_100,
  },
  keypad: {
    ...platformBlurIntensity(16),
    overlay: platformBlurOverlay(
      withOpacity(AtomicColors.neutral[300], 0.8),
      withOpacity(AtomicColors.neutral[300], 0.38)
    ),
    androidFallbackBackground: 'rgba(253, 253, 253, 0.98)',
  },
  timelineFilter: {
    ios: 24,
    android: 12,
    overlay: platformBlurOverlay(
      'rgba(144, 146, 158, 0.1)',
      'rgba(144, 146, 158, 0.1)'
    ),
    /** Android: 고정 배경 — Atomic/Cool Neutral/100 */
    androidFallbackBackground: COOL_NEUTRAL_100,
  },
  settlementDropdown: {
    ...platformBlurIntensity(100),
    androidFallbackBackground: 'rgba(253, 253, 253, 0.98)',
  },
} as const;
