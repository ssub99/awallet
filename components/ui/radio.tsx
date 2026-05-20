/**
 * Radio Component
 * 
 * A radio button component matching Figma design system.
 * Supports checked/unchecked states with optional label.
 */

import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface RadioProps {
  /**
   * Radio checked state
   */
  checked: boolean;
  
  /**
   * Change handler
   */
  onPress?: () => void;
  
  /**
   * Label text (optional) or false to hide label
   */
  label?: string | false;
  
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
 * Radio Component
 */
export function Radio({
  checked,
  onPress,
  label,
  disabled = false,
  style,
}: RadioProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const handlePress = () => {
    // disabled 상태에서도 onPress를 호출하도록 변경 (토스트 표시 등을 위해)
    if (onPress) {
      onPress();
    }
  };

  // Colors based on state
  const outerBorderColor = disabled
    ? 'rgba(144, 146, 158, 0.32)' // Figma disabled border
    : checked
    ? colors.primary
    : 'rgba(144, 146, 158, 0.32)'; // Figma default border

  const outerBackgroundColor = disabled
    ? 'rgba(144, 146, 158, 0.12)' // Figma disabled background
    : checked
    ? colors.staticWhite // 흰색 배경
    : colors.staticWhite;

  const innerColor = disabled
    ? '#bdbdbd' // Figma disabled inner
    : checked
    ? colors.primary
    : '#d9d9d9'; // Figma default inner

  const labelColor = disabled ? colors.textDisabled : colors.text;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[styles.container, style]}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={typeof label === 'string' ? label : undefined}
    >
      {/* Radio Circle */}
      <View
        style={[
          styles.radioOuter,
          {
            backgroundColor: outerBackgroundColor,
            borderColor: outerBorderColor,
          },
        ]}
      >
        {/* Inner Circle (visible when checked) */}
        {checked && (
          <View
            style={[
              styles.radioInner,
              { backgroundColor: innerColor },
            ]}
          />
        )}
      </View>

      {/* Label */}
      {typeof label === 'string' && (
        <Text style={[styles.label, { color: labelColor }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    ...Typography.body2.r.medium,
    marginLeft: 8,
  },
});

