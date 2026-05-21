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

const ANDROID_MEMO_SCROLL_RETRY_MS = [0, 50, 150, 300] as const;
const IOS_MEMO_SCROLL_RETRY_MS = [0, 100, 350] as const;

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
  const androidScrollRetryTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const iosScrollRetryTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(16);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);

  const clearAndroidScrollRetries = useCallback(() => {
    androidScrollRetryTimeoutsRef.current.forEach(clearTimeout);
    androidScrollRetryTimeoutsRef.current = [];
  }, []);

  const clearIosScrollRetries = useCallback(() => {
    iosScrollRetryTimeoutsRef.current.forEach(clearTimeout);
    iosScrollRetryTimeoutsRef.current = [];
  }, []);

  const blurMemoInput = useCallback(() => {
    isMemoFocusedRef.current = false;
    setIsMemoSystemKeyboardOpen(false);
    pendingAndroidMemoScrollRef.current = false;
    clearAndroidScrollRetries();
    clearIosScrollRetries();
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(16);
  }, [clearAndroidScrollRetries, clearIosScrollRetries]);

  const scrollAndroidMemoToKeyboard = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      if (
        Platform.OS !== 'android' ||
        !isMemoFocusedRef.current ||
        memoSectionYRef.current <= 0 ||
        memoSectionHeightRef.current <= 0 ||
        endCoordinates.height <= 0
      ) {
        return false;
      }

      const metrics = Keyboard.metrics();
      const nativeHeight = metrics?.height ?? 0;
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
      pendingAndroidMemoScrollRef.current = false;
      return true;
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

  const scrollIosMemoIntoView = useCallback(() => {
    if (Platform.OS !== 'ios' || memoSectionYRef.current <= 0) {
      return;
    }
    const scrollOffset = windowHeight * 0.266;
    scrollViewRef.current?.scrollTo({
      y: Math.max(0, memoSectionYRef.current - scrollOffset),
      animated: true,
    });
  }, [memoSectionYRef, scrollViewRef, windowHeight]);

  const scheduleAndroidMemoScrollRetries = useCallback(
    (endCoordinates?: KeyboardEvent['endCoordinates']) => {
      if (Platform.OS !== 'android') {
        return;
      }
      clearAndroidScrollRetries();
      ANDROID_MEMO_SCROLL_RETRY_MS.forEach((delayMs) => {
        const timeoutId = setTimeout(() => {
          const metrics = Keyboard.metrics();
          const coords =
            endCoordinates ??
            (metrics && metrics.height > 0
              ? keyboardMetricsToEndCoordinates(metrics)
              : null);
          if (coords && coords.height > 0) {
            scrollAndroidMemoToKeyboard(coords);
          }
        }, delayMs);
        androidScrollRetryTimeoutsRef.current.push(timeoutId);
      });
    },
    [clearAndroidScrollRetries, scrollAndroidMemoToKeyboard],
  );

  const scheduleIosMemoScrollRetries = useCallback(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    clearIosScrollRetries();
    IOS_MEMO_SCROLL_RETRY_MS.forEach((delayMs) => {
      const timeoutId = setTimeout(() => {
        if (isMemoFocusedRef.current) {
          scrollIosMemoIntoView();
        }
      }, delayMs);
      iosScrollRetryTimeoutsRef.current.push(timeoutId);
    });
  }, [clearIosScrollRetries, scrollIosMemoIntoView]);

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

      if (Platform.OS !== 'android' || endCoordinates.height <= 0) {
        return;
      }

      if (!isMemoFocusedRef.current) {
        return;
      }

      scrollAndroidMemoToKeyboard(endCoordinates);
    },
    [safeAreaBottom, scrollAndroidMemoToKeyboard],
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
      if (Platform.OS === 'ios' && isMemoFocusedRef.current) {
        scheduleIosMemoScrollRetries();
      }
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
        pendingAndroidMemoScrollRef.current = false;
      }
    });

    return () => {
      showSub.remove();
      frameSub?.remove();
      hideSub.remove();
      clearAndroidScrollRetries();
      clearIosScrollRetries();
    };
  }, [
    applyKeyboardGeometry,
    blurMemoInput,
    clearAndroidScrollRetries,
    clearIosScrollRetries,
    scheduleAndroidKeyboardGeometrySync,
    scheduleIosMemoScrollRetries,
  ]);

  /** Android: focus 전 onPressIn에서 pending 설정. iOS: 첫 탭 레이스 완화 */
  const prepareMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;
    if (Platform.OS === 'android') {
      pendingAndroidMemoScrollRef.current = true;
    }
  }, []);

  const handleMemoFocus = useCallback(() => {
    isMemoFocusedRef.current = true;

    if (Platform.OS === 'android') {
      pendingAndroidMemoScrollRef.current = true;
      const metrics = Keyboard.metrics();
      if (metrics && metrics.height > 0) {
        const coords = keyboardMetricsToEndCoordinates(metrics);
        applyKeyboardGeometry(coords);
        scheduleAndroidMemoScrollRetries(coords);
      } else {
        scheduleAndroidMemoScrollRetries();
      }
      return;
    }

    scheduleIosMemoScrollRetries();
  }, [
    applyKeyboardGeometry,
    scheduleAndroidMemoScrollRetries,
    scheduleIosMemoScrollRetries,
  ]);

  const handleMemoBlur = useCallback(() => {
    isMemoFocusedRef.current = false;
    pendingAndroidMemoScrollRef.current = false;
    clearAndroidScrollRetries();
    clearIosScrollRetries();
    setIsMemoSystemKeyboardOpen(false);
  }, [clearAndroidScrollRetries, clearIosScrollRetries]);

  return {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    prepareMemoFocus,
    handleMemoFocus,
    handleMemoBlur,
  };
}
