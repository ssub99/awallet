/**
 * Load app fonts before first paint.
 * Pretendard = design-system.
 */

import { PRETENDARD_FONT_ASSETS } from '@/constants/fonts';
import { useFonts } from 'expo-font';

export function useAppFonts() {
  const [loaded, error] = useFonts({
    ...PRETENDARD_FONT_ASSETS,
  });

  return {
    fontsLoaded: loaded,
    fontError: error,
  };
}
