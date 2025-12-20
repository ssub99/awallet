/**
 * Input Component
 * 
 * A versatile input component matching Figma design system.
 * Supports text, number, textarea with icons and various states.
 * 
 * Structure matches Figma exactly:
 * - Container: 48px height (line) or 96px (area)
 * - Content: 24px height, perfectly centered
 * - All elements aligned on same baseline
 */

import { Icon, IconName } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRef, useState } from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TextInputProps,
    View,
    ViewStyle,
} from 'react-native';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  /**
   * Input variant
   * - line: Single line input (default)
   * - area: Multi-line textarea
   */
  variant?: 'line' | 'area';
  
  /**
   * Input type
   * - text: Regular text input (default)
   * - number: Numeric input with unit
   */
  inputType?: 'text' | 'number';
  
  /**
   * Left icon name (optional)
   */
  icon?: IconName;
  
  /**
   * Show right arrow icon
   */
  showRightArrow?: boolean;
  
  /**
   * Right text to display (for dayselect mode)
   */
  rightText?: string;
  
  /**
   * Show time display on the right (e.g., "2:53")
   */
  timeDisplay?: string;
  
  /**
   * Unit text for number input (e.g., "원")
   */
  unit?: string;
  
  /**
   * Calendar mode - shows calendar icon and date instead of input
   */
  calendar?: boolean;
  
  /**
   * Calendar date to display (e.g., "2025.09.28")
   */
  calendarDate?: string;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Container style
   */
  style?: ViewStyle;
  
  /**
   * Value
   */
  value?: string;
  
  /**
   * Change handler
   */
  onChangeText?: (text: string) => void;
  
  /**
   * Press handler (for calendar mode or custom interactions)
   */
  onPress?: () => void;
  
  /**
   * Button mode - displays as a button for selection (like category picker)
   */
  buttonMode?: boolean;
}

/**
 * Input Component
 */
export function Input({
  variant = 'line',
  inputType = 'text',
  icon,
  showRightArrow = false,
  rightText,
  timeDisplay,
  unit,
  calendar = false,
  calendarDate,
  disabled = false,
  buttonMode = false,
  style,
  value = '',
  onChangeText,
  onPress,
  placeholder,
  keyboardType: externalKeyboardType,
  ...textInputProps
}: InputProps) {
  // Default placeholder based on inputType
  const defaultPlaceholder = inputType === 'number' ? '0' : '내용 입력';
  const finalPlaceholder = placeholder ?? defaultPlaceholder;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value && value.length > 0;
  const hasCalendarDate = calendar && calendarDate;

  // Border color based on state
  const borderColor = disabled ? colors.border : isFocused ? colors.primary : colors.border;
  
  // Background color based on state
  const backgroundColor = disabled ? colors.fillDisabled : colors.staticWhite;
  
  // Text color based on state
  const textColor = disabled ? colors.textDisabled : colors.text;
  
  // Placeholder color
  const placeholderColor = disabled ? colors.textDisabled : colors.textAssistive;
  
  // Icon color based on state
  // Calendar mode: Black when date is set, otherwise assistive
  // Input mode: Black when focused or has value, otherwise assistive
  const iconColor = disabled
    ? colors.textDisabled
    : hasCalendarDate || isFocused || hasValue
    ? colors.staticBlack
    : colors.textAssistive;

  // Format number with commas
  const formatNumber = (text: string) => {
    // Remove all non-numeric characters
    const numbers = text.replace(/[^0-9]/g, '');
    
    // If empty, return empty string
    if (!numbers) return '';
    
    // Convert to number and back to string to remove leading zeros
    const num = parseInt(numbers, 10);
    
    // Add commas using toLocaleString
    return num.toLocaleString();
  };

  const handleChangeText = (text: string) => {
    if (!onChangeText || disabled || buttonMode) return;
    
    if (inputType === 'number') {
      const formatted = formatNumber(text);
      onChangeText(formatted);
    } else {
      onChangeText(text);
    }
  };

  return (
    <Pressable
      onPress={() => {
        // onPress prop이 있으면 disabled 상태여도 호출 (토스트 메시지 등)
        if (onPress) {
          onPress();
        } else if (disabled && !buttonMode) {
          // onPress가 없고 disabled 상태면 차단
          return;
        } else if (!calendar && !buttonMode) {
          // 일반 입력 모드: 포커스
          inputRef.current?.focus();
        }
      }}
      style={[
        styles.container,
        variant === 'line' ? styles.containerLine : styles.containerArea,
        { backgroundColor, borderColor },
        style,
      ]}
    >
      {/* Content Frame - matches Figma Frame 2 structure */}
      <View style={[styles.content, variant === 'area' && styles.contentArea]}>
        {/* Calendar Mode: Icon + Date */}
        {calendar ? (
          <View style={styles.leftSection}>
            <Icon
              name="calendarMonth"
              size={24}
              color={iconColor}
              style={styles.icon}
            />
            <Text style={[styles.calendarDate, { color: calendarDate ? textColor : placeholderColor }]}>
              {calendarDate ?? '--'}
            </Text>
          </View>
        ) : (
          <>
            {/* Normal Mode: Icon + Text Input */}
            <View style={styles.leftSection}>
              {/* Icon */}
              {icon && (
                <Icon
                  name={icon}
                  size={24}
                  color={iconColor}
                  style={styles.icon}
                />
              )}

              {/* Text Input or Button Mode Text */}
              {buttonMode ? (
                <Text
                  style={[
                    styles.input,
                    { color: hasValue ? textColor : placeholderColor },
                    (textInputProps as any).style,
                  ]}
                >
                  {hasValue ? value : finalPlaceholder}
                </Text>
              ) : (
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    { color: textColor },
                    inputType === 'number' && styles.inputNumber,
                    variant === 'area' && styles.inputArea,
                    (textInputProps as any).style,
                  ]}
                  value={value}
                  onChangeText={handleChangeText}
                  onFocus={(e) => {
                    setIsFocused(true);
                    textInputProps.onFocus?.(e);
                  }}
                  onBlur={(e) => {
                    setIsFocused(false);
                    textInputProps.onBlur?.(e);
                  }}
                  placeholder={finalPlaceholder}
                  placeholderTextColor={placeholderColor}
                  editable={!disabled && textInputProps.editable !== false}
                  pointerEvents={textInputProps.editable === false ? 'none' : 'auto'}
                  onPressIn={() => {
                    // disabled 상태일 때 onPress 호출
                    if (disabled && onPress) {
                      onPress();
                    }
                  }}
                  multiline={variant === 'area'}
                  textAlignVertical={variant === 'area' ? 'top' : 'center'}
                  keyboardType={externalKeyboardType || (inputType === 'number' ? 'number-pad' : 'default')}
                  accessibilityLabel={finalPlaceholder}
                  accessibilityState={{ disabled }}
                  {...textInputProps}
                />
              )}
            </View>

            {/* Right: Unit, Time Display, Right Text, or Arrow */}
            {(unit || timeDisplay || rightText || showRightArrow) && (
              <View style={styles.rightSection}>
                {/* Unit (for number input) */}
                {unit && inputType === 'number' && (
                  <Text style={[styles.unit, { color: disabled ? colors.textDisabled : colors.textAssistive, marginLeft: 4 }]}>
                    {unit}
                  </Text>
                )}

                {/* Time Display */}
                {timeDisplay && (
                  <Text style={[styles.time, { color: colors.primary }]}>
                    {timeDisplay}
                  </Text>
                )}

                {/* Right Text (dayselect mode) */}
                {rightText && (
                  <Text style={[styles.rightText, { color: disabled ? colors.textDisabled : colors.textAssistive }]}>
                    {rightText}
                  </Text>
                )}

                {/* Right Arrow Icon */}
                {showRightArrow && (
                  <Icon
                    name="arrowRight"
                    variant="line"
                    size={24}
                    color={disabled ? colors.textDisabled : colors.staticBlack}
                    style={styles.rightArrow}
                  />
                )}
              </View>
            )}
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  containerLine: {
    height: 48,
    paddingTop: 11,    // 12 - 1 = 11px
    paddingBottom: 13, // 12 + 1 = 13px
  },
  containerArea: {
    height: 96,
    paddingVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 24,
  },
  contentArea: {
    alignItems: 'flex-start', // area variant는 상단 정렬
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  icon: {
    // Icon is 24x24
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    padding: 0,
    margin: 0,
  },
  inputNumber: {
    fontWeight: '700',
    textAlign: 'right',
  },
  inputArea: {
    height: 72, // containerArea (96px) - paddingVertical (12px * 2)
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unit: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '500',
    lineHeight: 24,
  },
  time: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    lineHeight: 24,
  },
  rightText: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    lineHeight: 24,
  },
  rightArrow: {
    // Icon is 24x24
  },
  calendarDate: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '400',
    lineHeight: 24,
  },
});

