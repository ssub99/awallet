/**
 * Typography System
 * 
 * Text styles for AWallet design system.
 * Based on Figma text styles and Notion Typography documentation.
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

import { TextStyle } from 'react-native';

/**
 * Base typography configuration
 */
const FONT_FAMILY = 'Pretendard';

const FONT_WEIGHTS = {
  bold: '700' as const,
  medium: '500' as const,
  regular: '400' as const,
} as const;

/**
 * Typography system with all text styles
 */
export const Typography = {
  /**
   * Headline 01 - Extra Large (32px)
   * Usage: Main page titles, hero text
   */
  headline1: {
    xl: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 32,
        lineHeight: 48,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 32,
        lineHeight: 48,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 32,
        lineHeight: 48,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Headline 02 - Large (28px)
   * Usage: Section titles, important headings
   */
  headline2: {
    l: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 28,
        lineHeight: 42,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 28,
        lineHeight: 42,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 28,
        lineHeight: 42,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Headline 03 - Medium (24px)
   * Usage: Subsection titles, card headers
   */
  headline3: {
    m: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 24,
        lineHeight: 36,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 24,
        lineHeight: 36,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 24,
        lineHeight: 36,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Headline 04 - Regular (21px)
   * Usage: Small headings, emphasized text blocks
   */
  headline4: {
    r: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 21,
        lineHeight: 31.5,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 21,
        lineHeight: 31.5,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 21,
        lineHeight: 31.5,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Body 01 - Large (16px)
   * Usage: Primary body text, paragraphs
   */
  body1: {
    l: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Body 02 - Regular (14px)
   * Usage: Secondary body text, descriptions
   */
  body2: {
    r: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Detail - Regular (12px)
   * Usage: Captions, metadata, labels
   */
  detail: {
    r: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Button 01 - Large (16px)
   * Usage: Primary buttons, call-to-action text
   */
  button1: {
    l: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 16,
        lineHeight: 24,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Button 02 - Regular (14px)
   * Usage: Secondary buttons, smaller actions
   */
  button2: {
    r: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 14,
        lineHeight: 21,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
    },
  },

  /**
   * Tiny - Regular (10px)
   * Usage: Very small text, fine print, badges
   */
  tiny: {
    r: {
      bold: {
        fontFamily: FONT_FAMILY,
        fontSize: 10,
        lineHeight: 15,
        fontWeight: FONT_WEIGHTS.bold,
      } as TextStyle,
      medium: {
        fontFamily: FONT_FAMILY,
        fontSize: 10,
        lineHeight: 15,
        fontWeight: FONT_WEIGHTS.medium,
      } as TextStyle,
      regular: {
        fontFamily: FONT_FAMILY,
        fontSize: 10,
        lineHeight: 15,
        fontWeight: FONT_WEIGHTS.regular,
      } as TextStyle,
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

