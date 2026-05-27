/**
 * Atomic Color System
 * 
 * Base color palette for AWallet design system.
 * These colors are the foundation and should be referenced by semantic colors.
 * 
 * Naming Convention:
 * - Figma/Notion: "Common/0", "Neutral/500", "Cool Neutral/500"
 * - Code: common[0], neutral[500], coolNeutral[500]
 * 
 * Token Mapping:
 * - Figma/Notion tokens follow the pattern: color-atomic-{category}-{scale}
 * - Example: "color-atomic-blue-500" maps to atomicColors.blue[500]
 */

// Base colors - Single source of truth
const common = {
  0: '#FFFFFF',    // white - Token: color-atomic-common-white-0
  100: '#000000',  // black - Token: color-atomic-common-black-100
} as const;

export const atomicColors = {
  /**
   * Common colors (Base)
   * These are referenced by other color scales
   */
  common,

  /**
   * Neutral grayscale
   * Token prefix: color-atomic-neutral-{scale}
   * Note: 0 and 1000 reference common colors
   */
  neutral: {
    0: common[0],      // Reference: Common/0 (#FFFFFF) - Token: color-atomic-neutral-0
    50: '#FAFAFA',     // Token: color-atomic-neutral-50
    100: '#F5F5F5',    // Token: color-atomic-neutral-100
    200: '#EDEDED',    // Token: color-atomic-neutral-200
    300: '#E0E0E0',    // Token: color-atomic-neutral-300
    400: '#BDBDBD',    // Token: color-atomic-neutral-400
    500: '#9E9E9E',    // Token: color-atomic-neutral-500
    600: '#757575',    // Token: color-atomic-neutral-600
    700: '#616161',    // Token: color-atomic-neutral-700
    800: '#424242',    // Token: color-atomic-neutral-800
    900: '#222222',    // Token: color-atomic-neutral-900
    1000: common[100], // Reference: Common/100 (#000000) - Token: color-atomic-neutral-1000
  },

  /**
   * Cool Neutral (Blue-tinted gray)
   * Token prefix: color-atomic-coolneutral-{scale}
   * Used for borders, fills, and subtle UI elements
   */
  coolNeutral: {
    50: '#F9F9F9',   // Token: color-atomic-coolneutral-50
    100: '#F5F5F8',  // Token: color-atomic-coolneutral-100
    200: '#DADBE2',  // Token: color-atomic-coolneutral-200
    300: '#C1C2CB',  // Token: color-atomic-coolneutral-300
    400: '#A8A9B4',  // Token: color-atomic-coolneutral-400
    500: '#90929E',  // Token: color-atomic-coolneutral-500
    600: '#797A87',  // Token: color-atomic-coolneutral-600
    700: '#636470',  // Token: color-atomic-coolneutral-700
    800: '#4D4E5A',  // Token: color-atomic-coolneutral-800
    900: '#393A43',  // Token: color-atomic-coolneutral-900
  },

  /**
   * Blue (Primary brand color)
   * Token prefix: color-atomic-blue-{scale}
   * 500 is the primary brand color
   */
  blue: {
    50: '#ECF0F8',   // Token: color-atomic-blue-50
    100: '#CBD5ED',  // Token: color-atomic-blue-100
    200: '#A7B9E3',  // Token: color-atomic-blue-200
    300: '#839DDB',  // Token: color-atomic-blue-300
    400: '#5D81D4',  // Token: color-atomic-blue-400
    500: '#3664CE',  // Token: color-atomic-blue-500 ⭐ Primary
    600: '#2552BB',  // Token: color-atomic-blue-600
    700: '#1942A1',  // Token: color-atomic-blue-700
    800: '#103386',  // Token: color-atomic-blue-800
    900: '#082569',  // Token: color-atomic-blue-900
  },

  /**
   * Red (Error/Negative states)
   * Token prefix: color-atomic-red-{scale}
   * 500 is the primary error color
   */
  red: {
    50: '#FBE9E9',   // Token: color-atomic-red-50
    100: '#F6C5C5',  // Token: color-atomic-red-100
    200: '#F3A0A0',  // Token: color-atomic-red-200
    300: '#F07A7A',  // Token: color-atomic-red-300
    400: '#EF5252',  // Token: color-atomic-red-400
    500: '#EF2A2A',  // Token: color-atomic-red-500 ⭐ Error/Negative
    600: '#E20D0D',  // Token: color-atomic-red-600
    700: '#BF0808',  // Token: color-atomic-red-700
    800: '#9A0404',  // Token: color-atomic-red-800
    900: '#740202',  // Token: color-atomic-red-900
  },

  /**
   * Green (Success/Positive states)
   * Token prefix: color-atomic-green-{scale}
   * 500 is the primary success color
   */
  green: {
    50: '#E8FCEE',   // Token: color-atomic-green-50
    100: '#B2F7C7',  // Token: color-atomic-green-100
    200: '#7BF39F',  // Token: color-atomic-green-200
    300: '#41F276',  // Token: color-atomic-green-300
    400: '#0CEB4F',  // Token: color-atomic-green-400
    500: '#07B63B',  // Token: color-atomic-green-500 ⭐ Success/Positive
    600: '#05A234',  // Token: color-atomic-green-600
    700: '#038D2C',  // Token: color-atomic-green-700
    800: '#027825',  // Token: color-atomic-green-800
    900: '#01621E',  // Token: color-atomic-green-900
  },
} as const;

/**
 * TypeScript type definitions for color scales
 */
export type CommonScale = 0 | 100;
export type ColorScale = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export type NeutralScale = 0 | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 1000;

/**
 * Token name mapping for reference
 * Maps Figma/Notion token names to code paths
 */
export const TokenMap = {
  // Common
  'color-atomic-common-white-0': atomicColors.common[0],
  'color-atomic-common-black-100': atomicColors.common[100],

  // Neutral (selected examples)
  'color-atomic-neutral-0': atomicColors.neutral[0],
  'color-atomic-neutral-500': atomicColors.neutral[500],
  'color-atomic-neutral-1000': atomicColors.neutral[1000],

  // Cool Neutral
  'color-atomic-coolneutral-500': atomicColors.coolNeutral[500],

  // Blue
  'color-atomic-blue-500': atomicColors.blue[500],

  // Red
  'color-atomic-red-500': atomicColors.red[500],

  // Green
  'color-atomic-green-500': atomicColors.green[500],
} as const;

/**
 * Helper function to get color by token name
 * 
 * @param token - Figma/Notion token name
 * @returns Hex color value
 * 
 * @example
 * ```ts
 * getColorByToken('color-atomic-blue-500') // Returns '#3664CE'
 * ```
 */
export function getColorByToken(token: keyof typeof TokenMap): string {
  return TokenMap[token];
}

