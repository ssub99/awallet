import { Platform, type KeyboardEvent } from 'react-native';

import {
  isPlausibleKeyboardScreenY,
  keyboardMetricsToEndCoordinates,
  QUICK_INPUT_KEYBOARD_GAP,
  resolveQuickInputBottomAboveKeyboard,
} from '@/utils/quick-input-keyboard-position';

/** TopNavigation content minHeight */
export const RECORD_FORM_TOP_NAV_HEIGHT = 56;

/** 메모 입력창 하단 ↔ 키보드(툴바 포함) 상단 간격 */
export const MEMO_KEYBOARD_GAP = QUICK_INPUT_KEYBOARD_GAP;

type KeyboardEndCoordinates = KeyboardEvent['endCoordinates'];

function resolveMemoBottomTargetOnScreen(
  keyboardEnd: KeyboardEndCoordinates,
  windowHeight: number,
  safeAreaBottom: number,
  nativeKeyboardHeight = 0,
): number {
  const { screenY, height } = keyboardEnd;

  if (isPlausibleKeyboardScreenY(screenY, windowHeight)) {
    return screenY - MEMO_KEYBOARD_GAP;
  }

  const occupiedFromBottom = resolveQuickInputBottomAboveKeyboard(
    keyboardEnd,
    safeAreaBottom,
    nativeKeyboardHeight,
  );
  return windowHeight - occupiedFromBottom + MEMO_KEYBOARD_GAP;
}

/** ScrollView contentContainerStyle paddingBottom (시스템 키보드·툴바 반영) */
export function getSystemKeyboardScrollPaddingBottom(
  keyboardEnd: KeyboardEndCoordinates | null,
  safeAreaBottom: number,
  nativeKeyboardHeight = 0,
): number {
  if (!keyboardEnd || keyboardEnd.height <= 0) {
    return MEMO_KEYBOARD_GAP;
  }

  if (Platform.OS === 'android') {
    // 스크롤(computeAndroidMemoScrollY)로 메모 위치를 맞추므로 content padding은 최소만
    return MEMO_KEYBOARD_GAP;
  }

  return keyboardEnd.height + MEMO_KEYBOARD_GAP - safeAreaBottom;
}

/**
 * Android: 메모 섹션 하단이 키보드(툴바 on/off) 위 16px에 오도록 scroll Y 계산.
 */
export function computeAndroidMemoScrollY(params: {
  memoSectionY: number;
  memoSectionHeight: number;
  windowHeight: number;
  keyboardEnd: KeyboardEndCoordinates;
  safeAreaTop: number;
  safeAreaBottom: number;
  nativeKeyboardHeight?: number;
}): number {
  const {
    memoSectionY,
    memoSectionHeight,
    windowHeight,
    keyboardEnd,
    safeAreaTop,
    safeAreaBottom,
    nativeKeyboardHeight = 0,
  } = params;

  const memoBottomInContent = memoSectionY + memoSectionHeight;
  const scrollViewTopOnScreen = safeAreaTop + RECORD_FORM_TOP_NAV_HEIGHT;
  const memoBottomTargetOnScreen = resolveMemoBottomTargetOnScreen(
    keyboardEnd,
    windowHeight,
    safeAreaBottom,
    nativeKeyboardHeight,
  );
  const memoBottomTargetInScrollView = memoBottomTargetOnScreen - scrollViewTopOnScreen;
  return Math.max(0, memoBottomInContent - memoBottomTargetInScrollView);
}

export { keyboardMetricsToEndCoordinates };
