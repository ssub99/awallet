/**
 * Spacing scale — 4px grid (+ spacing-50 = 2px).
 * Figma variables: spacing-50 … spacing-1400 (same numeric suffix).
 */
export const spacing = {
  0: 0,
  50: 2,
  100: 4,
  200: 8,
  300: 12,
  400: 16,
  500: 20,
  600: 24,
  700: 28,
  800: 32,
  900: 36,
  1000: 40,
  1100: 44,
  1200: 48,
  1300: 52,
  1400: 56,
} as const;

export type SpacingToken = keyof typeof spacing;

/** Figma variable name for a spacing token key (e.g. 400 → `spacing-400`). */
export function spacingVariableName(token: SpacingToken): string {
  return `spacing-${token}`;
}

export function spacingPx(token: SpacingToken): number {
  return spacing[token];
}
