import { type KeyboardEvent } from 'react-native';

import {
  keyboardMetricsToEndCoordinates,
  QUICK_INPUT_KEYBOARD_GAP,
} from '@/utils/quick-input-keyboard-position';

/** 메모 입력창 하단 ↔ 키보드(툴바 포함) 상단 간격 */
export const MEMO_KEYBOARD_GAP = QUICK_INPUT_KEYBOARD_GAP;

type KeyboardEndCoordinates = KeyboardEvent['endCoordinates'];

/** ScrollView contentContainerStyle paddingBottom (시스템 키보드·툴바 반영) */
export function getMemoKeyboardScrollPaddingBottom(
  keyboardEnd: KeyboardEndCoordinates | null,
  safeAreaBottom: number,
  _nativeKeyboardHeight = 0,
): number {
  if (!keyboardEnd || keyboardEnd.height <= 0) {
    return MEMO_KEYBOARD_GAP;
  }

  return keyboardEnd.height + MEMO_KEYBOARD_GAP - safeAreaBottom;
}

export { keyboardMetricsToEndCoordinates };
