import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, type TextInput } from 'react-native';

/**
 * Android(resize): 텍스트 입력 포커스 시 하단 CTA를 키보드 애니 전에 숨김.
 * 키보드 open 상태와 hide 플래그를 연동하지 않아 frame flicker로 CTA가 튀는 것을 방지.
 */
export function useAndroidKeyboardBottomCtaHide() {
  const inputRef = useRef<TextInput>(null);
  const isInputFocusedRef = useRef(false);
  const androidKeyboardVisibleRef = useRef(false);
  const [hideBottomCta, setHideBottomCta] = useState(false);

  const blurInput = useCallback(() => {
    isInputFocusedRef.current = false;
    androidKeyboardVisibleRef.current = false;
    inputRef.current?.blur();
    Keyboard.dismiss();
    setHideBottomCta(false);
  }, []);

  const onInputPressIn = useCallback(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    setHideBottomCta(true);
  }, []);

  const onInputFocus = useCallback(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    isInputFocusedRef.current = true;
    setHideBottomCta(true);
  }, []);

  const onInputBlur = useCallback(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    isInputFocusedRef.current = false;
    androidKeyboardVisibleRef.current = false;
    setHideBottomCta(false);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      androidKeyboardVisibleRef.current = true;
    });

    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (isInputFocusedRef.current && androidKeyboardVisibleRef.current) {
        blurInput();
        return;
      }
      androidKeyboardVisibleRef.current = false;
      if (!isInputFocusedRef.current) {
        setHideBottomCta(false);
      }
    });

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isInputFocusedRef.current && !androidKeyboardVisibleRef.current) {
        return false;
      }
      blurInput();
      return true;
    });

    return () => {
      showSub.remove();
      hideSub.remove();
      backSub.remove();
    };
  }, [blurInput]);

  return {
    inputRef,
    blurInput,
    hideBottomCta: Platform.OS === 'android' && hideBottomCta,
    onInputPressIn,
    onInputFocus,
    onInputBlur,
  };
}
