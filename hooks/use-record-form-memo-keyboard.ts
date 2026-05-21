import {
  computeMemoScrollY,
  getSystemKeyboardScrollPaddingBottom,
  keyboardMetricsToEndCoordinates,
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

/**
 * 수입/소비 기록: 메모 키보드 패딩·스크롤 (caa76df 기준).
 * Android keyboardDidHide 시 blur 하지 않음(포커스 직후 키보드가 바로 닫히는 충돌 방지).
 */
export function useRecordFormMemoKeyboard({
  scrollViewRef,
  memoSectionYRef,
  memoSectionHeightRef,
  windowHeight,
  safeAreaTop,
  safeAreaBottom,
}: UseRecordFormMemoKeyboardParams) {
  const memoInputRef = useRef<TextInput>(null);
  const isMemoFocusedRef = useRef(false);
  const suppressKeyboardHideBlurRef = useRef(false);
  const pendingAndroidMemoScrollRef = useRef(false);
  const iosScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(MEMO_KEYBOARD_GAP);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);
  /** Android resize 시 하단 CTA·결제유형이 키보드 위로 붙는 것 방지 */
  const [hideAndroidRecordFormBottomChrome, setHideAndroidRecordFormBottomChrome] =
    useState(false);

  const clearIosScrollTimeout = useCallback(() => {
    if (iosScrollTimeoutRef.current) {
      clearTimeout(iosScrollTimeoutRef.current);
      iosScrollTimeoutRef.current = null;
    }
  }, []);

  const blurMemoInput = useCallback(() => {
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    pendingAndroidMemoScrollRef.current = false;
    clearIosScrollTimeout();
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
    setIsMemoSystemKeyboardOpen(false);
    setHideAndroidRecordFormBottomChrome(false);
  }, [clearIosScrollTimeout]);

  const applyKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
      setKeyboardPaddingBottom(
        getSystemKeyboardScrollPaddingBottom(
          endCoordinates,
          safeAreaBottom,
          nativeHeight,
        ),
      );
      setIsMemoSystemKeyboardOpen(
        endCoordinates.height > 0 && isMemoFocusedRef.current,
      );

      if (
        Platform.OS !== 'android' ||
        !pendingAndroidMemoScrollRef.current ||
        memoSectionYRef.current <= 0 ||
        memoSectionHeightRef.current <= 0
      ) {
        return;
      }

      pendingAndroidMemoScrollRef.current = false;
      const scrollY = computeMemoScrollY({
        memoSectionY: memoSectionYRef.current,
        memoSectionHeight: memoSectionHeightRef.current,
        windowHeight,
        keyboardEnd: endCoordinates,
        safeAreaTop,
        safeAreaBottom,
      });
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
    },
    [
      memoSectionHeightRef,
      memoSectionYRef,
      safeAreaBottom,
      safeAreaTop,
      scrollViewRef,
      windowHeight,
    ],
  );

  const scheduleAndroidKeyboardGeometrySync = useCallback(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    requestAnimationFrame(() => {
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        applyKeyboardGeometry(keyboardMetricsToEndCoordinates(metrics));
      }
    });
  }, [applyKeyboardGeometry]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      applyKeyboardGeometry(event.endCoordinates);
      scheduleAndroidKeyboardGeometrySync();
    });

    const frameSub =
      Platform.OS === 'android'
        ? Keyboard.addListener('keyboardDidChangeFrame', (event) => {
            if (!isMemoFocusedRef.current || event.endCoordinates.height <= 0) {
              return;
            }
            applyKeyboardGeometry(event.endCoordinates);
            scheduleAndroidKeyboardGeometrySync();
          })
        : null;

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (Platform.OS === 'android') {
        pendingAndroidMemoScrollRef.current = false;
        if (!isMemoFocusedRef.current) {
          setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
          setIsMemoSystemKeyboardOpen(false);
          setHideAndroidRecordFormBottomChrome(false);
        }
        return;
      }

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
      pendingAndroidMemoScrollRef.current = false;
    });

    return () => {
      showSub.remove();
      frameSub?.remove();
      hideSub.remove();
    };
  }, [applyKeyboardGeometry, blurMemoInput, scheduleAndroidKeyboardGeometrySync]);

  useEffect(() => () => clearIosScrollTimeout(), [clearIosScrollTimeout]);

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    suppressKeyboardHideBlurRef.current = true;

    if (Platform.OS === 'android') {
      pendingAndroidMemoScrollRef.current = true;
      setHideAndroidRecordFormBottomChrome(true);
      return;
    }

    clearIosScrollTimeout();
    iosScrollTimeoutRef.current = setTimeout(() => {
      iosScrollTimeoutRef.current = null;
      suppressKeyboardHideBlurRef.current = false;
      if (memoSectionYRef.current > 0) {
        const scrollOffset = windowHeight * 0.266;
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, memoSectionYRef.current - scrollOffset),
          animated: true,
        });
      }
    }, 350);
  }, [clearIosScrollTimeout, memoSectionYRef, scrollViewRef, windowHeight]);

  const handleMemoBlur = useCallback(() => {
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    pendingAndroidMemoScrollRef.current = false;
    clearIosScrollTimeout();
    setIsMemoSystemKeyboardOpen(false);
    setHideAndroidRecordFormBottomChrome(false);
  }, [clearIosScrollTimeout]);

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
    hideAndroidRecordFormBottomChrome,
  };
}
