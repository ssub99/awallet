/**
 * Load app fonts before first paint.
 * Pretendard = design-system. Nanum Brush Script = 체험 힌트 전용(DS typography 미등록).
 */

import { PRETENDARD_FONT_ASSETS } from '@/constants/fonts';
import { useFonts } from 'expo-font';

const TUTORIAL_BRUSH_FONT_ASSETS = {
  'Nanum Brush Script': require('@/assets/fonts/NanumBrushScript-Regular.ttf'),
} as const;

export function useAppFonts() {
  const [loaded, error] = useFonts({
    ...PRETENDARD_FONT_ASSETS,
    ...TUTORIAL_BRUSH_FONT_ASSETS,
  });

  return {
    fontsLoaded: loaded,
    fontError: error,
  };
}
