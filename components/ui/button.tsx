/**
 * Button Component
 * 
 * A versatile button component matching Figma design system.
 * Supports multiple variants, types, sizes, and states.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" type="solid" size="large" onPress={handlePress}>
 *   Submit
 * </Button>
 * ```
 */

import { Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, PressableProps, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  /**
   * Button variant - defines the color scheme
   * - primary: Main brand action (blue)
   * - negative: Destructive action (red)
   * - assistive: Secondary/helper action (gray)
   */
  variant?: 'primary' | 'negative' | 'assistive';
  
  /**
   * Button type - defines the fill style
   * - solid: Filled background
   * - line: Outlined with border
   */
  type?: 'solid' | 'line';
  
  /**
   * Button size
   * - large: 48px height, 16px text (default)
   * - small: 32px height, 14px text
   */
  size?: 'large' | 'small';
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Button text content
   */
  children: React.ReactNode;
  
  /**
   * Press handler (required)
   */
  onPress: () => void;
}

export function Button({
  variant = 'primary',
  type = 'solid',
  size = 'large',
  disabled = false,
  children,
  onPress,
  ...pressableProps
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handlePress = () => {
    if (!disabled) {
      onPress();
    }
  };

  // Get button styles based on variant, type, size, and state
  const buttonStyle = getButtonStyle(colors, variant, type, size, disabled);
  const textStyle = getTextStyle(colors, variant, type, size, disabled);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        buttonStyle.container,
        size === 'large' ? styles.large : styles.small,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      {...pressableProps}
    >
      <Text style={[textStyle, size === 'large' ? styles.textLarge : styles.textSmall]}>
        {children}
      </Text>
    </Pressable>
  );
}

/**
 * Get button container styles based on variant, type, and state
 */
function getButtonStyle(
  colors: typeof Colors.light,
  variant: ButtonProps['variant'],
  type: ButtonProps['type'],
  size: ButtonProps['size'],
  disabled: boolean
): { container: ViewStyle } {
  // Disabled state (same for all variants)
  if (disabled) {
    return {
      container: {
        backgroundColor: colors.fillDisabled,
        borderWidth: 0,
      },
    };
  }

  // Primary variant
  if (variant === 'primary') {
    if (type === 'solid') {
      return {
        container: {
          backgroundColor: colors.primary,
          borderWidth: 0,
        },
      };
    } else {
      // line type
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.primary,
        },
      };
    }
  }

  // Negative variant
  if (variant === 'negative') {
    if (type === 'solid') {
      return {
        container: {
          backgroundColor: colors.statusNegative,
          borderWidth: 0,
        },
      };
    } else {
      // line type
      return {
        container: {
          backgroundColor: colors.staticWhite,
          borderWidth: 1,
          borderColor: colors.statusNegative,
        },
      };
    }
  }

  // Assistive variant
  if (variant === 'assistive') {
    if (type === 'solid') {
      return {
        container: {
          backgroundColor: colors.fill,
          borderWidth: 0,
        },
      };
    } else {
      // line type (if needed)
      return {
        container: {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.border,
        },
      };
    }
  }

  // Fallback
  return {
    container: {
      backgroundColor: colors.primary,
      borderWidth: 0,
    },
  };
}

/**
 * Get text styles based on variant, type, and state
 */
function getTextStyle(
  colors: typeof Colors.light,
  variant: ButtonProps['variant'],
  type: ButtonProps['type'],
  size: ButtonProps['size'],
  disabled: boolean
): TextStyle {
  // Disabled text (same for all)
  if (disabled) {
    return {
      color: colors.textDisabled,
    };
  }

  // Primary variant
  if (variant === 'primary') {
    if (type === 'solid') {
      return { color: colors.staticWhite };
    } else {
      return { color: colors.primary };
    }
  }

  // Negative variant
  if (variant === 'negative') {
    if (type === 'solid') {
      return { color: colors.staticWhite };
    } else {
      return { color: colors.statusNegative };
    }
  }

  // Assistive variant
  if (variant === 'assistive') {
    return { color: colors.textNeutral };
  }

  // Fallback
  return { color: colors.staticWhite };
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  large: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 64,
  },
  small: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 24,
    minWidth: 48,
  },
  textLarge: {
    ...Typography.button1.l.medium,
    textAlign: 'center',
  },
  textSmall: {
    ...Typography.button2.r.medium,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});

