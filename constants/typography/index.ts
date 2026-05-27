/**
 * Typography — Figma 토큰명과 동일한 `typography.body01.regular` API.
 *
 * 내부 (화면에서 import 금지):
 * - typography.base · typography.platform → merge.ts
 *
 * @example
 * ```tsx
 * import { typography } from '@/constants/typography';
 * <Text style={typography.body01.bold}>Title</Text>
 * ```
 */

export type { TypographyScaleKey } from './typography.base';
export type { TypographyStyleToken } from './typography-tree';

export {
  getPlatformTypographySizes,
  scaleTextStyleFontSize,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './merge';
export type { SingleRowScaleKey, TypographyScaleEntry, TypoSize } from './merge';

export { typographyLayout } from './layout';
export { typography } from './typography-tree';

/** @deprecated Figma weight 이름 — typography.body01.{bold|medium|regular} 사용 */
export type FontWeight = 'bold' | 'medium' | 'regular';
