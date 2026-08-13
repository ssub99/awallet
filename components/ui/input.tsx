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
import { colors, type ColorPalette } from '@/constants/theme';
import {
  typographyLayout,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableWithoutFeedback,
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
   * Button mode - displays as a button for selection (like category picker).
   * Also implied when calendar, rightText (dayselect), or showRightArrow is set (Figma DS).
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
  const {
    onFocus: onFocusProp,
    onBlur: onBlurProp,
    onPressIn: onPressInProp,
    editable: editableProp,
    ...restTextInputProps
  } = textInputProps;
  // Default placeholder based on inputType
  const defaultPlaceholder = inputType === 'number' ? '0' : '내용 입력';
  const finalPlaceholder = placeholder ?? defaultPlaceholder;
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  
  const inputRef = useRef<TextInput>(null);

  // Figma DS: calendar · dayselect(rightText) · righticon(showRightArrow) variants use buttonmode=true
  const resolvedButtonMode =
    buttonMode || calendar || !!rightText || showRightArrow;

  // 외부 ref를 내부 inputRef에 연결
  useImperativeHandle(ref, () => inputRef.current as TextInput);
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value && value.length > 0;
  const hasCalendarDate = calendar && calendarDate;

  // Border color based on state
  const borderColor = disabled ? palette.border : isFocused ? palette.primary : palette.border;
  
  // Background color based on state
  const backgroundColor = disabled ? palette.fillDisabled : palette.staticWhite;
  
  // Text color based on state
  const textColor = disabled ? palette.textDisabled : palette.text;
  
  // Placeholder color
  const placeholderColor = disabled ? palette.textDisabled : palette.textAssistive;
  
  // Icon color based on state
  // Calendar mode: Black when date is set, otherwise assistive
  // Input mode: Black when focused or has value, otherwise assistive
  const iconColor = disabled
    ? palette.textDisabled
    : hasCalendarDate || isFocused || hasValue
    ? palette.staticBlack
    : palette.textAssistive;
  const resolvedSortationColor = sortationColor ?? palette.primary;
  const shouldUseCompactEmojiGap = !!sortationEmoji && !showSortationDot;
  // iOS: 네이티브 placeholder·입력 텍스트를 동일 UITextField 경로로 맞춤 (커스텀 Text 오버레이는 살짝 위로 쏠림)
  const shouldUseCustomLinePlaceholder =
    Platform.OS !== 'ios' &&
    variant === 'line' &&
    inputType === 'text' &&
    !resolvedButtonMode &&
    !valueRenderer &&
    !shortver;

  const useLineFieldWrap = variant === 'line' && !shortver && inputType === 'text';

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
    if (!onChangeText || disabled || resolvedButtonMode) return;

    if (inputType === 'number') {
      const formatted = formatNumber(text);
      onChangeText(formatted);
    } else {
      onChangeText(text);
    }
  };

  const isMultilineArea = variant === 'area' && !resolvedButtonMode && !calendar;
  /**
   * 커스텀 키패드 패턴(editable=false + onPress):
   * Pressable은 Android에서 인접 필드 포커스 시 pressed 상태가 남을 수 있음.
   * onPressIn은 터치 다운에 반응해 레이아웃 이동 시 오동작 → TouchableWithoutFeedback + onPress.
   */
  const useKeypadTouchable =
    variant === 'line' && editableProp === false && onPress != null;

  const renderLineTextInput = () => {
    const textInput = (
      <TextInput
        ref={inputRef}
        {...restTextInputProps}
        value={value}
        onChangeText={handleChangeText}
        onFocus={(e) => {
          setIsFocused(true);
          onFocusProp?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlurProp?.(e);
        }}
        placeholder={shouldUseCustomLinePlaceholder ? '' : finalPlaceholder}
        placeholderTextColor={placeholderColor}
        editable={!disabled && editableProp !== false}
        pointerEvents={editableProp === false ? 'none' : 'auto'}
        multiline={variant === 'area'}
        textAlignVertical={variant === 'area' ? 'top' : 'center'}
        keyboardType={externalKeyboardType || (inputType === 'number' ? 'number-pad' : 'default')}
        accessibilityLabel={finalPlaceholder}
        accessibilityState={{ disabled }}
        style={[
          variant === 'area'
            ? styles.inputAreaField
            : shortver
              ? styles.inputShortField
              : inputType === 'number'
                ? styles.inputNumber
                : styles.inputLine,
          { color: textColor },
          shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
        ]}
        onPressIn={(event) => {
          if (!useKeypadTouchable && disabled && onPress) {
            onPress();
          }
          onPressInProp?.(event);
        }}
      />
    );

    return useLineFieldWrap ? <View style={styles.inputLineTextWrap}>{textInput}</View> : textInput;
  };

  const containerStyles = [
    styles.container,
    variant === 'line' ? (shortver ? styles.containerLineShort : styles.containerLine) : styles.containerArea,
    { backgroundColor, borderColor },
    style,
  ];

  const handlePressablePress = () => {
    if (onPress) {
      onPress();
    } else if (disabled && !resolvedButtonMode) {
      return;
    } else if (!calendar && !resolvedButtonMode) {
      inputRef.current?.focus();
    }
  };

  const fieldFrame = (
    <View
      style={containerStyles}
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
            <View style={styles.inputFieldWrap}>
              <View style={variant === 'line' && !shortver ? styles.inputLineTextWrap : undefined}>
                <Text
                  style={[
                    styles.calendarDate,
                    variant === 'line' && !shortver && styles.inputLineButtonText,
                    { color: calendarDate ? textColor : placeholderColor },
                  ]}
                >
                  {calendarDate ?? '--'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Normal Mode: Icon + Text Input */}
            <View style={[styles.leftSection, variant === 'area' && styles.leftSectionArea]}>
              {(sortation || !!sortationEmoji) && (
                <>
                  {showSortationDot && (
                    <View
                      style={[
                        styles.sortationIndicator,
                        { backgroundColor: resolvedSortationColor, borderColor: palette.border },
                      ]}
                    />
                  )}
                  {sortationEmoji ? (
                    <View style={shortver ? styles.inputLineTextWrapShort : styles.inputLineTextWrap}>
                      <Text style={[styles.sortationEmoji, { color: disabled ? palette.textDisabled : palette.textNeutral }]}>
                        {sortationEmoji}
                      </Text>
                    </View>
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
              {resolvedButtonMode ? (
                variant === 'line' ? (
                  <View style={styles.inputFieldWrap}>
                    <View style={shortver ? styles.inputLineTextWrapShort : styles.inputLineTextWrap}>
                      <Text
                        style={[
                          shortver ? styles.inputShort : styles.inputLineButtonText,
                          shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
                          { color: hasValue ? textColor : placeholderColor },
                          (textInputProps as any).style,
                        ]}
                      >
                        {hasValue ? value : finalPlaceholder}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text
                    style={[
                      styles.inputLineButtonText,
                      shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
                      { color: hasValue ? textColor : placeholderColor },
                      (textInputProps as any).style,
                    ]}
                  >
                    {hasValue ? value : finalPlaceholder}
                  </Text>
                )
              ) : valueRenderer ? (
                <View
                  style={[
                    styles.valueRenderer,
                    variant === 'line' && !shortver && styles.inputFieldWrap,
                  ]}
                >
                  {valueRenderer}
                </View>
              ) : (
                <View
                  style={[
                    styles.inputFieldWrap,
                    variant === 'area' && styles.inputFieldWrapArea,
                  ]}
                >
                  {renderLineTextInput()}
                  {shouldUseCustomLinePlaceholder && !value ? (
                    <View style={styles.inputPlaceholderWrap} pointerEvents="none">
                      <View style={styles.inputLineTextWrap}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.inputPlaceholderText,
                            { color: placeholderColor },
                            shouldUseCompactEmojiGap && styles.inputEmojiGapCompact,
                          ]}
                        >
                          {finalPlaceholder}
                        </Text>
                      </View>
                    </View>
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
                    color={disabled ? palette.textDisabled : palette.textNeutral}
                    style={styles.rightIcon}
                  />
                )}

                {/* Unit (for number input) */}
                {unit && inputType === 'number' && (
                  <Text style={[styles.unit, { color: disabled ? palette.textDisabled : palette.textAssistive, marginLeft: 4 }]}>
                    {unit}
                  </Text>
                )}

                {/* Time Display */}
                {timeDisplay && (
                  <Text style={[styles.time, { color: palette.primary }]}>
                    {timeDisplay}
                  </Text>
                )}

                {/* Right Text (dayselect mode) */}
                {rightText && (
                  <Text style={[styles.rightText, { color: disabled ? palette.textDisabled : palette.textAssistive }]}>
                    {rightText}
                  </Text>
                )}

                {/* Right Arrow Icon */}
                {showRightArrow && (
                  <Icon
                    name={rightIcon ?? (sortation || shortver ? 'arrowDown' : 'arrowRight')}
                    variant="line"
                    size={shortver ? 16 : 24}
                    color={disabled ? palette.textDisabled : palette.staticBlack}
                    style={styles.rightArrow}
                  />
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );

  if (isMultilineArea) {
    return fieldFrame;
  }

  if (useKeypadTouchable) {
    return (
      <TouchableWithoutFeedback
        onPress={() => onPress?.()}
        accessibilityRole="button"
        accessibilityLabel={finalPlaceholder}
        accessibilityState={{ disabled }}
      >
        {fieldFrame}
      </TouchableWithoutFeedback>
    );
  }

  return (
    <Pressable
      onPress={handlePressablePress}
      accessibilityRole="button"
      accessibilityLabel={finalPlaceholder}
      accessibilityState={{ disabled }}
    >
      {fieldFrame}
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
    justifyContent: 'center',
  },
  containerLineShort: {
    height: 36,
    justifyContent: 'center',
  },
  containerArea: {
    height: 96,
    paddingVertical: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: typographyLayoutFieldLineRowHeight,
  },
  contentShort: {
    minHeight: typographyLayoutFieldLineShortMinHeight,
  },
  contentArea: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    flex: 1,
    minHeight: typographyLayoutFieldAreaInputHeight,
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leftSectionArea: {
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  icon: {
    // Icon is 24x24
  },
  inputLineTextWrap: typographyLayout.fieldInputLineWrap,
  inputLineTextWrapShort: typographyLayout.fieldInputShortLineWrap,
  inputFieldWrap: {
    flex: 1,
    justifyContent: 'center',
    minHeight: typographyLayoutFieldLineRowHeight,
    position: 'relative',
  },
  inputPlaceholderWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  inputFieldWrapArea: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    minHeight: typographyLayoutFieldAreaInputHeight,
  },
  inputLine: typographyLayout.fieldInputLine,
  inputAreaField: typographyLayout.fieldInputArea,
  inputLineButtonText: typographyLayout.uiLineBody01Regular,
  inputPlaceholderText: typographyLayout.fieldInputPlaceholder,
  inputShort: typographyLayout.fieldInputShortLine,
  inputShortField: typographyLayout.fieldInputShortLineInput,
  inputEmojiGapCompact: {
    marginLeft: -4,
  },
  inputNumber: typographyLayout.fieldInputNumber,
  valueRenderer: {
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unit: typographyLayout.uiLineBody01Regular,
  time: typographyLayout.uiLineBody01Regular,
  rightText: typographyLayout.uiLineBody01Regular,
  rightArrow: {
    // Icon is 24x24
  },
  rightIcon: {
    // Icon is 24x24
  },
  calendarDate: typographyLayout.uiLineBody01Regular,
  sortationIndicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  sortationEmoji: typographyLayout.uiLineBody01Regular,
});
