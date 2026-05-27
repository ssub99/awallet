import { font_weights } from './typography.base';
import { createTypographyStyle } from './merge';

export const typography = {
  headline1: {
    xl: {
      bold: createTypographyStyle('headline01', font_weights.bold),
      medium: createTypographyStyle('headline01', font_weights.medium),
      regular: createTypographyStyle('headline01', font_weights.regular),
    },
  },

  headline2: {
    l: {
      bold: createTypographyStyle('headline02', font_weights.bold),
      medium: createTypographyStyle('headline02', font_weights.medium),
      regular: createTypographyStyle('headline02', font_weights.regular),
    },
  },

  headline3: {
    m: {
      bold: createTypographyStyle('headline03', font_weights.bold),
      medium: createTypographyStyle('headline03', font_weights.medium),
      regular: createTypographyStyle('headline03', font_weights.regular),
    },
  },

  headline4: {
    r: {
      bold: createTypographyStyle('headline04', font_weights.bold),
      medium: createTypographyStyle('headline04', font_weights.medium),
      regular: createTypographyStyle('headline04', font_weights.regular),
    },
  },

  body1: {
    l: {
      bold: createTypographyStyle('body01', font_weights.bold),
      medium: createTypographyStyle('body01', font_weights.medium),
      regular: createTypographyStyle('body01', font_weights.regular),
    },
  },

  body2: {
    r: {
      bold: createTypographyStyle('body02', font_weights.bold),
      medium: createTypographyStyle('body02', font_weights.medium),
      regular: createTypographyStyle('body02', font_weights.regular),
    },
  },

  detail: {
    r: {
      bold: createTypographyStyle('detail', font_weights.bold),
      medium: createTypographyStyle('detail', font_weights.medium),
      regular: createTypographyStyle('detail', font_weights.regular),
    },
  },

  button1: {
    l: {
      bold: createTypographyStyle('button01', font_weights.bold),
      medium: createTypographyStyle('button01', font_weights.medium),
      regular: createTypographyStyle('button01', font_weights.regular),
    },
  },

  button2: {
    r: {
      bold: createTypographyStyle('button02', font_weights.bold),
      medium: createTypographyStyle('button02', font_weights.medium),
      regular: createTypographyStyle('button02', font_weights.regular),
    },
  },

  tiny: {
    r: {
      bold: createTypographyStyle('tiny', font_weights.bold),
      medium: createTypographyStyle('tiny', font_weights.medium),
      regular: createTypographyStyle('tiny', font_weights.regular),
    },
  },

  pickerNav: {
    nav: {
      regular: createTypographyStyle('pickerNav', font_weights.regular),
      medium: createTypographyStyle('pickerNav', font_weights.medium),
      bold: createTypographyStyle('pickerNav', font_weights.bold),
    },
  },

  categoryEmoji: {
    m: {
      regular: createTypographyStyle('categoryEmojiM', font_weights.regular),
    },
    l: {
      regular: createTypographyStyle('categoryEmojiL', font_weights.regular),
    },
  },
} as const;
