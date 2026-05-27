/**
 * Pretendard font assets and family names.
 *
 * Android does not apply fontWeight to a single custom font family.
 * Use weight-specific family names (loaded via expo-font / config plugin).
 */

import type { TextStyle } from 'react-native';
import { Platform } from 'react-native';

export const PRETENDARD_FONT_ASSETS = {
  'Pretendard-Regular': require('@/assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('@/assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-Bold': require('@/assets/fonts/Pretendard-Bold.otf'),
} as const;

export const PRETENDARD_FAMILY = {
  regular: 'Pretendard-Regular',
  medium: 'Pretendard-Medium',
  bold: 'Pretendard-Bold',
} as const;

export type PretendardWeight = '400' | '500' | '700';

const WEIGHT_TO_FAMILY: Record<PretendardWeight, string> = {
  '400': PRETENDARD_FAMILY.regular,
  '500': PRETENDARD_FAMILY.medium,
  '700': PRETENDARD_FAMILY.bold,
};

/** Map React Native fontWeight to Pretendard file family name */
export function pretendardFontFamily(fontWeight: TextStyle['fontWeight'] = '400'): string {
  const key = String(fontWeight ?? '400');
  if (key === '700' || key === 'bold') return PRETENDARD_FAMILY.bold;
  if (key === '500' || key === 'medium' || key === '600') return PRETENDARD_FAMILY.medium;
  return PRETENDARD_FAMILY.regular;
}

/** typography / StyleSheet helper — correct family per weight on all platforms */
export function pretendardTextStyle(
  weight: PretendardWeight | TextStyle['fontWeight'] = '400',
): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const resolvedWeight: PretendardWeight =
    weight === '700' || weight === 'bold'
      ? '700'
      : weight === '500' || weight === 'medium' || weight === '600'
        ? '500'
        : '400';

  const fontFamily = WEIGHT_TO_FAMILY[resolvedWeight];

  if (Platform.OS === 'android') {
    return { fontFamily };
  }

  return {
    fontFamily,
    fontWeight: resolvedWeight,
  };
}
