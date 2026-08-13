import type { RefObject } from 'react';
import {
  Dimensions,
  InteractionManager,
  Platform,
  type KeyboardEvent,
  type ScrollView,
  type TextInput,
} from 'react-native';

import {
  isPlausibleKeyboardScreenY,
  keyboardMetricsToEndCoordinates,
  QUICK_INPUT_KEYBOARD_GAP,
} from '@/utils/quick-input-keyboard-position';

/**
 * 메모 입력창 하단 ↔ 키보드(툴바 포함) 상단 간격 (디자인 토큰, dp).
 * 그 외 좌표·padding·스크롤량은 기기마다
 * Dimensions / Keyboard 이벤트 / measureInWindow / safeAreaInsets 로만 계산한다.
 */
export const MEMO_KEYBOARD_GAP = QUICK_INPUT_KEYBOARD_GAP;

/**
 * area Input: TextInput measureInWindow 하단 → 컨테이너 border 하단.
 * @see components/ui/input.tsx `containerArea.paddingVertical`
 */
const AREA_VARIANT_INPUT_BORDER_BOTTOM_INSET = 12;

type KeyboardEndCoordinates = KeyboardEvent['endCoordinates'];

/** 키보드 상단 Y (window 좌표) */
export function getKeyboardTopInWindow(
  keyboardEnd: KeyboardEndCoordinates,
  windowHeight = Dimensions.get('window').height,
): number {
  const screenHeight = Dimensions.get('screen').height;
  const windowOffset = Math.max(0, screenHeight - windowHeight);
  const fromHeight = windowHeight - keyboardEnd.height;
  const fromScreenY = isPlausibleKeyboardScreenY(keyboardEnd.screenY, windowHeight)
    ? keyboardEnd.screenY - windowOffset
    : null;

  if (Platform.OS === 'android') {
    if (Number.isFinite(fromHeight) && fromHeight > 0 && fromHeight < windowHeight) {
      return fromHeight;
    }
    if (fromScreenY != null) {
      return fromScreenY;
    }
    return fromHeight;
  }

  if (fromScreenY != null) {
    return fromScreenY;
  }
  return fromHeight;
}

/** ScrollView contentContainerStyle paddingBottom (시스템 키보드·툴바 반영) */
export function getMemoKeyboardScrollPaddingBottom(
  keyboardEnd: KeyboardEndCoordinates | null,
  safeAreaBottom: number,
  _nativeKeyboardHeight = 0,
): number {
  if (!keyboardEnd || keyboardEnd.height <= 0) {
    return MEMO_KEYBOARD_GAP;
  }

  const windowHeight = Dimensions.get('window').height;
  const keyboardTopInWindow = getKeyboardTopInWindow(keyboardEnd, windowHeight);

  if (Platform.OS === 'android') {
    return windowHeight - keyboardTopInWindow + MEMO_KEYBOARD_GAP;
  }

  return keyboardEnd.height + MEMO_KEYBOARD_GAP - safeAreaBottom;
}

/** 결제 유형 설명 등 SafeArea bottom edge 내부 ScrollView */
export function getDescriptionKeyboardScrollPaddingBottom(
  keyboardEnd: KeyboardEndCoordinates | null,
  safeAreaBottom: number,
): number {
  if (!keyboardEnd || keyboardEnd.height <= 0) {
    return MEMO_KEYBOARD_GAP;
  }

  if (Platform.OS === 'android') {
    return getMemoKeyboardScrollPaddingBottom(keyboardEnd, safeAreaBottom);
  }

  return keyboardEnd.height + MEMO_KEYBOARD_GAP;
}

type ScrollScrollViewSectionParams = {
  scrollViewRef: RefObject<ScrollView | null>;
  sectionYRef: RefObject<number>;
  sectionHeightRef: RefObject<number>;
  scrollYRef: RefObject<number>;
  keyboardEnd: KeyboardEndCoordinates;
  inputRef?: RefObject<TextInput | null>;
  windowHeight?: number;
  onScrollAttemptResult?: (result: {
    moved: boolean;
    overflow: number;
    scrollYBefore: number;
    targetY: number;
  }) => void;
};

function runAfterAndroidKeyboardLayout(task: () => void): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(task);
    });
  });
}

/** area Input 하단(border)을 키보드 상단에서 MEMO_KEYBOARD_GAP 위에 오도록 스크롤 */
export function scrollScrollViewSectionAboveKeyboard({
  scrollViewRef,
  sectionYRef,
  sectionHeightRef,
  scrollYRef,
  keyboardEnd,
  inputRef,
  windowHeight = Dimensions.get('window').height,
  onScrollAttemptResult,
}: ScrollScrollViewSectionParams): void {
  const scrollView = scrollViewRef.current;
  if (!scrollView) {
    onScrollAttemptResult?.({ moved: false, overflow: 0, scrollYBefore: 0, targetY: 0 });
    return;
  }

  const applyScroll = () => {
    const keyboardTop = getKeyboardTopInWindow(keyboardEnd, windowHeight);
    const targetBorderBottom = keyboardTop - MEMO_KEYBOARD_GAP;
    const targetMeasuredInputBottom =
      targetBorderBottom - AREA_VARIANT_INPUT_BORDER_BOTTOM_INSET;
    const scrollYBefore = scrollYRef.current;

    const finishScroll = (nextY: number) => {
      scrollView.scrollTo({ y: nextY, animated: true });
    };

    if (inputRef?.current) {
      inputRef.current.measureInWindow((_x, inputTop, _w, inputHeight) => {
        const overflow = inputTop + inputHeight - targetMeasuredInputBottom;
        if (overflow <= 0) {
          onScrollAttemptResult?.({ moved: false, overflow, scrollYBefore, targetY: scrollYBefore });
          return;
        }
        const targetY = scrollYBefore + overflow;
        finishScroll(targetY);
        onScrollAttemptResult?.({ moved: true, overflow, scrollYBefore, targetY });
      });
      return;
    }

    const sectionY = sectionYRef.current;
    const sectionHeight = sectionHeightRef.current;
    if (sectionY <= 0 || sectionHeight <= 0) {
      onScrollAttemptResult?.({ moved: false, overflow: 0, scrollYBefore, targetY: scrollYBefore });
      return;
    }

    const measurableScrollView = scrollView as unknown as {
      measureInWindow: (callback: (x: number, y: number) => void) => void;
    };

    measurableScrollView.measureInWindow((_x: number, scrollViewTop: number) => {
      const sectionBottomInWindow =
        scrollViewTop + sectionY + sectionHeight - scrollYBefore;
      const overflow = sectionBottomInWindow - targetBorderBottom;
      if (overflow <= 0) {
        onScrollAttemptResult?.({ moved: false, overflow, scrollYBefore, targetY: scrollYBefore });
        return;
      }
      const targetY = scrollYBefore + overflow;
      finishScroll(targetY);
      onScrollAttemptResult?.({ moved: true, overflow, scrollYBefore, targetY });
    });
  };

  if (Platform.OS === 'android') {
    runAfterAndroidKeyboardLayout(applyScroll);
  } else {
    applyScroll();
  }
}

export { keyboardMetricsToEndCoordinates };
