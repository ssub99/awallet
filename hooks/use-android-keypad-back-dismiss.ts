import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

type AndroidKeypadBackDismissOptions = {
  /** 시스템 키보드(메모)가 열려 있을 때 */
  isMemoSystemKeyboardOpen?: boolean;
  /** 메모 포커스·키보드 해제 */
  onDismissMemoInput?: () => void;
};

/**
 * Android 하드웨어 뒤로가기:
 * - 커스텀 키패드 열림 → 닫기 (메모 키보드도 열려 있으면 함께 해제)
 * - 메모 시스템 키보드만 열림 → 키보드 닫기 + 메모 blur
 */
export function useAndroidKeypadBackDismiss(
  isKeypadVisible: boolean,
  onDismissKeypad: () => void,
  options?: AndroidKeypadBackDismissOptions,
): void {
  const isMemoSystemKeyboardOpen = options?.isMemoSystemKeyboardOpen ?? false;
  const onDismissMemoInput = options?.onDismissMemoInput;

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const onBackPress = () => {
      if (isKeypadVisible) {
        onDismissKeypad();
        if (isMemoSystemKeyboardOpen && onDismissMemoInput) {
          onDismissMemoInput();
        }
        return true;
      }
      if (isMemoSystemKeyboardOpen && onDismissMemoInput) {
        onDismissMemoInput();
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [isKeypadVisible, isMemoSystemKeyboardOpen, onDismissKeypad, onDismissMemoInput]);
}
