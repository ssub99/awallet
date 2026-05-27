/**
 * Theme Color System
 * 
 * Semantic color layer built on top of Atomic colors.
 * These colors define the actual usage contexts in the UI.
 * 
 * Mapping:
 * - Figma/Notion: "Primary/Normal", "Label/Strong", etc.
 * - Code: primary, labelStrong, etc. (camelCase)
 * 
 * Note: This layer references Atomic colors and should not contain hardcoded hex values.
 */

import { atomicColors } from './atomic-colors';

/**
 * Helper function to create RGBA color with opacity
 */
const withOpacity = (hex: string, opacity: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

/**
 * Theme colors - Light Mode
 * Based on Figma Semantic styles and Notion Theme documentation
 */
export const themeColors = {
  light: {
    // ========== Primary ==========
    // Brand colors for primary actions and highlights
    primary: atomicColors.blue[500],        // Primary/Normal - #3664CE
    primaryHeavy: atomicColors.blue[600],   // Primary/Heavy - #2552BB

    // ========== Label (Text) ==========
    // Text colors for different emphasis levels
    text: atomicColors.neutral[900],        // Label/Normal - #222222 (Default text)
    textStrong: atomicColors.common[100],   // Label/Strong - #000000 (Emphasized text)
    textNeutral: atomicColors.neutral[800], // Label/Neutral - #424242 (Secondary text)
    textAlt: atomicColors.neutral[700],     // Label/Alternative - #616161 (Tertiary text)
    textAssistive: atomicColors.neutral[500], // Label/Assistive - #9E9E9E (Helper text)
    textDisabled: atomicColors.neutral[400], // Label/Disabled - #BDBDBD (Disabled text)

    // ========== Fill ==========
    // Background fills with opacity (based on CoolNeutral/500)
    fill: withOpacity(atomicColors.coolNeutral[500], 0.1),    // Fill/Normal - rgba(144,146,158,0.1)
    fillStrong: withOpacity(atomicColors.coolNeutral[500], 0.16), // Fill/Strong - rgba(144,146,158,0.16)
    fillAlt: withOpacity(atomicColors.coolNeutral[500], 0.05),    // Fill/Alternative - rgba(144,146,158,0.05)
    fillDisabled: withOpacity(atomicColors.coolNeutral[500], 0.12), // Fill/Disabled - rgba(144,146,158,0.12)

    // ========== Background ==========
    // Main backgrounds for layouts
    background: atomicColors.common[0],     // Background/Normal - #FFFFFF
    backgroundAlt: atomicColors.neutral[50], // Background/Alternative - #FAFAFA

    // ========== Line/Border ==========
    // Border and divider colors
    
    // Line/Normal - Standard borders with higher opacity
    border: withOpacity(atomicColors.coolNeutral[500], 0.16),       // Line/Normal/Normal - rgba(144,146,158,0.16)
    borderStrong: withOpacity(atomicColors.coolNeutral[500], 0.32), // Line/Normal/Strong - rgba(144,146,158,0.32)
    borderAlt: withOpacity(atomicColors.coolNeutral[500], 0.08),    // Line/Normal/Alternative - rgba(144,146,158,0.08)
    
    // Line/Solid - Solid borders (lighter than Normal)
    borderSolid: withOpacity(atomicColors.coolNeutral[500], 0.1),   // Line/Solid/Normal - rgba(144,146,158,0.1)
    // Note: Figma only has Line/Solid/Normal. Strong and Alternative variants don't exist in Figma.

    // ========== Static ==========
    // Static colors that don't change with theme
    staticWhite: atomicColors.common[0],    // Static/White - #FFFFFF
    staticBlack: atomicColors.common[100],  // Static/Black - #000000

    // ========== Status ==========
    // Status indication colors
    statusNegative: atomicColors.red[500],  // Status/Negative - #EF2A2A (Error/Danger)
    // Note: Add statusPositive, statusWarning, statusInfo as needed

    // ========== Interaction ==========
    // Interaction states
    disabled: withOpacity(atomicColors.coolNeutral[500], 0.12), // Interaction/Disabled - rgba(144,146,158,0.12)

    // ========== Legacy/Compatibility ==========
    // For backward compatibility with existing code
    tint: atomicColors.blue[500],
    icon: atomicColors.neutral[900],
    tabIconDefault: atomicColors.neutral[500],
    tabIconSelected: atomicColors.blue[500],
  },

  dark: {
    // ========== Primary ==========
    // In dark mode, use lighter blue variants
    primary: atomicColors.blue[400],        // Lighter for dark backgrounds
    primaryHeavy: atomicColors.blue[500],

    // ========== Label (Text) ==========
    // Inverted text colors for dark mode
    text: atomicColors.neutral[50],         // Light text on dark background
    textStrong: atomicColors.common[0],     // Pure white for emphasis
    textNeutral: atomicColors.neutral[200],
    textAlt: atomicColors.neutral[300],
    textAssistive: atomicColors.neutral[500],
    textDisabled: atomicColors.neutral[600],

    // ========== Fill ==========
    fill: withOpacity(atomicColors.coolNeutral[500], 0.15),
    fillStrong: withOpacity(atomicColors.coolNeutral[500], 0.25),
    fillAlt: withOpacity(atomicColors.coolNeutral[500], 0.08),
    fillDisabled: withOpacity(atomicColors.coolNeutral[500], 0.12),

    // ========== Background ==========
    background: atomicColors.common[100],   // Black background
    backgroundAlt: atomicColors.neutral[900],

    // ========== Line/Border ==========
    border: withOpacity(atomicColors.coolNeutral[500], 0.2),
    borderStrong: withOpacity(atomicColors.coolNeutral[500], 0.35),
    borderAlt: withOpacity(atomicColors.coolNeutral[500], 0.1),
    borderSolid: withOpacity(atomicColors.coolNeutral[500], 0.15),

    // ========== Static ==========
    staticWhite: atomicColors.common[0],
    staticBlack: atomicColors.common[100],

    // ========== Status ==========
    statusNegative: atomicColors.red[400],  // Slightly lighter for dark mode

    // ========== Interaction ==========
    disabled: withOpacity(atomicColors.coolNeutral[500], 0.12),

    // ========== Legacy/Compatibility ==========
    tint: atomicColors.blue[400],
    icon: atomicColors.neutral[200],
    tabIconDefault: atomicColors.neutral[500],
    tabIconSelected: atomicColors.blue[400],
  },
} as const;

/**
 * Color usage guide:
 * 
 * @example
 * ```tsx
 * import { themeColors } from '@/constants/theme-colors';
 * import { useColorScheme } from '@/hooks/use-color-scheme';
 * 
 * function MyComponent() {
 *   const colorScheme = useColorScheme();
 *   const palette = themeColors[colorScheme ?? 'light'];
 *   
 *   return (
 *     <View style={{ backgroundColor: colors.background }}>
 *       <Text style={{ color: colors.text }}>Hello</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export type ThemeColorScheme = keyof typeof themeColors;
export type ThemeColorKey = keyof typeof themeColors.light;

