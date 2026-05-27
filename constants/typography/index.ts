/**
 * Typography system — design tokens (typography) + context layout (typographyLayout).
 *
 * Platform tokens: typography.base · typography.ios · typography.android → merge.ts (internal)
 *
 * @example
 * ```tsx
 * import { typography } from '@/constants/typography';
 * <Text style={typography.body1.l.bold}>Title</Text>
 * ```
 */

export type { TypographyScaleKey } from './typography.base';

export type { SingleRowScaleKey, TypoSize, TypographyScaleEntry } from './merge';
export {
  getPlatformTypographySizes,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
  typographyScale,
} from './merge';

export { typography } from './typography-tree';
export { typographyLayout } from './layout';

export type FontWeight = 'bold' | 'medium' | 'regular';
export type SizeCategory = 'xl' | 'l' | 'm' | 'r';

export type HeadlineCategory = 'headline1' | 'headline2' | 'headline3' | 'headline4';
export type BodyCategory = 'body1' | 'body2';
export type ButtonCategory = 'button1' | 'button2';
export type UtilityCategory = 'detail' | 'tiny';
