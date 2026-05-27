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

import { colors, type ColorPalette } from '@/constants/theme';
import { singleRowCenteredTextStyle, typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ActivityIndicator, Platform, Pressable, PressableProps, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';

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
   * Loading state
   * 
   * - Shows a progress indicator inside the button
   * - Disables interaction while loading
   */
  loading?: boolean;
  
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
  loading = false,
  children,
  onPress,
  ...pressableProps
}: ButtonProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];

  // 시각적 비활성 상태는 disabled prop만 따르고,
  // 로딩 중에는 스타일은 유지하되 클릭만 막는다.
  const isVisuallyDisabled = disabled;
  const isPressDisabled = disabled || loading;

  const handlePress = () => {
    if (!isPressDisabled) {
      onPress();
    }
  };

  // Get button styles based on variant, type, size, and state
  const buttonStyle = getButtonStyle(palette, variant, type, size, isVisuallyDisabled);
  const textStyle = getTextStyle(palette, variant, type, size, isVisuallyDisabled);

  return (
    <Pressable
      onPress={handlePress}
      disabled={isPressDisabled}
      style={({ pressed }) => [
        styles.base,
        buttonStyle.container,
        size === 'large' ? styles.large : styles.small,
        pressed && !isPressDisabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isPressDisabled }}
      accessibilityLabel={typeof children === 'string' ? children : undefined}
      {...pressableProps}
    >
      <View style={styles.content}>
        {loading && (
          <View style={styles.spinnerOverlay} pointerEvents="none">
            <View style={styles.spinnerSize}>
              <View style={Platform.OS === 'ios' ? styles.spinnerScale : undefined}>
                <ActivityIndicator
                  size={Platform.OS === 'android' ? 16 : 'small'}
                  // 색상이 있는 솔리드 버튼(primary/negative)에서는 스피너를 흰색으로,
                  // 회색 배경(assistive)이나 라인 타입은 플랫폼 기본 색상을 사용.
                  color={
                    type === 'solid' && (variant === 'primary' || variant === 'negative')
                      ? palette.staticWhite
                      : undefined
                  }
                />
              </View>
            </View>
          </View>
        )}
        <Text
          style={[
            textStyle,
            size === 'large' ? styles.textLarge : styles.textSmall,
            loading && styles.textHidden,
          ]}
        >
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Get button container styles based on variant, type, and state
 */
function getButtonStyle(
  colors: ColorPalette,
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
  colors: ColorPalette,
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
  content: {
    alignItems: 'center',
    justifyContent: 'center',
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
    ...singleRowCenteredTextStyle(typography.button1.l.medium),
    textAlign: 'center',
  },
  textSmall: {
    ...singleRowCenteredTextStyle(typography.button2.r.medium),
    textAlign: 'center',
  },
  spinnerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerSize: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // iOS는 size에 숫자 미지원. 'small'(≈20pt)을 16pt로 보이게 스케일
  spinnerScale: {
    transform: [{ scale: 16 / 20 }],
  },
  textHidden: {
    opacity: 0,
  },
  pressed: {
    opacity: 0.8,
  },
});

