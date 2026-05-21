import {
  computeMemoScrollY,
  getMemoKeyboardScrollPaddingBottom,
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

/** 메모 포커스 후 스크롤 지연 (iOS·Android 동일) */
const MEMO_FOCUS_SCROLL_DELAY_MS = 350;

/**
 * 수입/소비 기록: 메모 키보드 패딩·스크롤 (caa76df 기준).
 * Android(resize): padding 16px만, scroll은 키보드 표시 후 350ms.
 * 하단 CTA는 포커스 직후 숨김(resize 전). keyboardOpen 연동 숨김은 프레임 flicker로 버튼이 튀는 원인.
 * keyboardDidHide blur는 androidMemoKeyboardVisibleRef로 포커스 직후 spurious hide 제외.
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
  /** Android: 메모 키보드가 실제로 열린 뒤 hide일 때만 blur */
  const androidMemoKeyboardVisibleRef = useRef(false);
  const suppressKeyboardHideBlurRef = useRef(false);
  const pendingAndroidMemoScrollRef = useRef(false);
  const memoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(MEMO_KEYBOARD_GAP);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);
  /** Android resize 시 하단 CTA·결제유형이 키보드 위로 붙는 것 방지 */
  const [hideAndroidRecordFormBottomChrome, setHideAndroidRecordFormBottomChrome] =
    useState(false);

  const clearMemoScrollTimeout = useCallback(() => {
    if (memoScrollTimeoutRef.current) {
      clearTimeout(memoScrollTimeoutRef.current);
      memoScrollTimeoutRef.current = null;
    }
  }, []);

  const scheduleAndroidMemoScroll = useCallback(() => {
    clearMemoScrollTimeout();
    memoScrollTimeoutRef.current = setTimeout(() => {
      memoScrollTimeoutRef.current = null;
      if (
        !isMemoFocusedRef.current ||
        !pendingAndroidMemoScrollRef.current ||
        memoSectionYRef.current <= 0 ||
        memoSectionHeightRef.current <= 0
      ) {
        return;
      }
      const metrics = Keyboard.metrics();
      if (!metrics || metrics.height <= 0) {
        return;
      }
      pendingAndroidMemoScrollRef.current = false;
      const keyboardEnd = keyboardMetricsToEndCoordinates(metrics);
      const scrollY = computeMemoScrollY({
        memoSectionY: memoSectionYRef.current,
        memoSectionHeight: memoSectionHeightRef.current,
        windowHeight,
        keyboardEnd,
        safeAreaTop,
        safeAreaBottom,
      });
      scrollViewRef.current?.scrollTo({ y: scrollY, animated: true });
    }, MEMO_FOCUS_SCROLL_DELAY_MS);
  }, [
    clearMemoScrollTimeout,
    memoSectionHeightRef,
    memoSectionYRef,
    safeAreaBottom,
    safeAreaTop,
    scrollViewRef,
    windowHeight,
  ]);

  const blurMemoInput = useCallback(() => {
    isMemoFocusedRef.current = false;
    androidMemoKeyboardVisibleRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    pendingAndroidMemoScrollRef.current = false;
    clearMemoScrollTimeout();
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
    setIsMemoSystemKeyboardOpen(false);
    setHideAndroidRecordFormBottomChrome(false);
  }, [clearMemoScrollTimeout]);

  const applyKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
      setKeyboardPaddingBottom(
        getMemoKeyboardScrollPaddingBottom(
          endCoordinates,
          safeAreaBottom,
          nativeHeight,
        ),
      );
      const keyboardOpen =
        endCoordinates.height > 0 && isMemoFocusedRef.current;
      setIsMemoSystemKeyboardOpen(keyboardOpen);
      if (Platform.OS === 'android') {
        androidMemoKeyboardVisibleRef.current = keyboardOpen;
      }

      if (
        Platform.OS !== 'android' ||
        !pendingAndroidMemoScrollRef.current ||
        memoSectionYRef.current <= 0 ||
        memoSectionHeightRef.current <= 0 ||
        !keyboardOpen
      ) {
        return;
      }

      scheduleAndroidMemoScroll();
    },
    [memoSectionHeightRef, memoSectionYRef, scheduleAndroidMemoScroll],
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
        clearMemoScrollTimeout();
        if (
          isMemoFocusedRef.current &&
          androidMemoKeyboardVisibleRef.current &&
          event.endCoordinates.height === 0
        ) {
          blurMemoInput();
          return;
        }
        androidMemoKeyboardVisibleRef.current = false;
        if (!isMemoFocusedRef.current) {
          setHideAndroidRecordFormBottomChrome(false);
          setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
          setIsMemoSystemKeyboardOpen(false);
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
  }, [
    applyKeyboardGeometry,
    blurMemoInput,
    clearMemoScrollTimeout,
    scheduleAndroidKeyboardGeometrySync,
  ]);

  useEffect(() => () => clearMemoScrollTimeout(), [clearMemoScrollTimeout]);

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    suppressKeyboardHideBlurRef.current = true;

    if (Platform.OS === 'android') {
      pendingAndroidMemoScrollRef.current = true;
      setHideAndroidRecordFormBottomChrome(true);
      return;
    }

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
    androidMemoKeyboardVisibleRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    pendingAndroidMemoScrollRef.current = false;
    clearMemoScrollTimeout();
    setIsMemoSystemKeyboardOpen(false);
    setHideAndroidRecordFormBottomChrome(false);
  }, [clearMemoScrollTimeout]);

  const focusMemoInput = useCallback(() => {
    if (Platform.OS === 'android') {
      setHideAndroidRecordFormBottomChrome(true);
    }
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
