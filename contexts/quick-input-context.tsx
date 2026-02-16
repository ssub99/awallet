/**
 * Quick Input Context
 *
 * 간편입력 오버레이를 탭바 바깥(전체 화면) 레벨에서 렌더링하여
 * 키보드와 동일한 좌표계를 사용하도록 함.
 *
 * react-native-keyboard-controller의 useKeyboardHandler onStart에서
 * duration + height를 받아, withTiming으로 키보드와 동일한 시간에 맞춰
 * 애니메이션하여 겹침/엇박자 감소.
 */

import { QuickInputField } from '@/components/ui/quick-input-field';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import type { TextInput } from 'react-native';
import { Keyboard, Pressable, Animated as RNAnimated, StyleSheet, View } from 'react-native';
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

type AnimatedValue = RNAnimated.Value;

const FAB_OFFSET_ABOVE_TABS = 16;

interface QuickInputContextValue {
  isQuickInputVisible: boolean;
  showQuickInput: (starScale: AnimatedValue, starRotate: AnimatedValue, shortBottomFromScreen?: number) => void;
  hideQuickInput: () => void;
  quickInputText: string;
  setQuickInputText: (text: string) => void;
}

const QuickInputContext = createContext<QuickInputContextValue | undefined>(undefined);

const KEYBOARD_GAP = 16;

export const QuickInputProvider = ({ children }: PropsWithChildren) => {
  const [isQuickInputVisible, setIsQuickInputVisible] = useState(false);
  const [quickInputText, setQuickInputText] = useState('');
  const starRefs = useRef<{ starScale: AnimatedValue; starRotate: AnimatedValue } | null>(null);
  const shortBottomFromScreen = useSharedValue(KEYBOARD_GAP);
  const lastShortBottomRef = useRef<number>(KEYBOARD_GAP);

  const quickInputRef = useRef<TextInput>(null);
  const quickInputBackdropOpacity = useRef(new RNAnimated.Value(0)).current;

  // 키보드와 동일한 duration으로 애니메이션하여 겹침/엇박자 감소
  const animatedBottom = useSharedValue(KEYBOARD_GAP);
  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        const target = e.height + KEYBOARD_GAP;
        if (e.height > 0) {
          const rawDuration = e.duration > 0 && e.duration <= 1000 ? e.duration : 250;
          const duration = rawDuration * 0.89;
          animatedBottom.value = withTiming(target, {
            duration,
            // 쿼티 키패드의 자연스러운 ease-out 커브에 가까운 감쇠
            easing: Easing.out(Easing.cubic),
          });
        } else {
          animatedBottom.value = shortBottomFromScreen.value;
        }
      },
      onEnd: (e) => {
        'worklet';
        animatedBottom.value = e.height + KEYBOARD_GAP;
      },
    },
    []
  );

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    bottom: animatedBottom.value,
  }));

  const showQuickInput = useCallback((starScale: AnimatedValue, starRotate: AnimatedValue, shortBottom?: number) => {
    starRefs.current = { starScale, starRotate };
    const bottom = shortBottom ?? KEYBOARD_GAP;
    lastShortBottomRef.current = bottom;
    shortBottomFromScreen.value = bottom;
    animatedBottom.value = bottom;
    setIsQuickInputVisible(true);
  }, []);

  const hideQuickInput = useCallback(() => {
    Keyboard.dismiss();
    setIsQuickInputVisible(false);
    setQuickInputText('');
    starRefs.current = null;
  }, []);

  // 백드롭 딤 애니메이션
  useEffect(() => {
    if (isQuickInputVisible) {
      RNAnimated.timing(quickInputBackdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      RNAnimated.timing(quickInputBackdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [isQuickInputVisible, quickInputBackdropOpacity]);

  useEffect(() => {
    if (isQuickInputVisible) {
      const timer = setTimeout(() => {
        quickInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isQuickInputVisible]);

  // measureInWindow 타이밍/키보드 핸들러 레이스 대비: 오버레이 마운트 후 초기 위치 강화
  useEffect(() => {
    if (!isQuickInputVisible) return;
    const id = requestAnimationFrame(() => {
      const bottom = lastShortBottomRef.current;
      shortBottomFromScreen.value = bottom;
      animatedBottom.value = bottom;
    });
    return () => cancelAnimationFrame(id);
  }, [isQuickInputVisible]);

  const value = useMemo<QuickInputContextValue>(
    () => ({
      isQuickInputVisible,
      showQuickInput,
      hideQuickInput,
      quickInputText,
      setQuickInputText,
    }),
    [isQuickInputVisible, showQuickInput, hideQuickInput, quickInputText]
  );

  const starScale = starRefs.current?.starScale;
  const starRotate = starRefs.current?.starRotate;

  return (
    <QuickInputContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {isQuickInputVisible && starScale != null && starRotate != null && (
          <View style={styles.overlay} pointerEvents="box-none">
            <RNAnimated.View
              pointerEvents="auto"
              style={[styles.backdrop, { opacity: quickInputBackdropOpacity }]}
            >
              <Pressable style={StyleSheet.absoluteFill} onPress={hideQuickInput} />
            </RNAnimated.View>
            <Animated.View style={[styles.container, containerAnimatedStyle]}>
              <QuickInputField
                ref={quickInputRef}
                value={quickInputText}
                onChangeText={setQuickInputText}
                placeholder="메세지 입력"
                starScale={starScale}
                starRotate={starRotate}
                onSend={() => {
                  // TODO: 전송 로직 구현
                  hideQuickInput();
                }}
                onCancel={() => {
                  // 취소 버튼: 컴포넌트를 닫지 않고 입력값만 초기화
                  setQuickInputText('');
                }}
              />
            </Animated.View>
          </View>
        )}
      </View>
    </QuickInputContext.Provider>
  );
};

export const useQuickInputContext = (): QuickInputContextValue => {
  const context = useContext(QuickInputContext);
  if (!context) {
    throw new Error('useQuickInputContext must be used within QuickInputProvider');
  }
  return context;
};

export { FAB_OFFSET_ABOVE_TABS };

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 101,
  },
});
