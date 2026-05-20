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
import { pretendardTextStyle } from '@/constants/fonts';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
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
   * Right icon name (optional)
   */
  rightIcon?: IconName;
  
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
   * Custom value renderer (optional)
   */
  valueRenderer?: ReactNode;
  
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

  /**
   * Sortation mode - shows colored dot + optional emoji before value.
   */
  sortation?: boolean;

  /**
   * Whether to show sortation color dot.
   * Defaults to true when sortation is enabled.
   */
  showSortationDot?: boolean;

  /**
   * Short version for compact button mode (36px height).
   */
  shortver?: boolean;

  /**
   * Sortation indicator color.
   */
  sortationColor?: string;

  /**
   * Sortation indicator emoji.
   */
  sortationEmoji?: string;
}

/**
 * Input Component
 */
export const Input = forwardRef<TextInput, InputProps>(function Input({
  variant = 'line',
  inputType = 'text',
  icon,
  showRightArrow = false,
  rightText,
  rightIcon,
  timeDisplay,
  unit,
  calendar = false,
  calendarDate,
  disabled = false,
  buttonMode = false,
  sortation = false,
  showSortationDot = true,
  shortver = false,
  sortationColor,
  sortationEmoji,
  style,
  value = '',
  valueRenderer,
  onChangeText,
  onPress,
  placeholder,
  keyboardType: externalKeyboardType,
  ...textInputProps
}, ref) {
  // Default placeholder based on inputType
  const defaultPlaceholder = inputType === 'number' ? '0' : '내용 입력';
  const finalPlaceholder = placeholder ?? defaultPlaceholder;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  const inputRef = useRef<TextInput>(null);
  
  // 외부 ref를 내부 inputRef에 연결
  useImperativeHandle(ref, () => inputRef.current as TextInput);
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
  const resolvedSortationColor = sortationColor ?? colors.primary;
  const shouldUseCompactEmojiGap = !!sortationEmoji && !showSortationDot;
  const shouldUseCustomLinePlaceholder =
    variant === 'line' &&
    inputType === 'text' &&
    !buttonMode &&
    !valueRenderer &&
    !shortver;

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
        variant === 'line' ? (shortver ? styles.containerLineShort : styles.containerLine) : styles.containerArea,
        { backgroundColor, borderColor },
        style,
      ]}
    >
      {/* Content Frame - matches Figma Frame 2 structure */}
      <View style={[styles.content, shortver && styles.contentShort, variant === 'area' && styles.contentArea]}>
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
              {(sortation || !!sortationEmoji) && (
                <>
                  {showSortationDot && (
                    <View
                      style={[
                        styles.sortationIndicator,
                        { backgroundColor: resolvedSortationColor, borderColor: colors.border },
                      ]}
                    />
                  )}
                  {sortationEmoji ? (
                    <Text style={[styles.sortationEmoji, { color: disabled ? colors.textDisabled : colors.textNeutral }]}>
                      {sortationEmoji}
                    </Text>
                  ) : null}
                </>
              )}
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
                    shortver && styles.inputShort,
                    shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
                    { color: hasValue ? textColor : placeholderColor },
                    (textInputProps as any).style,
                  ]}
                >
                  {hasValue ? value : finalPlaceholder}
                </Text>
              ) : valueRenderer ? (
                <View style={styles.valueRenderer}>
                  {valueRenderer}
                </View>
              ) : (
                <View style={styles.inputFieldWrap}>
                  <TextInput
                    ref={inputRef}
                    style={[
                      styles.input,
                      { color: textColor },
                      variant === 'line' && !shortver && styles.inputLine,
                      inputType === 'number' && styles.inputNumber,
                      variant === 'area' && styles.inputArea,
                      shortver && styles.inputShort,
                      shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
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
                    placeholder={shouldUseCustomLinePlaceholder ? '' : finalPlaceholder}
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
                  {shouldUseCustomLinePlaceholder && !value ? (
                    <Text
                      pointerEvents="none"
                      numberOfLines={1}
                      style={[
                        styles.inputPlaceholderText,
                        { color: placeholderColor },
                        shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
                      ]}
                    >
                      {finalPlaceholder}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>

            {/* Right: Right Icon, Unit, Time Display, Right Text, or Arrow */}
            {(unit || timeDisplay || rightText || rightIcon || showRightArrow) && (
              <View style={styles.rightSection}>
                {/* Right Icon */}
                {rightIcon && !showRightArrow && (
                  <Icon
                    name={rightIcon}
                    variant="line"
                    size={10}
                    color={disabled ? colors.textDisabled : colors.textNeutral}
                    style={styles.rightIcon}
                  />
                )}

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
                    name={rightIcon ?? (sortation || shortver ? 'arrowDown' : 'arrowRight')}
                    variant="line"
                    size={shortver ? 16 : 24}
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
});

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  containerLine: {
    height: 48,
    // line 입력은 48 높이 내에서 텍스트(24)를 정확히 중앙 정렬
    paddingVertical: 12,
  },
  containerLineShort: {
    height: 36,
    paddingTop: 6,
    paddingBottom: 9,
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
  contentShort: {
    minHeight: 21,
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
    ...pretendardTextStyle('400'),
    includeFontPadding: false,
    padding: 0,
    margin: 0,
  },
  inputFieldWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  inputLine: {
    height: 24,
    textAlignVertical: 'center',
  },
  inputPlaceholderText: {
    ...Typography.body1.l.regular,
    position: 'absolute',
    left: 0,
    right: 0,
    includeFontPadding: false,
    lineHeight: 24,
  },
  inputShort: {
    ...Typography.body2.r.regular,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  inputEmojiGapCompact: {
    marginLeft: -4,
  },
  inputNumber: {
    ...pretendardTextStyle('700'),
    textAlign: 'right',
  },
  inputArea: {
    height: 72, // containerArea (96px) - paddingVertical (12px * 2)
  },
  valueRenderer: {
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unit: {
    fontSize: 16,
    ...pretendardTextStyle('500'),
    lineHeight: 24,
  },
  time: {
    fontSize: 16,
    ...pretendardTextStyle('400'),
    lineHeight: 24,
  },
  rightText: {
    fontSize: 16,
    ...pretendardTextStyle('400'),
    lineHeight: 24,
  },
  rightArrow: {
    // Icon is 24x24
  },
  rightIcon: {
    // Icon is 24x24
  },
  calendarDate: {
    fontSize: 16,
    ...pretendardTextStyle('400'),
    lineHeight: 24,
  },
  sortationIndicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  sortationEmoji: {
    ...Typography.body1.l.regular,
  },
});

