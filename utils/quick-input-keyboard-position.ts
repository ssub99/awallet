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

/** 첫 IME 등에서 peak 대비 height가 급락하면 스파이크로 간주 (한 프레임 역방향) */
const IOS_KEYBOARD_SPIKE_HEIGHT_RATIO = 0.55;
const IOS_KEYBOARD_OPEN_EPSILON_PX = 0.5;

/**
 * iOS 간편입력 bottom (키보드 handler worklet).
 *
 * 1) `target = max(keyboardHeight + gap, 롱 앵커)` — 앵커 아래로 끊기지 않음.
 * 2) peak 대비 급락(스파이크) → `max(current, target)` — 첫 IME 역방향 프레임 무시.
 * 3) 그 외 열림 → `max(target, current)` 단조 상승.
 * 4) 닫힘·인터랙티브 하강 → `target` (height가 줄어들면 bottom도 따라감).
 * 키보드 완전 닫힘(height→0)은 handler에서 앵커 리셋 + hideQuickInput.
 */
export function resolveIosQuickInputBottomAboveAnchor(
  keyboardHeight: number,
  anchorBottom: number,
  currentBottom: number,
  previousKeyboardHeight: number,
  peakKeyboardHeight: number,
  gap: number = QUICK_INPUT_KEYBOARD_GAP,
): { bottom: number; nextPeakKeyboardHeight: number; nextPreviousHeight: number } {
  'worklet';
  const anchor = Number.isFinite(anchorBottom) ? anchorBottom : gap;
  const current = Number.isFinite(currentBottom) ? currentBottom : anchor;
  const height = Number.isFinite(keyboardHeight) && keyboardHeight > 0 ? keyboardHeight : 0;

  if (height <= 0) {
    return { bottom: anchor, nextPeakKeyboardHeight: 0, nextPreviousHeight: 0 };
  }

  const target = Math.max(height + gap, anchor);
  const nextPeak = Math.max(peakKeyboardHeight, height);
  const isLikelyOpenSpike =
    peakKeyboardHeight > 0 && height < peakKeyboardHeight * IOS_KEYBOARD_SPIKE_HEIGHT_RATIO;
  const decreasing = height < previousKeyboardHeight - IOS_KEYBOARD_OPEN_EPSILON_PX;

  let bottom: number;
  if (isLikelyOpenSpike) {
    bottom = Math.max(current, target);
  } else if (decreasing) {
    bottom = target;
  } else {
    bottom = Math.max(target, current);
  }

  return { bottom, nextPeakKeyboardHeight: nextPeak, nextPreviousHeight: height };
}
