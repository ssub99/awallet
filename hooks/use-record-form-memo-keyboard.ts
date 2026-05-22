import {
  getMemoKeyboardScrollPaddingBottom,
  MEMO_KEYBOARD_GAP,
} from '@/utils/record-form-keyboard-scroll';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type ScrollView,
  type TextInput,
} from 'react-native';

type UseRecordFormMemoKeyboardParams = {
  scrollViewRef: RefObject<ScrollView | null>;
  memoSectionYRef: RefObject<number>;
  memoSectionHeightRef: RefObject<number>;
  windowHeight: number;
  safeAreaTop: number;
  safeAreaBottom: number;
};

const MEMO_FOCUS_SCROLL_DELAY_MS = 350;

/**
 * 수입/소비 기록: 메모 포커스 시 키보드·입력창 16px 간격·스크롤 (iOS 검증 로직, 플랫폼 공통).
 */
export function useRecordFormMemoKeyboard({
  scrollViewRef,
  memoSectionYRef,
  windowHeight,
  safeAreaBottom,
}: UseRecordFormMemoKeyboardParams) {
  const memoInputRef = useRef<TextInput>(null);
  const isMemoFocusedRef = useRef(false);
  const suppressKeyboardHideBlurRef = useRef(false);
  const memoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(MEMO_KEYBOARD_GAP);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);

  const clearMemoScrollTimeout = useCallback(() => {
    if (memoScrollTimeoutRef.current) {
      clearTimeout(memoScrollTimeoutRef.current);
      memoScrollTimeoutRef.current = null;
    }
  }, []);

  const blurMemoInput = useCallback(() => {
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    clearMemoScrollTimeout();
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
    setIsMemoSystemKeyboardOpen(false);
  }, [clearMemoScrollTimeout]);

  const applyKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
      setKeyboardPaddingBottom(
        getMemoKeyboardScrollPaddingBottom(endCoordinates, safeAreaBottom, nativeHeight),
      );
      setIsMemoSystemKeyboardOpen(
        endCoordinates.height > 0 && isMemoFocusedRef.current,
      );
    },
    [safeAreaBottom],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      applyKeyboardGeometry(event.endCoordinates);
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (suppressKeyboardHideBlurRef.current) {
        return;
      }

      const hideHeight = event.endCoordinates.height;
      if (isMemoFocusedRef.current && hideHeight === 0) {
        blurMemoInput();
        return;
      }

      if (!isMemoFocusedRef.current) {
        setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
        setIsMemoSystemKeyboardOpen(false);
      }
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [applyKeyboardGeometry, blurMemoInput]);

  useEffect(() => () => clearMemoScrollTimeout(), [clearMemoScrollTimeout]);

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    suppressKeyboardHideBlurRef.current = true;
    clearMemoScrollTimeout();
    memoScrollTimeoutRef.current = setTimeout(() => {
      memoScrollTimeoutRef.current = null;
      suppressKeyboardHideBlurRef.current = false;
      if (memoSectionYRef.current > 0) {
        const scrollOffset = windowHeight * 0.266;
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, memoSectionYRef.current - scrollOffset),
          animated: true,
        });
      }
    }, MEMO_FOCUS_SCROLL_DELAY_MS);
  }, [clearMemoScrollTimeout, memoSectionYRef, scrollViewRef, windowHeight]);

  const handleMemoBlur = useCallback(() => {
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    clearMemoScrollTimeout();
    setIsMemoSystemKeyboardOpen(false);
  }, [clearMemoScrollTimeout]);

  const focusMemoInput = useCallback(() => {
    memoInputRef.current?.focus();
  }, []);

  return {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    handleMemoFocus,
    handleMemoBlur,
    focusMemoInput,
  };
}
