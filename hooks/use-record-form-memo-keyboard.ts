import {
  computeAndroidMemoScrollY,
  getSystemKeyboardScrollPaddingBottom,
  keyboardMetricsToEndCoordinates,
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
 * 수입/소비 기록 화면: 메모 시스템 키보드 패딩·Android 스크롤(툴바 on/off)·블러 처리.
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
  const pendingAndroidMemoScrollRef = useRef(false);
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(16);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);

  const blurMemoInput = useCallback(() => {
    isMemoFocusedRef.current = false;
    setIsMemoSystemKeyboardOpen(false);
    pendingAndroidMemoScrollRef.current = false;
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(16);
  }, []);

  const applyKeyboardGeometry = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
      const padding = getSystemKeyboardScrollPaddingBottom(
        endCoordinates,
        safeAreaBottom,
        nativeHeight,
      );
      setKeyboardPaddingBottom(padding);
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
      const scrollY = computeAndroidMemoScrollY({
        memoSectionY: memoSectionYRef.current,
        memoSectionHeight: memoSectionHeightRef.current,
        windowHeight,
        keyboardEnd: endCoordinates,
        safeAreaTop,
        safeAreaBottom,
        nativeKeyboardHeight: nativeHeight,
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
    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (isMemoFocusedRef.current) {
        blurMemoInput();
      } else {
        setKeyboardPaddingBottom(16);
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

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    if (Platform.OS === 'android') {
      pendingAndroidMemoScrollRef.current = true;
      return;
    }
    setTimeout(() => {
      if (memoSectionYRef.current > 0) {
        const scrollOffset = windowHeight * 0.266;
        scrollViewRef.current?.scrollTo({
          y: memoSectionYRef.current - scrollOffset,
          animated: true,
        });
      }
    }, 350);
  }, [memoSectionYRef, scrollViewRef, windowHeight]);

  const handleMemoBlur = useCallback(() => {
    isMemoFocusedRef.current = false;
    setIsMemoSystemKeyboardOpen(false);
  }, []);

  return {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    handleMemoFocus,
    handleMemoBlur,
  };
}
