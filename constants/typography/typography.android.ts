/**
 * Android typography overrides (paragraph · singleRow · fieldInput).
 */

export const typographyAndroid = {
  paragraph: {
    headline01: { lineHeight: 48 },
    headline02: { lineHeight: 42 },
    headline03: { lineHeight: 36 },
    headline04: { lineHeight: 31.5 },
    body01: { lineHeight: 24 },
    body02: { lineHeight: 21 },
    detail: { lineHeight: 18 },
    button01: { lineHeight: 24 },
    button02: { lineHeight: 21 },
    tiny: { lineHeight: 15 },
    pickerNav: { lineHeight: 25.5 },
    pickerWheel: { lineHeight: 33 },
    categoryEmojiM: { lineHeight: 54 },
    categoryEmojiL: { lineHeight: 48 },
  },
  singleRow: {
    body01: { lineHeight: 21 },
    body02: { lineHeight: 18 },
    pickerNav: { lineHeight: 21 },
  },
  fieldInput: {
    line: { body01: 21 },
    area: { body01: 24 },
  },
} as const;
