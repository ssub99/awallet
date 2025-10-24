/**
 * Switch Component
 * 
 * A toggle switch component matching Figma design system.
 * Features smooth spring animation when toggling.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, ViewStyle } from 'react-native';

export interface SwitchProps {
  /**
   * Switch on/off state
   */
  value: boolean;
  
  /**
   * Change handler
   */
  onValueChange?: (value: boolean) => void;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Switch Component with smooth animation
 */
export function Switch({
  value,
  onValueChange,
  disabled = false,
  style,
}: SwitchProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  // Animation value for toggle position
  const togglePosition = useRef(new Animated.Value(value ? 24 : 0)).current;

  // Animate toggle when value changes
  useEffect(() => {
    Animated.spring(togglePosition, {
      toValue: value ? 24 : 0, // Off: 0px (padding handles 4px), On: 24px (56 - 24 - 8 padding)
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  }, [value, togglePosition]);

  const handlePress = () => {
    console.log('🔍 [Switch Component] handlePress 호출됨:', { 
      disabled, 
      value, 
      hasOnValueChange: !!onValueChange 
    });
    
    if (onValueChange) {
      console.log('🔍 [Switch Component] onValueChange 호출 중...');
      onValueChange(!value);
    } else {
      console.log('🔍 [Switch Component] onValueChange가 없음');
    }
  };

  // Colors based on state
  const trackColor = disabled
    ? '#e0e0e0' // Disabled: gray from Figma (both on/off same color)
    : value
    ? '#07b63b' // Green when on (from Figma)
    : 'rgba(144, 146, 158, 0.1)'; // Gray when off (opacity 0.1 from Figma)

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.container,
        { backgroundColor: trackColor },
        style,
      ]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      {/* Animated Toggle Circle */}
      <Animated.View
        style={[
          styles.toggle,
          {
            backgroundColor: colors.staticWhite,
            transform: [{ translateX: togglePosition }],
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 56,
    height: 32,
    borderRadius: 20,
    padding: 4,
    justifyContent: 'center',
  },
  toggle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    // Drop shadow
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: {
        elevation: 3,
      },
    }),
  },
});

