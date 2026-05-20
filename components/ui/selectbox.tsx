/**
 * Selectbox Component
 * 
 * A selectbox component using native Picker for platform-specific UX.
 * Matches Figma design for the button, uses native UI for the picker.
 * 
 * - iOS: Shows wheel picker at bottom
 * - Android: Shows native dropdown dialog
 * - Web: Uses standard select element
 */

import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { textStyleFromIosMetrics } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useRef, useState } from 'react';
import { Animated, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface SelectboxOption {
  label: string;
  value: string;
}

export interface SelectboxProps {
  /**
   * Selectbox options
   */
  options: SelectboxOption[];
  
  /**
   * Selected value
   */
  value?: string;
  
  /**
   * Change handler
   */
  onValueChange?: (value: string) => void;
  
  /**
   * Placeholder text when no value selected
   */
  placeholder?: string;
  
  /**
   * Title shown in picker header (iOS)
   */
  title?: string;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Press handler (for custom actions like showing toast)
   */
  onPress?: () => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Selectbox Component
 */
export function Selectbox({
  options,
  value,
  onValueChange,
  placeholder = 'Select',
  title,
  disabled = false,
  onPress,
  style,
}: SelectboxProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const [showPicker, setShowPicker] = useState(false);
  const [tempValue, setTempValue] = useState<string | undefined>(value);

  // Animation values
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(300)).current;

  // Find selected option label
  const selectedOption = options.find(opt => opt.value === value);
  const displayText = selectedOption?.label ?? placeholder;
  
  // Colors based on state - 피그마 디자인에 맞게 조정
  const textColor = disabled ? '#bdbdbd' : '#424242';
  const iconColor = disabled ? '#bdbdbd' : colors.staticBlack;
  const backgroundColor = disabled ? 'rgba(144, 146, 158, 0.12)' : '#ffffff';
  const borderColor = 'rgba(144, 146, 158, 0.16)';

  // Animate picker open/close
  useEffect(() => {
    if (showPicker) {
      // Reset animation values before opening
      dimOpacity.setValue(0);
      pickerTranslateY.setValue(300);
      
      // Opening: Dim appears instantly, then picker slides up
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 1,
          duration: 100, // Dim appears quickly (50ms faster)
          useNativeDriver: true,
        }),
        Animated.timing(pickerTranslateY, {
          toValue: 0,
          duration: 250, // Picker slides up smoothly (50ms faster)
          delay: 0, // No delay (50ms faster)
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Closing: Both fade out together
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: 150, // 50ms faster
          useNativeDriver: true,
        }),
        Animated.timing(pickerTranslateY, {
          toValue: 300,
          duration: 200, // 50ms faster
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showPicker, dimOpacity, pickerTranslateY]);

  const handlePress = () => {
    // 항상 먼저 키패드 등 열린 요소 닫기
    Keyboard.dismiss();
    // 사용자가 전달한 onPress (토스트 등) 실행
    onPress?.();
    if (disabled) return;
    if (Platform.OS === 'ios') {
      setTempValue(value); // 임시 값을 현재 값으로 초기화
      setShowPicker(true);
    }
  };

  const handleDone = () => {
    onValueChange?.(tempValue ?? ''); // 완료 버튼을 눌렀을 때만 실제 값 업데이트
    setShowPicker(false);
  };

  const handleCancel = () => {
    setTempValue(value); // 취소 시 원래 값으로 복구
    setShowPicker(false);
  };

  const handleValueChange = (itemValue: string) => {
    if (Platform.OS === 'android') {
      onValueChange?.(itemValue); // Android는 즉시 적용
    } else {
      setTempValue(itemValue); // iOS는 임시 값만 변경
    }
  };

  // Android: 직접 Picker 렌더링
  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor, borderColor },
          style,
        ]}
      >
        <View style={styles.displayLayer} pointerEvents="none">
          <Text style={[styles.text, { color: textColor }]}>
            {displayText}
          </Text>
          <Icon
            name="arrowDown"
            size={24}
            color={iconColor}
          />
        </View>
        
        <Picker
          selectedValue={value}
          onValueChange={handleValueChange}
          enabled={!disabled}
          style={styles.androidPicker}
          mode="dropdown"
          onFocus={() => {
            Keyboard.dismiss();
            onPress?.();
          }}
        >
          {options.map((option) => (
            <Picker.Item
              key={option.value}
              label={option.label}
              value={option.value}
            />
          ))}
        </Picker>
      </View>
    );
  }

  // iOS: Modal + Picker
  return (
    <>
      <Pressable
        onPress={handlePress}
        disabled={false}
        style={[
          styles.container,
          { backgroundColor, borderColor },
          style,
        ]}
      >
        <View style={styles.displayLayer}>
          <Text style={[styles.text, { color: textColor }]}>
            {displayText}
          </Text>
          <Icon
            name="arrowDown"
            size={24}
            color={iconColor}
          />
        </View>
      </Pressable>

      {/* iOS Modal Picker */}
      <Modal
        visible={showPicker}
        transparent
        animationType="none"
      >
        <Animated.View 
          style={[
            styles.modalOverlay,
            { opacity: dimOpacity }
          ]}
        >
          <Pressable 
            style={StyleSheet.absoluteFill}
            onPress={handleCancel}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.modalContent,
            { transform: [{ translateY: pickerTranslateY }] }
          ]}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={[styles.pickerHeader, { backgroundColor: colors.background }]}>
              <Pressable onPress={handleCancel} style={styles.headerButton}>
                <Text style={[styles.cancelButton, { color: colors.textNeutral }]}>
                  취소
                </Text>
              </Pressable>
              
              {title && (
                <Text style={[styles.pickerTitle, { color: colors.text }]}>
                  {title}
                </Text>
              )}
              
              <Pressable onPress={handleDone} style={styles.headerButton}>
                <Text style={[styles.doneButton, { color: colors.primary }]}>
                  완료
                </Text>
              </Pressable>
            </View>
            <Picker
              selectedValue={tempValue}
              onValueChange={handleValueChange}
              style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
            >
              {options.map((option) => (
                <Picker.Item
                  key={option.value}
                  label={option.label}
                  value={option.value}
                />
              ))}
            </Picker>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  displayLayer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
  },
  text: {
    ...Typography.body1.l.regular,
  },
  // Android Picker
  androidPicker: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    width: '100%',
    height: '100%',
  },
  // iOS Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  headerButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    minWidth: 60,
  },
  cancelButton: {
    ...textStyleFromIosMetrics(17, '400'),
  },
  pickerTitle: {
    ...textStyleFromIosMetrics(17, '500'),
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    ...textStyleFromIosMetrics(17, '500'),
    textAlign: 'right',
  },
  iosPicker: {
    width: '100%',
    height: 216,
  },
});
