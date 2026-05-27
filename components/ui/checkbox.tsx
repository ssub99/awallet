/**
 * Checkbox Component
 * 
 * A checkbox component matching Figma design system.
 * Supports checked/unchecked states with optional label.
 */

import { Icon } from '@/components/ui/icon';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { singleRowCenteredTextStyle } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface CheckboxProps {
  /**
   * Checkbox checked state
   */
  checked: boolean;
  
  /**
   * Change handler
   */
  onPress?: () => void;
  
  /**
   * Label text (optional)
   */
  label?: string;
  
  /**
   * Whether this field is required (renders a red asterisk)
   */
  required?: boolean;
  
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
 * Checkbox Component
 */
export function Checkbox({
  checked,
  onPress,
  label,
  required = false,
  disabled = false,
  style,
}: CheckboxProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  // colors based on state
  const boxBorderColor = disabled
    ? palette.border
    : checked
    ? palette.primary
    : palette.border;

  const boxBackgroundColor = disabled
    ? palette.fillDisabled
    : checked
    ? palette.backgroundAlt // Light blue #ecf0f8
    : palette.staticWhite;

  const checkColor = disabled ? palette.textDisabled : palette.primary;
  const labelColor = disabled ? palette.textDisabled : palette.text;

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, style]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      {/* Checkbox Box */}
      <View
        style={[
          styles.checkboxBox,
          {
            backgroundColor: boxBackgroundColor,
            borderColor: boxBorderColor,
          },
        ]}
      >
        {/* Check Icon (visible when checked) */}
        {checked && (
          <Icon
            name="checkboxIcon"
            size={16}
            color={checkColor}
          />
        )}
      </View>

      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: labelColor }]}
          accessibilityLabel={label}
        >
          {label}
          {required ? (
            <Text style={[styles.requiredMark, { color: palette.statusNegative }]}> *</Text>
          ) : null}
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
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...singleRowCenteredTextStyle(typography.body2.r.medium),
    marginLeft: 8,
  },
  requiredMark: {
    ...singleRowCenteredTextStyle(typography.body2.r.medium),
  },
});

