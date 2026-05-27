/**
 * Chip Component
 * 
 * A chip component for labels, categories, and filters.
 * Supports active/default/disabled states with proper styling based on Figma design.
 * 
 * Types:
 * - topic: Used for topic selection (default, borderRadius: 24)
 * - option: Used for option selection (borderRadius: 12)
 */

import { colors, type ColorPalette } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

export type ChipType = 'topic' | 'option';

export interface ChipProps {
  /**
   * Chip label text
   */
  label: string;
  
  /**
   * Chip type: 'topic' (default) or 'option'
   * - topic: borderRadius 24, active state has primary background
   * - option: borderRadius 12, active state has primary border and text
   */
  type?: ChipType;
  
  /**
   * Active state (selected)
   */
  active?: boolean;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Press handler
   */
  onPress?: () => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Chip Component
 */
export function Chip({
  label,
  type = 'topic',
  active = false,
  disabled = false,
  onPress,
  style,
}: ChipProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const handlePress = () => {
    if (disabled || !onPress) {
      return;
    }
    onPress();
  };

  // Border radius based on type
  const borderRadius = type === 'option' ? 12 : 24;

  // colors based on type and state (matching Figma design)
  const backgroundColor = disabled
    ? 'rgba(144, 146, 158, 0.12)' // Fill/Disabled (same for both types)
    : type === 'option' && active
    ? palette.staticWhite // Option active: white background
    : type === 'topic' && active
    ? '#3664ce' // Topic active: primary background
    : palette.staticWhite; // Default: white background
  
  const textColor = disabled
    ? '#9e9e9e' // Label/Assistive (same for both types)
    : type === 'option' && active
    ? '#3664ce' // Option active: primary text
    : type === 'topic' && active
    ? palette.staticWhite // Topic active: white text
    : '#616161'; // Label/Alternative (default)
  
  const borderColor = disabled
    ? 'rgba(144, 146, 158, 0.16)' // Line/Normal (same for both types)
    : active
    ? '#3664ce' // Primary (active state for both types)
    : 'rgba(144, 146, 158, 0.16)'; // Line/Normal (default)

  // Font weight based on type and state
  const fontWeight = disabled
    ? '500' // Disabled: medium
    : type === 'topic' && active
    ? '700' // Topic active: bold
    : '500'; // Default: medium

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
          borderRadius,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          disabled
            ? styles.textDisabled
            : active && type === 'topic'
            ? styles.textActive
            : styles.textDefault,
          { 
            color: textColor,
            fontWeight,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 37, // Figma design height
    // borderRadius is set dynamically based on type
    // height can be overridden via style prop
  },
  textActive: {
    ...typographyLayout.chipTextActive,
    textAlign: 'center',
  },
  textDefault: {
    ...typographyLayout.chipTextDefault,
    textAlign: 'center',
  },
  textDisabled: {
    ...typographyLayout.chipTextDefault,
    textAlign: 'center',
  },
});

