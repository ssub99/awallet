import { useEffect, type RefObject } from 'react';
import { BackHandler, Platform } from 'react-native';

type AndroidKeypadBackDismissOptions = {
  /** 시스템 키보드(메모)가 열려 있을 때 */
  isMemoSystemKeyboardOpen?: boolean;
  /** 메모 TextInput 포커스 여부(Android hide 시 state와 어긋날 수 있어 ref 사용) */
  isMemoFocusedRef?: RefObject<boolean>;
  /** 메모 포커스·키보드 해제 */
  onDismissMemoInput?: () => void;
};

function isMemoInputActive(
  isMemoSystemKeyboardOpen: boolean,
  isMemoFocusedRef?: RefObject<boolean>,
): boolean {
  return isMemoSystemKeyboardOpen || isMemoFocusedRef?.current === true;
}

/**
 * Android 하드웨어 뒤로가기:
 * - 커스텀 키패드 열림 → 닫기 (메모 포커스/키보드도 열려 있으면 함께 해제)
 * - 메모 포커스 또는 시스템 키보드 열림 → blur + 키보드 닫기
 */
export function useAndroidKeypadBackDismiss(
  isKeypadVisible: boolean,
  onDismissKeypad: () => void,
  options?: AndroidKeypadBackDismissOptions,
): void {
  const isMemoSystemKeyboardOpen = options?.isMemoSystemKeyboardOpen ?? false;
  const isMemoFocusedRef = options?.isMemoFocusedRef;
  const onDismissMemoInput = options?.onDismissMemoInput;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const onBackPress = () => {
      const memoActive = isMemoInputActive(isMemoSystemKeyboardOpen, isMemoFocusedRef);

      if (isKeypadVisible) {
        onDismissKeypad();
        if (onDismissMemoInput) {
          onDismissMemoInput();
        }
        return true;
      }

      if (memoActive && onDismissMemoInput) {
        onDismissMemoInput();
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [isKeypadVisible, isMemoSystemKeyboardOpen, isMemoFocusedRef, onDismissKeypad, onDismissMemoInput]);
}
