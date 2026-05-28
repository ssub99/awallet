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

const MEMO_FOCUS_SCROLL_DELAY_MS = 500;
const IOS_FOCUS_SCROLL_RETRY_DELAY_MS = 300;
const IOS_FOCUS_SCROLL_MAX_ATTEMPTS = 1;
const IOS_FOCUS_SCROLL_MAX_ATTEMPTS_LARGE_MOVE = 2;
const IOS_FOCUS_SCROLL_LARGE_MOVE_THRESHOLD_PX = 140;
const IOS_FOCUS_SCROLL_STALL_RETRY_THRESHOLD = 2;
const IOS_FOCUS_SCROLL_STALL_GUARD_MS = 140;
const IOS_FOCUS_SCROLL_SETTLE_GRACE_MS = 260;
const IOS_FOCUS_SCROLL_FINALIZE_TOLERANCE_PX = 8;
const IOS_FOCUS_SCROLL_MAX_GRACE_RETRIES = 2;

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
  const debugLog = (_event: string, _payload?: Record<string, unknown>) => {};
  const memoInputRef = useRef<TextInput>(null);
  const scrollYRef = useRef(0);
  const isMemoFocusedRef = useRef(false);
  const suppressKeyboardHideBlurRef = useRef(false);
  const memoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingIosFocusScrollRef = useRef(false);
  const iosFocusScrollAttemptCountRef = useRef(0);
  const iosFocusScrollMovedRef = useRef(false);
  const iosPendingTargetScrollYRef = useRef<number | null>(null);
  const iosLastOverflowRef = useRef(0);
  const iosScrollInFlightRef = useRef(false);
  const iosInFlightStartedAtRef = useRef(0);
  const iosLastRetryScrollYRef = useRef(0);
  const iosNoProgressRetryCountRef = useRef(0);
  const iosFinalizeGraceCountRef = useRef(0);
  const latestKeyboardEndRef = useRef<KeyboardEvent['endCoordinates'] | null>(null);
  const pendingAndroidScrollRef = useRef(false);
  const memoPointerActiveRef = useRef(false);
  const pendingKeyboardEndRef = useRef<KeyboardEvent['endCoordinates'] | null>(null);
  const pendingIosScrollAfterPaddingRef = useRef(false);

  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(MEMO_KEYBOARD_GAP);
  const [isMemoSystemKeyboardOpen, setIsMemoSystemKeyboardOpen] = useState(false);

  const clearMemoScrollTimeout = useCallback(() => {
    if (memoScrollTimeoutRef.current) {
      debugLog('clearMemoScrollTimeout');
      clearTimeout(memoScrollTimeoutRef.current);
      memoScrollTimeoutRef.current = null;
    }
  }, []);

  const blurMemoInput = useCallback(() => {
    debugLog('blurMemoInput', {
      isMemoFocusedRef: isMemoFocusedRef.current,
      suppressKeyboardHideBlur: suppressKeyboardHideBlurRef.current,
    });
    isMemoFocusedRef.current = false;
    suppressKeyboardHideBlurRef.current = false;
    clearMemoScrollTimeout();
    memoInputRef.current?.blur();
    Keyboard.dismiss();
    setKeyboardPaddingBottom(MEMO_KEYBOARD_GAP);
    setIsMemoSystemKeyboardOpen(false);
  }, [clearMemoScrollTimeout]);

  const scrollMemoAboveKeyboard = useCallback(
    (
      endCoordinates: KeyboardEvent['endCoordinates'],
      onScrollAttemptResult?: (result: {
        moved: boolean;
        overflow: number;
        scrollYBefore: number;
        targetY: number;
      }) => void,
    ) => {
      scrollScrollViewSectionAboveKeyboard({
        scrollViewRef,
        sectionYRef: memoSectionYRef,
        sectionHeightRef: memoSectionHeightRef,
        scrollYRef,
        keyboardEnd: endCoordinates,
        inputRef: memoInputRef,
        windowHeight,
        onScrollAttemptResult,
      });
    },
    [memoSectionHeightRef, memoSectionYRef, scrollViewRef, windowHeight],
  );

  const tryResolveIosFocusScroll = useCallback(
    (source: 'onFocus' | 'keyboardShow' | 'paddingRetry') => {
      if (Platform.OS !== 'ios') return false;
      if (!pendingIosFocusScrollRef.current) {
        debugLog('tryResolveIosFocusScroll:skip(no pending)', { source });
        return false;
      }
      if (
        source !== 'paddingRetry' &&
        iosScrollInFlightRef.current &&
        iosPendingTargetScrollYRef.current != null
      ) {
        debugLog('tryResolveIosFocusScroll:skip(inFlight)', {
          source,
          targetY: iosPendingTargetScrollYRef.current,
          scrollYNow: scrollYRef.current,
        });
        return false;
      }
      if (!isMemoFocusedRef.current) {
        debugLog('tryResolveIosFocusScroll:skip(not focused)', { source });
        return false;
      }
      if (memoSectionYRef.current <= 0 || memoSectionHeightRef.current <= 0) {
        debugLog('tryResolveIosFocusScroll:skip(layout not ready)', {
          source,
          memoSectionY: memoSectionYRef.current,
          memoSectionHeight: memoSectionHeightRef.current,
        });
        return false;
      }
      const end = latestKeyboardEndRef.current;
      if (!end || end.height <= 0) {
        debugLog('tryResolveIosFocusScroll:skip(keyboard not ready)', {
          source,
          keyboardHeight: end?.height ?? 0,
        });
        return false;
      }

      iosFocusScrollAttemptCountRef.current += 1;
      const attempt = iosFocusScrollAttemptCountRef.current;
      debugLog('tryResolveIosFocusScroll:run', {
        source,
        attempt,
        keyboardHeight: end.height,
        keyboardScreenY: end.screenY,
        memoSectionY: memoSectionYRef.current,
        scrollYBefore: scrollYRef.current,
      });
      scrollMemoAboveKeyboard(end, (result) => {
        const { moved, overflow, targetY } = result;
        debugLog('tryResolveIosFocusScroll:result', {
          source,
          attempt,
          moved,
          overflow,
          targetY,
          scrollYNow: scrollYRef.current,
        });
        if (!pendingIosFocusScrollRef.current) {
          return;
        }
        if (moved) {
          iosLastOverflowRef.current = overflow;
          iosPendingTargetScrollYRef.current = targetY;
          iosScrollInFlightRef.current = true;
          iosInFlightStartedAtRef.current = Date.now();
          iosLastRetryScrollYRef.current = scrollYRef.current;
          iosNoProgressRetryCountRef.current = 0;
          debugLog('tryResolveIosFocusScroll:awaitScrollEvent', {
            attempt,
            targetY,
            scrollYNow: scrollYRef.current,
          });
        }
      });
      return true;
    },
    [memoSectionHeightRef, memoSectionYRef, scrollMemoAboveKeyboard],
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
      debugLog('commitKeyboardGeometry', {
        keyboardHeight: endCoordinates.height,
        keyboardScreenY: endCoordinates.screenY,
        nativeHeight,
        paddingBottom,
        isMemoFocusedRef: isMemoFocusedRef.current,
      });

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
        debugLog('applyKeyboardGeometry:deferByPointer', {
          keyboardHeight: endCoordinates.height,
        });
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
      debugLog(`keyboard:${showEvent}`, {
        keyboardHeight: event.endCoordinates.height,
        keyboardScreenY: event.endCoordinates.screenY,
        isMemoFocusedRef: isMemoFocusedRef.current,
        suppressKeyboardHideBlur: suppressKeyboardHideBlurRef.current,
      });
      applyKeyboardGeometry(event.endCoordinates);
      void tryResolveIosFocusScroll('keyboardShow');
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      debugLog(`keyboard:${hideEvent}`, {
        keyboardHeight: event.endCoordinates.height,
        isMemoFocusedRef: isMemoFocusedRef.current,
        suppressKeyboardHideBlur: suppressKeyboardHideBlurRef.current,
      });
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
  }, [applyKeyboardGeometry, blurMemoInput, tryResolveIosFocusScroll]);

  useEffect(() => () => clearMemoScrollTimeout(), [clearMemoScrollTimeout]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || !pendingAndroidScrollRef.current) {
      return;
    }
    if (!isMemoFocusedRef.current || !latestKeyboardEndRef.current?.height) {
      debugLog('ios/android layoutEffect skip', {
        pendingAndroidScroll: pendingAndroidScrollRef.current,
        isMemoFocusedRef: isMemoFocusedRef.current,
        latestKeyboardHeight: latestKeyboardEndRef.current?.height ?? 0,
      });
      pendingAndroidScrollRef.current = false;
      return;
    }

    pendingAndroidScrollRef.current = false;
    debugLog('layoutEffect:scrollMemoAboveKeyboard', {
      keyboardHeight: latestKeyboardEndRef.current.height,
      scrollYBefore: scrollYRef.current,
      memoSectionY: memoSectionYRef.current,
    });
    scrollMemoAboveKeyboard(latestKeyboardEndRef.current);
  }, [keyboardPaddingBottom, scrollMemoAboveKeyboard]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'ios' || !pendingIosScrollAfterPaddingRef.current) {
      return;
    }
    if (!pendingIosFocusScrollRef.current || !isMemoFocusedRef.current) {
      pendingIosScrollAfterPaddingRef.current = false;
      return;
    }
    pendingIosScrollAfterPaddingRef.current = false;
    debugLog('ios layoutEffect:retryAfterPadding', {
      keyboardPaddingBottom,
      scrollYBefore: scrollYRef.current,
      memoSectionY: memoSectionYRef.current,
    });
    void tryResolveIosFocusScroll('paddingRetry');
  }, [keyboardPaddingBottom, memoSectionYRef, tryResolveIosFocusScroll]);

  const handleMemoFocus = useCallback(() => {
    debugLog('handleMemoFocus:start', {
      memoSectionY: memoSectionYRef.current,
      memoSectionHeight: memoSectionHeightRef.current,
      scrollY: scrollYRef.current,
      hasPendingKeyboardEnd: pendingKeyboardEndRef.current != null,
    });
    isMemoFocusedRef.current = true;
    suppressKeyboardHideBlurRef.current = true;
    pendingIosFocusScrollRef.current = true;
    pendingIosScrollAfterPaddingRef.current = true;
    iosFocusScrollMovedRef.current = false;
    iosFocusScrollAttemptCountRef.current = 0;
    iosPendingTargetScrollYRef.current = null;
    iosLastOverflowRef.current = 0;
    iosScrollInFlightRef.current = false;
    iosInFlightStartedAtRef.current = 0;
    iosLastRetryScrollYRef.current = scrollYRef.current;
    iosNoProgressRetryCountRef.current = 0;
    iosFinalizeGraceCountRef.current = 0;
    clearMemoScrollTimeout();
    setIsMemoSystemKeyboardOpen(true);
    if (Platform.OS === 'ios') {
      requestAnimationFrame(() => {
        if (!pendingIosFocusScrollRef.current || !isMemoFocusedRef.current) {
          return;
        }
        void tryResolveIosFocusScroll('onFocus');
      });
    } else {
      void tryResolveIosFocusScroll('onFocus');
    }
    if (Platform.OS === 'ios') {
      const scheduleIosRetry = (delayMs: number) => {
        memoScrollTimeoutRef.current = setTimeout(() => {
          memoScrollTimeoutRef.current = null;
          if (!pendingIosFocusScrollRef.current || !isMemoFocusedRef.current) {
            return;
          }
          debugLog('handleMemoFocus:iosTimeoutRetry', {
            memoSectionY: memoSectionYRef.current,
            memoSectionHeight: memoSectionHeightRef.current,
            scrollYBefore: scrollYRef.current,
            windowHeight,
            attemptCount: iosFocusScrollAttemptCountRef.current,
            moved: iosFocusScrollMovedRef.current,
          });
          const currentY = scrollYRef.current;
          const maxAttemptsForCurrentMove =
            iosLastOverflowRef.current >= IOS_FOCUS_SCROLL_LARGE_MOVE_THRESHOLD_PX
              ? IOS_FOCUS_SCROLL_MAX_ATTEMPTS_LARGE_MOVE
              : IOS_FOCUS_SCROLL_MAX_ATTEMPTS;
          const inFlightGuardActive =
            iosScrollInFlightRef.current &&
            Date.now() - iosInFlightStartedAtRef.current < IOS_FOCUS_SCROLL_STALL_GUARD_MS;
          const progressed = currentY > iosLastRetryScrollYRef.current + 0.5;
          if (progressed) {
            iosLastRetryScrollYRef.current = currentY;
            iosNoProgressRetryCountRef.current = 0;
          } else if (!inFlightGuardActive) {
            iosNoProgressRetryCountRef.current += 1;
          }
          if (inFlightGuardActive) {
            debugLog('handleMemoFocus:iosRetry(guard window)', {
              guardMs: IOS_FOCUS_SCROLL_STALL_GUARD_MS,
              elapsedMs: Date.now() - iosInFlightStartedAtRef.current,
              targetY: iosPendingTargetScrollYRef.current,
              scrollYNow: currentY,
            });
            scheduleIosRetry(IOS_FOCUS_SCROLL_RETRY_DELAY_MS);
            return;
          }
          if (
            iosScrollInFlightRef.current &&
            iosNoProgressRetryCountRef.current < IOS_FOCUS_SCROLL_STALL_RETRY_THRESHOLD
          ) {
            if (
              pendingIosFocusScrollRef.current &&
              iosFocusScrollAttemptCountRef.current < maxAttemptsForCurrentMove
            ) {
              scheduleIosRetry(IOS_FOCUS_SCROLL_RETRY_DELAY_MS);
              return;
            }
          }
          if (
            iosScrollInFlightRef.current &&
            iosNoProgressRetryCountRef.current >= IOS_FOCUS_SCROLL_STALL_RETRY_THRESHOLD
          ) {
            debugLog('handleMemoFocus:iosRetry(stall detected)', {
              noProgressRetryCount: iosNoProgressRetryCountRef.current,
              targetY: iosPendingTargetScrollYRef.current,
              scrollYNow: currentY,
            });
            iosScrollInFlightRef.current = false;
            iosInFlightStartedAtRef.current = 0;
          }
          const canRunAnotherResolve =
            iosFocusScrollAttemptCountRef.current < maxAttemptsForCurrentMove;
          if (canRunAnotherResolve) {
            void tryResolveIosFocusScroll('onFocus');
          }
          if (
            pendingIosFocusScrollRef.current &&
            iosFocusScrollAttemptCountRef.current < maxAttemptsForCurrentMove
          ) {
            scheduleIosRetry(IOS_FOCUS_SCROLL_RETRY_DELAY_MS);
            return;
          }
          if (
            pendingIosFocusScrollRef.current &&
            iosPendingTargetScrollYRef.current != null &&
            iosFinalizeGraceCountRef.current < IOS_FOCUS_SCROLL_MAX_GRACE_RETRIES &&
            (iosScrollInFlightRef.current || !iosFocusScrollMovedRef.current)
          ) {
            iosFinalizeGraceCountRef.current += 1;
            debugLog('handleMemoFocus:iosSettleGrace', {
              targetY: iosPendingTargetScrollYRef.current,
              scrollYNow: scrollYRef.current,
              graceCount: iosFinalizeGraceCountRef.current,
              inFlight: iosScrollInFlightRef.current,
              moved: iosFocusScrollMovedRef.current,
            });
            scheduleIosRetry(IOS_FOCUS_SCROLL_SETTLE_GRACE_MS);
            return;
          }
          if (
            pendingIosFocusScrollRef.current &&
            iosScrollInFlightRef.current &&
            iosFinalizeGraceCountRef.current <= IOS_FOCUS_SCROLL_MAX_GRACE_RETRIES
          ) {
            iosFinalizeGraceCountRef.current += 1;
            debugLog('handleMemoFocus:iosSettleGrace(finalize guard)', {
              targetY: iosPendingTargetScrollYRef.current,
              scrollYNow: scrollYRef.current,
              graceCount: iosFinalizeGraceCountRef.current,
              inFlight: iosScrollInFlightRef.current,
            });
            scheduleIosRetry(IOS_FOCUS_SCROLL_SETTLE_GRACE_MS);
            return;
          }
          if (
            pendingIosFocusScrollRef.current &&
            !iosFocusScrollMovedRef.current &&
            iosPendingTargetScrollYRef.current != null
          ) {
            const targetY = iosPendingTargetScrollYRef.current;
            const distance = Math.abs(scrollYRef.current - targetY);
            if (distance <= IOS_FOCUS_SCROLL_FINALIZE_TOLERANCE_PX) {
              iosFocusScrollMovedRef.current = true;
              pendingIosFocusScrollRef.current = false;
              iosScrollInFlightRef.current = false;
              iosInFlightStartedAtRef.current = 0;
              suppressKeyboardHideBlurRef.current = false;
              debugLog('handleMemoFocus:resolvedByFinalizeProximity', {
                targetY,
                scrollYNow: scrollYRef.current,
                distance,
                tolerance: IOS_FOCUS_SCROLL_FINALIZE_TOLERANCE_PX,
              });
            }
          }
          pendingIosFocusScrollRef.current = false;
          iosScrollInFlightRef.current = false;
          iosInFlightStartedAtRef.current = 0;
          suppressKeyboardHideBlurRef.current = false;
          debugLog('handleMemoFocus:iosFinalize', {
            pendingIosFocusScroll: pendingIosFocusScrollRef.current,
            suppressKeyboardHideBlur: suppressKeyboardHideBlurRef.current,
            isMemoFocusedRef: isMemoFocusedRef.current,
            attemptCount: iosFocusScrollAttemptCountRef.current,
            moved: iosFocusScrollMovedRef.current,
          });
        }, delayMs);
      };
      scheduleIosRetry(MEMO_FOCUS_SCROLL_DELAY_MS);
    }
  }, [clearMemoScrollTimeout, memoSectionYRef, memoSectionHeightRef, tryResolveIosFocusScroll, windowHeight]);

  const onMemoScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextY = event.nativeEvent.contentOffset.y;
    const prevY = scrollYRef.current;
    scrollYRef.current = nextY;
    if (
      Platform.OS === 'ios' &&
      pendingIosFocusScrollRef.current &&
      iosPendingTargetScrollYRef.current != null &&
      nextY >=
        iosPendingTargetScrollYRef.current -
          Math.max(1, Math.min(4, Math.abs(iosPendingTargetScrollYRef.current - prevY) * 0.08))
    ) {
      iosFocusScrollMovedRef.current = true;
      pendingIosFocusScrollRef.current = false;
      iosScrollInFlightRef.current = false;
      iosInFlightStartedAtRef.current = 0;
      suppressKeyboardHideBlurRef.current = false;
      debugLog('onMemoScroll:resolved(moved)', {
        nextY,
        targetY: iosPendingTargetScrollYRef.current,
      });
      iosPendingTargetScrollYRef.current = null;
      iosFinalizeGraceCountRef.current = 0;
    }
  }, []);

  const handleMemoBlur = useCallback(() => {
    debugLog('handleMemoBlur', {
      scrollY: scrollYRef.current,
      isMemoFocusedRef: isMemoFocusedRef.current,
    });
    isMemoFocusedRef.current = false;
    pendingIosFocusScrollRef.current = false;
    pendingIosScrollAfterPaddingRef.current = false;
    iosPendingTargetScrollYRef.current = null;
    iosLastOverflowRef.current = 0;
    iosScrollInFlightRef.current = false;
    iosInFlightStartedAtRef.current = 0;
    iosFinalizeGraceCountRef.current = 0;
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
