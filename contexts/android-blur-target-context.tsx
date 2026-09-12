import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';

/** Android dimezis BlurView용 BlurTargetView ref. Provider는 호출측에서 BlurTargetView와 함께 구성. */
export const AndroidBlurTargetContext = createContext<RefObject<View | null> | null>(null);

export function useAndroidBlurTarget(): RefObject<View | null> | null {
  return useContext(AndroidBlurTargetContext);
}
