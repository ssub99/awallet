/**
 * Toast Component
 * 
 * A simple toast notification component for displaying temporary messages.
 */

import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ToastProps {
  /**
   * Message to display in the toast
   */
  message: string;
  
  /**
   * Whether the toast is visible
   */
  visible: boolean;
  
  /**
   * Callback when toast auto-hides
   */
  onHide?: () => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
  /**
   * Optional zIndex to control stacking (e.g., above embedded overlays)
   */
  zIndex?: number;
}

/**
 * Toast Component with fade in/out animation
 */
export function Toast({
  message,
  visible,
  onHide,
  style,
  zIndex = 100010,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const DURATION = 2000; // 2초 고정

  useEffect(() => {
    if (visible) {
      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // Auto hide after 2 seconds
      const timer = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          onHide?.();
        });
      }, DURATION);

      return () => clearTimeout(timer);
    } else {
      // Fade out immediately
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, onHide, opacity]);

  const shouldRender = visible || (opacity as any)._value > 0;

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { 
          opacity,
          top: insets.top + 16, // StatusBar 아래 16px
          zIndex,
        },
        style,
      ]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // top은 동적으로 계산됨 (SafeArea top + 16px)
    left: 16,
    right: 16,
    backgroundColor: '#424242', // Figma design
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'flex-start',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    color: '#ffffff', // Figma design
    fontFamily: 'Pretendard',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 24,
  },
});

