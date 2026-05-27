/**
 * Figma fontSize (플랫폼 공통).
 * lineHeight·singleRow·fieldInput은 typography.ios / typography.android.
 */

export const typographyBase = {
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

export type TypographyScaleKey = keyof typeof typographyBase.paragraph;
