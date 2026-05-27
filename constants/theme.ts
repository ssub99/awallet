/**
 * Theme Configuration
 *
 * Exports semantic colors, typography, and platform font stacks.
 */

import { Platform } from 'react-native';

import { themeColors } from './theme-colors';

export const colors = themeColors;

export {
  typography,
  typographyLayout,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './typography';

export type { FontWeight, SizeCategory } from './typography';
export type { ThemeColorKey, ThemeColorScheme } from './theme-colors';

/** Resolved light/dark semantic palette (e.g. colors[colorScheme]). */
export type ColorPalette = (typeof colors)['light'];

export {
  PRETENDARD_FAMILY,
  PRETENDARD_FONT_ASSETS,
  pretendardFontFamily,
  pretendardTextStyle,
} from './fonts';
export type { PretendardWeight } from './fonts';

export const fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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
