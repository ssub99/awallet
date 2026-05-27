import { font_weights } from './typography.base';
import { createTypographyStyle } from './merge';

/**
 * Figma 텍스트 스타일과 1:1 — typography.body01.regular
 * (구 headline1.xl / body1.l 등 중간 tier 제거)
 */
export const typography = {
  headline01: {
    bold: createTypographyStyle('headline01', font_weights.bold),
    medium: createTypographyStyle('headline01', font_weights.medium),
    regular: createTypographyStyle('headline01', font_weights.regular),
  },

  headline02: {
    bold: createTypographyStyle('headline02', font_weights.bold),
    medium: createTypographyStyle('headline02', font_weights.medium),
    regular: createTypographyStyle('headline02', font_weights.regular),
  },

  headline03: {
    bold: createTypographyStyle('headline03', font_weights.bold),
    medium: createTypographyStyle('headline03', font_weights.medium),
    regular: createTypographyStyle('headline03', font_weights.regular),
  },

  headline04: {
    bold: createTypographyStyle('headline04', font_weights.bold),
    medium: createTypographyStyle('headline04', font_weights.medium),
    regular: createTypographyStyle('headline04', font_weights.regular),
  },

  body01: {
    bold: createTypographyStyle('body01', font_weights.bold),
    medium: createTypographyStyle('body01', font_weights.medium),
    regular: createTypographyStyle('body01', font_weights.regular),
  },

  body02: {
    bold: createTypographyStyle('body02', font_weights.bold),
    medium: createTypographyStyle('body02', font_weights.medium),
    regular: createTypographyStyle('body02', font_weights.regular),
  },

  detail: {
    bold: createTypographyStyle('detail', font_weights.bold),
    medium: createTypographyStyle('detail', font_weights.medium),
    regular: createTypographyStyle('detail', font_weights.regular),
  },

  button01: {
    bold: createTypographyStyle('button01', font_weights.bold),
    medium: createTypographyStyle('button01', font_weights.medium),
    regular: createTypographyStyle('button01', font_weights.regular),
  },

  button02: {
    bold: createTypographyStyle('button02', font_weights.bold),
    medium: createTypographyStyle('button02', font_weights.medium),
    regular: createTypographyStyle('button02', font_weights.regular),
  },

  tiny: {
    bold: createTypographyStyle('tiny', font_weights.bold),
    medium: createTypographyStyle('tiny', font_weights.medium),
    regular: createTypographyStyle('tiny', font_weights.regular),
  },

  pickerNav: {
    regular: createTypographyStyle('pickerNav', font_weights.regular),
    medium: createTypographyStyle('pickerNav', font_weights.medium),
    bold: createTypographyStyle('pickerNav', font_weights.bold),
  },

  pickerWheel: {
    regular: createTypographyStyle('pickerWheel', font_weights.regular),
    medium: createTypographyStyle('pickerWheel', font_weights.medium),
    bold: createTypographyStyle('pickerWheel', font_weights.bold),
  },

  categoryEmojiM: {
    regular: createTypographyStyle('categoryEmojiM', font_weights.regular),
  },

  categoryEmojiL: {
    regular: createTypographyStyle('categoryEmojiL', font_weights.regular),
  },
} as const;

export type TypographyStyleToken = keyof typeof typography;
