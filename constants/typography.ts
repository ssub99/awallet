/**
 * Typography System
 *
 * Text styles for AWallet design system.
 * Based on Figma text styles and Notion Typography documentation.
 *
 * - Design baseline: iOS (Figma values)
 * - Android: optical adjustment per token (see TYPO_SCALE)
 *
 * Font Family: Pretendard
 * Weights: Bold (700), Medium (500), Regular (400)
 * Size Categories: xl, l, m, r
 *
 * Naming Convention:
 * - Figma/Notion: "headline01/xl_32/bold"
 * - Code: Typography.headline1.xl.bold (nested object, camelCase)
 *
 * @example
 * ```tsx
 * import { Typography } from '@/constants/typography';
 *
 * <Text style={Typography.headline1.xl.bold}>Title</Text>
 * <Text style={Typography.body1.l.regular}>Body text</Text>
 * ```
 */

import { Platform, TextStyle } from 'react-native';

import { pretendardTextStyle, type PretendardWeight } from './fonts';

const FONT_WEIGHTS = {
  bold: '700' as const,
  medium: '500' as const,
  regular: '400' as const,
} as const;

type TypoSize = { fontSize: number; lineHeight: number };

type TypoScaleEntry = {
  ios: TypoSize;
  android: TypoSize;
};

/** iOS = Figma. Android = platform-adjusted sizes (fontSize / lineHeight). */
const TYPO_SCALE = {
  headline01: {
    ios: { fontSize: 32, lineHeight: 48 },
    android: { fontSize: 30, lineHeight: 45 },
  },
  headline02: {
    ios: { fontSize: 28, lineHeight: 42 },
    android: { fontSize: 26, lineHeight: 39 },
  },
  headline03: {
    ios: { fontSize: 24, lineHeight: 36 },
    android: { fontSize: 22, lineHeight: 33 },
  },
  headline04: {
    ios: { fontSize: 21, lineHeight: 31.5 },
    android: { fontSize: 18, lineHeight: 27 },
  },
  body01: {
    ios: { fontSize: 16, lineHeight: 24 },
    android: { fontSize: 14, lineHeight: 21 },
  },
  body02: {
    ios: { fontSize: 14, lineHeight: 21 },
    android: { fontSize: 12, lineHeight: 18 },
  },
  detail: {
    ios: { fontSize: 12, lineHeight: 18 },
    android: { fontSize: 10, lineHeight: 15 },
  },
  button01: {
    ios: { fontSize: 16, lineHeight: 24 },
    android: { fontSize: 14, lineHeight: 21 },
  },
  button02: {
    ios: { fontSize: 14, lineHeight: 21 },
    android: { fontSize: 12, lineHeight: 18 },
  },
  tiny: {
    ios: { fontSize: 10, lineHeight: 15 },
    android: { fontSize: 8, lineHeight: 12 },
  },
} as const satisfies Record<string, TypoScaleEntry>;

type TypoScaleKey = keyof typeof TYPO_SCALE;

function typo(scale: TypoScaleKey, weight: PretendardWeight): TextStyle {
  const sizes = Platform.OS === 'android' ? TYPO_SCALE[scale].android : TYPO_SCALE[scale].ios;
  return {
    ...pretendardTextStyle(weight),
    fontSize: sizes.fontSize,
    lineHeight: sizes.lineHeight,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}

/**
 * iOS Figma px → platform fontSize/lineHeight (TYPO_SCALE 매칭, 없으면 Android −2pt).
 * StyleSheet에서 Typography 대신 고정 px를 쓰는 컴포넌트용.
 */
export function resolvePlatformTypoSize(iosFontSize: number, iosLineHeight?: number): TypoSize {
  const iosLh = iosLineHeight ?? iosFontSize * 1.5;
  if (Platform.OS !== 'android') {
    return { fontSize: iosFontSize, lineHeight: iosLh };
  }

  const entry = (Object.values(TYPO_SCALE) as TypoScaleEntry[]).find(
    (e) =>
      e.ios.fontSize === iosFontSize &&
      (iosLineHeight == null || Math.abs(e.ios.lineHeight - iosLineHeight) < 0.01),
  );
  if (entry) {
    return entry.android;
  }

  return {
    fontSize: Math.max(8, iosFontSize - 2),
    lineHeight: Math.max(12, iosLh - 3),
  };
}

/** iOS 메트릭 기준 TextStyle (컴포넌트 StyleSheet 마이그레이션용) */
export function textStyleFromIosMetrics(
  iosFontSize: number,
  weight: PretendardWeight,
  iosLineHeight?: number,
): TextStyle {
  const sizes = resolvePlatformTypoSize(iosFontSize, iosLineHeight);
  return {
    ...pretendardTextStyle(weight),
    fontSize: sizes.fontSize,
    lineHeight: sizes.lineHeight,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}

/**
 * Typography system with all text styles
 */
export const Typography = {
  /**
   * Headline 01 - Extra Large (iOS 32px / Android 30px)
   * Usage: Main page titles, hero text
   */
  headline1: {
    xl: {
      bold: typo('headline01', FONT_WEIGHTS.bold),
      medium: typo('headline01', FONT_WEIGHTS.medium),
      regular: typo('headline01', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Headline 02 - Large (iOS 28px / Android 26px)
   * Usage: Section titles, important headings
   */
  headline2: {
    l: {
      bold: typo('headline02', FONT_WEIGHTS.bold),
      medium: typo('headline02', FONT_WEIGHTS.medium),
      regular: typo('headline02', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Headline 03 - Medium (iOS 24px / Android 22px)
   * Usage: Subsection titles, card headers
   */
  headline3: {
    m: {
      bold: typo('headline03', FONT_WEIGHTS.bold),
      medium: typo('headline03', FONT_WEIGHTS.medium),
      regular: typo('headline03', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Headline 04 - Regular (iOS 21px / Android 18px)
   * Usage: Small headings, emphasized text blocks
   */
  headline4: {
    r: {
      bold: typo('headline04', FONT_WEIGHTS.bold),
      medium: typo('headline04', FONT_WEIGHTS.medium),
      regular: typo('headline04', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Body 01 - Large (iOS 16px / Android 14px)
   * Usage: Primary body text, paragraphs
   */
  body1: {
    l: {
      bold: typo('body01', FONT_WEIGHTS.bold),
      medium: typo('body01', FONT_WEIGHTS.medium),
      regular: typo('body01', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Body 02 - Regular (iOS 14px / Android 12px)
   * Usage: Secondary body text, descriptions
   */
  body2: {
    r: {
      bold: typo('body02', FONT_WEIGHTS.bold),
      medium: typo('body02', FONT_WEIGHTS.medium),
      regular: typo('body02', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Detail - Regular (iOS 12px / Android 10px)
   * Usage: Captions, metadata, labels
   */
  detail: {
    r: {
      bold: typo('detail', FONT_WEIGHTS.bold),
      medium: typo('detail', FONT_WEIGHTS.medium),
      regular: typo('detail', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Button 01 - Large (iOS 16px / Android 14px)
   * Usage: Primary buttons, call-to-action text
   */
  button1: {
    l: {
      bold: typo('button01', FONT_WEIGHTS.bold),
      medium: typo('button01', FONT_WEIGHTS.medium),
      regular: typo('button01', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Button 02 - Regular (iOS 14px / Android 12px)
   * Usage: Secondary buttons, smaller actions
   */
  button2: {
    r: {
      bold: typo('button02', FONT_WEIGHTS.bold),
      medium: typo('button02', FONT_WEIGHTS.medium),
      regular: typo('button02', FONT_WEIGHTS.regular),
    },
  },

  /**
   * Tiny - Regular (iOS 10px / Android 8px)
   * Usage: Very small text, fine print, badges
   */
  tiny: {
    r: {
      bold: typo('tiny', FONT_WEIGHTS.bold),
      medium: typo('tiny', FONT_WEIGHTS.medium),
      regular: typo('tiny', FONT_WEIGHTS.regular),
    },
  },
} as const;

/**
 * Typography presets for common use cases
 * Convenient shortcuts for frequently used styles
 */
export const TypographyPresets = {
  // Headings
  h1: Typography.headline1.xl.bold,
  h2: Typography.headline2.l.bold,
  h3: Typography.headline3.m.bold,
  h4: Typography.headline4.r.bold,

  // Body text
  bodyLarge: Typography.body1.l.regular,
  bodyMedium: Typography.body2.r.regular,
  bodySmall: Typography.detail.r.regular,

  // Emphasized text
  bodyLargeBold: Typography.body1.l.bold,
  bodyMediumBold: Typography.body2.r.bold,

  // Buttons
  buttonLarge: Typography.button1.l.bold,
  buttonMedium: Typography.button2.r.medium,

  // Utility
  caption: Typography.detail.r.regular,
  overline: Typography.tiny.r.bold,
  label: Typography.tiny.r.medium,
} as const;

/**
 * TypeScript type definitions
 */
export type FontWeight = 'bold' | 'medium' | 'regular';
export type SizeCategory = 'xl' | 'l' | 'm' | 'r';

export type HeadlineCategory = 'headline1' | 'headline2' | 'headline3' | 'headline4';
export type BodyCategory = 'body1' | 'body2';
export type ButtonCategory = 'button1' | 'button2';
export type UtilityCategory = 'detail' | 'tiny';

/**
 * Helper function to get typography style
 *
 * @example
 * ```ts
 * const style = getTypographyStyle('headline1', 'xl', 'bold');
 * ```
 */
export function getTypographyStyle(
  category: keyof typeof Typography,
  size: string,
  weight: FontWeight
): TextStyle {
  const categoryStyles = Typography[category];
  if (size in categoryStyles) {
    const sizeStyles = categoryStyles[size as keyof typeof categoryStyles];
    if (weight in sizeStyles) {
      return sizeStyles[weight];
    }
  }

  // Fallback to body1 regular
  return Typography.body1.l.regular;
}
