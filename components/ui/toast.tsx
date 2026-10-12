/**
 * Toast Component
 * 
 * A simple toast notification component for displaying temporary messages.
 */

import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, type ColorPalette } from '@/constants/theme';
import { typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';

/** Figma toast 컴포넌트 레이어 opacity */
const TOAST_OPACITY = 0.8;

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
  /**
   * 우측 액션 버튼 라벨 (예: '바로가기'). 없으면 버튼 숨김
   */
  actionLabel?: string;
  /**
   * 액션 버튼 탭 콜백. 탭 후 토스트는 닫힘
   */
  onActionPress?: () => void;
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
  actionLabel,
  onActionPress,
}: ToastProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [isHidden, setIsHidden] = useState(!visible);
  if (visible && isHidden) {
    setIsHidden(false);
  }
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const hasAction = Boolean(actionLabel);
  const DURATION = 2000; // 2초 고정

  useEffect(() => {
    if (visible) {
      // Fade in
      Animated.timing(opacity, {
        toValue: TOAST_OPACITY,
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
      }).start(({ finished }) => {
        if (finished) {
          setIsHidden(true);
        }
      });
    }
  }, [visible, onHide, opacity]);

  if (isHidden) {
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
      pointerEvents={hasAction ? 'auto' : 'none'}
    >
      <Text style={[styles.text, { color: palette.staticWhite }]}>{message}</Text>
      {hasAction ? (
        <Pressable
          onPress={() => {
            onActionPress?.();
            onHide?.();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionText, { color: palette.primary }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    // top은 동적으로 계산됨 (SafeArea top + 16px)
    left: 16,
    right: 16,
    backgroundColor: atomicColors.neutral[900],
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    flexShrink: 1,
    ...typography.body01.regular,
  },
  actionText: {
    ...typography.body01.bold,
  },
});

