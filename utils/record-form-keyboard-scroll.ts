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
  return windowHeight - occupiedFromBottom - MEMO_KEYBOARD_GAP;
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
    return resolveQuickInputBottomAboveKeyboard(
      keyboardEnd,
      safeAreaBottom,
      nativeKeyboardHeight,
    );
  }

  return keyboardEnd.height + MEMO_KEYBOARD_GAP - safeAreaBottom;
}

/**
 * 메모 포커스 시 ScrollView paddingBottom.
 * Android(pan): 윈도우가 이미 밀리므로 키보드 높이 padding을 쓰면 메모~키보드 사이 빈 공간이 생김.
 */
export function getMemoKeyboardScrollPaddingBottom(
  keyboardEnd: KeyboardEndCoordinates | null,
  safeAreaBottom: number,
  nativeKeyboardHeight = 0,
): number {
  if (Platform.OS === 'android') {
    return MEMO_KEYBOARD_GAP;
  }
  return getSystemKeyboardScrollPaddingBottom(
    keyboardEnd,
    safeAreaBottom,
    nativeKeyboardHeight,
  );
}

/** iOS 메모 포커스 시 ScrollView scroll Y (caa76df 검증 오프셋) */
export function computeIosMemoScrollY(memoSectionY: number, windowHeight: number): number {
  if (memoSectionY <= 0) {
    return 0;
  }
  const scrollOffset = windowHeight * 0.266;
  return Math.max(0, memoSectionY - scrollOffset);
}

/** ScrollView 가시 높이(상단 네비·하단 CTA 제외) */
export function getRecordFormScrollViewportHeight(
  windowHeight: number,
  safeAreaTop: number,
  scrollViewportBottomInset: number,
): number {
  return Math.max(
    0,
    windowHeight - safeAreaTop - RECORD_FORM_TOP_NAV_HEIGHT - scrollViewportBottomInset,
  );
}

/** Android: scrollY만큼만 padding 보강(pan+16px 기본 padding으로 부족할 때) */
export function getAndroidMemoScrollPaddingBottom(
  memoBottomInContent: number,
  scrollY: number,
  viewportHeight: number,
): number {
  const maxScrollWithBasePad = Math.max(
    0,
    memoBottomInContent + MEMO_KEYBOARD_GAP - viewportHeight,
  );
  if (scrollY <= maxScrollWithBasePad) {
    return MEMO_KEYBOARD_GAP;
  }
  return scrollY - maxScrollWithBasePad + MEMO_KEYBOARD_GAP;
}

/** 하단 CTA(저장 버튼) 높이 */
export function getRecordFormScrollViewportBottomInset(safeAreaBottom: number): number {
  return 16 + 48 + 16 + safeAreaBottom;
}

/**
 * 메모 섹션 하단이 키보드(툴바 on/off) 위 16px에 오도록 scroll Y 계산.
 * 스크롤 좌표는 키보드 이벤트 endCoordinates(screenY) 기준 — metrics는 패딩만.
 */
export function computeMemoScrollY(params: {
  memoSectionY: number;
  memoSectionHeight: number;
  windowHeight: number;
  keyboardEnd: KeyboardEndCoordinates;
  safeAreaTop: number;
  safeAreaBottom: number;
}): number {
  const {
    memoSectionY,
    memoSectionHeight,
    windowHeight,
    keyboardEnd,
    safeAreaTop,
    safeAreaBottom,
  } = params;

  const memoBottomInContent = memoSectionY + memoSectionHeight;
  const scrollViewTopOnScreen = safeAreaTop + RECORD_FORM_TOP_NAV_HEIGHT;
  const memoBottomTargetOnScreen = resolveMemoBottomTargetOnScreen(
    keyboardEnd,
    windowHeight,
    safeAreaBottom,
    0,
  );
  const memoBottomTargetInScrollView = memoBottomTargetOnScreen - scrollViewTopOnScreen;
  return Math.max(0, memoBottomInContent - memoBottomTargetInScrollView);
}

/** @deprecated computeMemoScrollY 사용 */
export function computeAndroidMemoScrollY(
  params: Parameters<typeof computeMemoScrollY>[0],
): number {
  return computeMemoScrollY(params);
}

export { keyboardMetricsToEndCoordinates };
