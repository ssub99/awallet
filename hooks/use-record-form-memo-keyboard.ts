import {
  getMemoKeyboardScrollPaddingBottom,
  MEMO_KEYBOARD_GAP,
  scrollScrollViewSectionAboveKeyboard,
} from '@/utils/record-form-keyboard-scroll';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  Keyboard,
  Platform,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type TextInput,
} from 'react-native';

type UseRecordFormMemoKeyboardParams = {
  scrollViewRef: RefObject<ScrollView | null>;
  memoSectionYRef: RefObject<number>;
  memoSectionHeightRef: RefObject<number>;
  windowHeight: number;
  safeAreaBottom: number;
};

const MEMO_FOCUS_SCROLL_DELAY_MS = 350;

/**
 * 수입/소비 기록: 메모 포커스 시 키보드·입력창 16px 간격·스크롤 (iOS 검증 로직, 플랫폼 공통).
 */
export function useRecordFormMemoKeyboard({
  scrollViewRef,
  memoSectionYRef,
  memoSectionHeightRef,
  windowHeight,
  safeAreaBottom,
}: UseRecordFormMemoKeyboardParams) {
  const memoInputRef = useRef<TextInput>(null);
  const scrollYRef = useRef(0);
  const isMemoFocusedRef = useRef(false);
  const suppressKeyboardHideBlurRef = useRef(false);
  const memoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestKeyboardEndRef = useRef<KeyboardEvent['endCoordinates'] | null>(null);
  const pendingAndroidScrollRef = useRef(false);
  const memoPointerActiveRef = useRef(false);
  const pendingKeyboardEndRef = useRef<KeyboardEvent['endCoordinates'] | null>(null);

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

  const scrollMemoAboveKeyboard = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      scrollScrollViewSectionAboveKeyboard({
        scrollViewRef,
        sectionYRef: memoSectionYRef,
        sectionHeightRef: memoSectionHeightRef,
        scrollYRef,
        keyboardEnd: endCoordinates,
        inputRef: memoInputRef,
        windowHeight,
      });
    },
    [memoSectionHeightRef, memoSectionYRef, scrollViewRef, windowHeight],
  );

  const commitKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
      latestKeyboardEndRef.current = endCoordinates;
      const paddingBottom = getMemoKeyboardScrollPaddingBottom(
        endCoordinates,
        safeAreaBottom,
        nativeHeight,
      );

      setKeyboardPaddingBottom(paddingBottom);
      setIsMemoSystemKeyboardOpen(
        endCoordinates.height > 0 && isMemoFocusedRef.current,
      );

      if (
        Platform.OS === 'android' &&
        endCoordinates.height > 0 &&
        isMemoFocusedRef.current
      ) {
        suppressKeyboardHideBlurRef.current = false;
        pendingAndroidScrollRef.current = true;
      }
    },
    [safeAreaBottom],
  );

  const applyKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      if (
        Platform.OS === 'android' &&
        endCoordinates.height > 0 &&
        memoPointerActiveRef.current
      ) {
        pendingKeyboardEndRef.current = endCoordinates;
        return;
      }

      pendingKeyboardEndRef.current = null;
      commitKeyboardGeometry(endCoordinates);
    },
    [commitKeyboardGeometry],
  );

  const flushPendingKeyboardGeometry = useCallback(() => {
    const pending = pendingKeyboardEndRef.current;
    if (!pending) {
      return;
    }
    pendingKeyboardEndRef.current = null;
    commitKeyboardGeometry(pending);
  }, [commitKeyboardGeometry]);

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

  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || !pendingAndroidScrollRef.current) {
      return;
    }
    if (!isMemoFocusedRef.current || !latestKeyboardEndRef.current?.height) {
      pendingAndroidScrollRef.current = false;
      return;
    }

    pendingAndroidScrollRef.current = false;
    scrollMemoAboveKeyboard(latestKeyboardEndRef.current);
  }, [keyboardPaddingBottom, scrollMemoAboveKeyboard]);

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    suppressKeyboardHideBlurRef.current = true;
    clearMemoScrollTimeout();
    if (Platform.OS === 'ios') {
      memoScrollTimeoutRef.current = setTimeout(() => {
        memoScrollTimeoutRef.current = null;
        suppressKeyboardHideBlurRef.current = false;
        if (memoSectionYRef.current > 0) {
          const scrollOffset = windowHeight * 0.266;
          const scrollY = Math.max(0, memoSectionYRef.current - scrollOffset);
          scrollViewRef.current?.scrollTo({
            y: scrollY,
            animated: true,
          });
          scrollYRef.current = scrollY;
        }
      }, MEMO_FOCUS_SCROLL_DELAY_MS);
    }
  }, [clearMemoScrollTimeout, memoSectionYRef, scrollViewRef, windowHeight]);

  const onMemoScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleMemoBlur = useCallback(() => {
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    clearMemoScrollTimeout();
    setIsMemoSystemKeyboardOpen(false);
  }, [clearMemoScrollTimeout]);

  const focusMemoInput = useCallback(() => {
    memoInputRef.current?.focus();
  }, []);

  const handleMemoPointerStart = useCallback(() => {
    memoPointerActiveRef.current = true;
  }, []);

  const handleMemoPointerEnd = useCallback(() => {
    memoPointerActiveRef.current = false;
    flushPendingKeyboardGeometry();
  }, [flushPendingKeyboardGeometry]);

  return {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    handleMemoFocus,
    handleMemoBlur,
    focusMemoInput,
    onMemoScroll,
    memoPointerHandlers: {
      onPressIn: handleMemoPointerStart,
      onPressOut: handleMemoPointerEnd,
    },
  };
}
