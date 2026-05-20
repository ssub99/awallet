/**
 * Theme Configuration
 * 
 * This file exports the complete theme system including:
 * - Colors (from ThemeColors - Figma/Notion synchronized)
 * - Typography (Text styles with Pretendard font)
 * - Fonts (Platform-specific font stacks)
 * 
 * Architecture:
 * 1. Atomic Colors (atomic-colors.ts) - Base color palette
 * 2. Theme Colors (theme-colors.ts) - Semantic color layer
 * 3. Typography (typography.ts) - Text styles
 * 4. This file - Main export for the app
 */

import { Platform } from 'react-native';
import { ThemeColors } from './theme-colors';

// Re-export ThemeColors as Colors for app-wide usage
export const Colors = ThemeColors;

// Re-export Typography system
export { Typography, TypographyPresets } from './typography';
export type { FontWeight, SizeCategory } from './typography';

export {
  PRETENDARD_FAMILY,
  PRETENDARD_FONT_ASSETS,
  pretendardFontFamily,
  pretendardTextStyle,
} from './fonts';
export type { PretendardWeight } from './fonts';

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
