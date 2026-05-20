import { Dimensions, type KeyboardEvent } from 'react-native';

export const QUICK_INPUT_KEYBOARD_GAP = 16;

type KeyboardEndCoordinates = KeyboardEvent['endCoordinates'];

export type KeyboardMetricsLike = Pick<
  KeyboardEndCoordinates,
  'height' | 'screenX' | 'screenY' | 'width'
>;

/** screenY가 화면 상단 오인식(→ top:16 버그)인지 검증 */
export function isPlausibleKeyboardScreenY(screenY: number, windowHeight: number): boolean {
  const minTop = windowHeight * 0.35;
  return Number.isFinite(screenY) && screenY >= minTop && screenY < windowHeight - 48;
}

function resolveBottomFromScreenY(screenY: number, windowHeight: number, screenHeight: number): number {
  const fromWindow = windowHeight - screenY + QUICK_INPUT_KEYBOARD_GAP;
  if (screenHeight !== windowHeight) {
    const fromScreen = screenHeight - screenY + QUICK_INPUT_KEYBOARD_GAP;
    return Math.min(fromWindow, fromScreen);
  }
  return fromWindow;
}

/**
 * 키보드 상단까지의 거리(bottom).
 * 동일 프레임의 screenY·RN height·controller height 중 최댓값 → 툴바 on/off·추천행 실시간 반영.
 */
export function resolveQuickInputBottomAboveKeyboard(
  endCoordinates: KeyboardEndCoordinates,
  navigationInsetBottom = 0,
  nativeKeyboardHeight = 0
): number {
  const windowHeight = Dimensions.get('window').height;
  const screenHeight = Dimensions.get('screen').height;
  const { height, screenY } = endCoordinates;
  const navInset = Math.max(0, navigationInsetBottom);

  const fromNative =
    nativeKeyboardHeight > 0 ? nativeKeyboardHeight + QUICK_INPUT_KEYBOARD_GAP : 0;
  const fromEventHeight = height > 0 ? height + QUICK_INPUT_KEYBOARD_GAP : 0;
  const fromEventHeightWithNav =
    height > 0 && !isPlausibleKeyboardScreenY(screenY, windowHeight)
      ? height + QUICK_INPUT_KEYBOARD_GAP + navInset
      : 0;
  const fromScreenY = isPlausibleKeyboardScreenY(screenY, windowHeight)
    ? resolveBottomFromScreenY(screenY, windowHeight, screenHeight)
    : 0;

  const candidates = [fromScreenY, fromNative, fromEventHeight, fromEventHeightWithNav].filter(
    (value) => Number.isFinite(value) && value >= QUICK_INPUT_KEYBOARD_GAP
  );

  if (candidates.length === 0) {
    return QUICK_INPUT_KEYBOARD_GAP;
  }

  return Math.max(...candidates);
}

export function keyboardMetricsToEndCoordinates(metrics: KeyboardMetricsLike): KeyboardEndCoordinates {
  return {
    height: metrics.height,
    screenX: metrics.screenX,
    screenY: metrics.screenY,
    width: metrics.width,
  };
}

/** screenY 기준 bottom (플랫폼 공통) */
export function resolveBottomFromKeyboardScreenY(
  screenY: number,
  windowHeight = Dimensions.get('window').height,
  screenHeight = Dimensions.get('screen').height
): number {
  if (!isPlausibleKeyboardScreenY(screenY, windowHeight)) {
    return 0;
  }
  return resolveBottomFromScreenY(screenY, windowHeight, screenHeight);
}
