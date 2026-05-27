/**
 * Typography system — design tokens (typography) + context layout (typographyLayout).
 *
 * Platform tokens: typography.base · typography.ios · typography.android → merge.ts
 *
 * @example
 * ```tsx
 * import { typography } from '@/constants/typography';
 * <Text style={typography.body1.l.bold}>Title</Text>
 * ```
 */

export type { TypographyScaleKey } from './typography.base';
export { typographyBase } from './typography.base';
export { typographyIos } from './typography.ios';
export { typographyAndroid } from './typography.android';

export type { SingleRowScaleKey, TypoSize, TypographyScaleEntry } from './merge';
export {
  androidTextMetrics,
  getFieldInputLineHeight,
  getSingleRowLineHeight,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldAreaLineHeightIos,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
  typographyScale,
} from './merge';

export { createTypographyStyle } from './create-style';
export { singleRowCenteredTextStyle } from './variants';
export { typography } from './typography-tree';
export { typographyLayout } from './layout';

export {
  lineFieldRowText,
  lineFieldRowTextShortWrap,
  lineFieldRowTextWrap,
} from './layout-input';

export type FontWeight = 'bold' | 'medium' | 'regular';
export type SizeCategory = 'xl' | 'l' | 'm' | 'r';

export type HeadlineCategory = 'headline1' | 'headline2' | 'headline3' | 'headline4';
export type BodyCategory = 'body1' | 'body2';
export type ButtonCategory = 'button1' | 'button2';
export type UtilityCategory = 'detail' | 'tiny';
