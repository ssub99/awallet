/**
 * Load Pretendard fonts before first paint.
 * Required for Expo Go and ensures Android uses design-system fonts.
 */

import { PRETENDARD_FONT_ASSETS } from '@/constants/fonts';
import { useFonts } from 'expo-font';

export function useAppFonts() {
  const [loaded, error] = useFonts(PRETENDARD_FONT_ASSETS);

  return {
    fontsLoaded: loaded,
    fontError: error,
  };
}
