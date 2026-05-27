/**
 * Figma 타이포 토큰 (플랫폼 공통) — fontSize · fontWeight · layout.
 * lineHeight·singleRow·fieldInput은 typography.platform.ts (ios / android).
 */

import type { PretendardWeight } from '@/constants/fonts';

export const typographyBase = {
  /** Pretendard weight — typography-tree · merge · layout */
  font_weights: {
    bold: '700',
    medium: '500',
    regular: '400',
  } satisfies Record<'bold' | 'medium' | 'regular', PretendardWeight>,
  /** Input·wrap 박스 높이 (OS 무관) */
  layout: {
    fieldLineRowHeight: 24,
    fieldLineShortMinHeight: 21,
    fieldAreaInputHeight: 72,
  },
  paragraph: {
    headline01: { fontSize: 32 },
    headline02: { fontSize: 28 },
    headline03: { fontSize: 24 },
    headline04: { fontSize: 21 },
    body01: { fontSize: 16 },
    body02: { fontSize: 14 },
    detail: { fontSize: 12 },
    button01: { fontSize: 16 },
    button02: { fontSize: 14 },
    tiny: { fontSize: 10 },
    pickerNav: { fontSize: 17 },
    pickerWheel: { fontSize: 22 },
    categoryEmojiM: { fontSize: 36 },
    categoryEmojiL: { fontSize: 40 },
  },
} as const;

/** @see typographyBase.font_weights */
export const font_weights = typographyBase.font_weights;

export type TypographyScaleKey = keyof typeof typographyBase.paragraph;
