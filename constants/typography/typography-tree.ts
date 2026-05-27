import { createTypographyStyle } from './merge';

const FONT_WEIGHTS = {
  bold: '700' as const,
  medium: '500' as const,
  regular: '400' as const,
} as const;

export const typography = {
  headline1: {
    xl: {
      bold: createTypographyStyle('headline01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline01', FONT_WEIGHTS.regular),
    },
  },

  headline2: {
    l: {
      bold: createTypographyStyle('headline02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline02', FONT_WEIGHTS.regular),
    },
  },

  headline3: {
    m: {
      bold: createTypographyStyle('headline03', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline03', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline03', FONT_WEIGHTS.regular),
    },
  },

  headline4: {
    r: {
      bold: createTypographyStyle('headline04', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline04', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline04', FONT_WEIGHTS.regular),
    },
  },

  body1: {
    l: {
      bold: createTypographyStyle('body01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('body01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('body01', FONT_WEIGHTS.regular),
    },
  },

  body2: {
    r: {
      bold: createTypographyStyle('body02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('body02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('body02', FONT_WEIGHTS.regular),
    },
  },

  detail: {
    r: {
      bold: createTypographyStyle('detail', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('detail', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('detail', FONT_WEIGHTS.regular),
    },
  },

  button1: {
    l: {
      bold: createTypographyStyle('button01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('button01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('button01', FONT_WEIGHTS.regular),
    },
  },

  button2: {
    r: {
      bold: createTypographyStyle('button02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('button02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('button02', FONT_WEIGHTS.regular),
    },
  },

  tiny: {
    r: {
      bold: createTypographyStyle('tiny', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('tiny', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('tiny', FONT_WEIGHTS.regular),
    },
  },

  pickerNav: {
    nav: {
      regular: createTypographyStyle('pickerNav', FONT_WEIGHTS.regular),
      medium: createTypographyStyle('pickerNav', FONT_WEIGHTS.medium),
      bold: createTypographyStyle('pickerNav', FONT_WEIGHTS.bold),
    },
  },

  categoryEmoji: {
    m: {
      regular: createTypographyStyle('categoryEmojiM', FONT_WEIGHTS.regular),
    },
    l: {
      regular: createTypographyStyle('categoryEmojiL', FONT_WEIGHTS.regular),
    },
  },
} as const;
