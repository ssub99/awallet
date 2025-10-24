/**
 * Date Picker Component
 * 
 * A flexible date picker component that can select year, month, and/or day.
 * Uses native Picker with custom animations matching the design system.
 * 
 * Features:
 * - Year selection (optional)
 * - Month selection (optional) 
 * - Day selection (optional)
 * - Custom animations (same as TopNavigation)
 * - Platform-specific behavior (iOS/Android)
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Picker } from '@react-native-picker/picker';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface DatePickerOption {
  label: string;
  value: number;
}

export interface DatePickerProps {
  /**
   * Whether the picker is visible
   */
  visible: boolean;
  
  /**
   * Close handler
   */
  onClose: () => void;
  
  /**
   * Title shown in picker header
   */
  title?: string;
  
  /**
   * Year options (if provided, enables year selection)
   */
  yearOptions?: DatePickerOption[];
  
  /**
   * Selected year value
   */
  selectedYear?: number;
  
  /**
   * Year change handler
   */
  onYearChange?: (year: number) => void;
  
  /**
   * Month options (if provided, enables month selection)
   */
  monthOptions?: DatePickerOption[];
  
  /**
   * Selected month value
   */
  selectedMonth?: number;
  
  /**
   * Month change handler
   */
  onMonthChange?: (month: number) => void;
  
  /**
   * Day options (if provided, enables day selection)
   */
  dayOptions?: DatePickerOption[];
  
  /**
   * Selected day value
   */
  selectedDay?: number;
  
  /**
   * Day change handler
   */
  onDayChange?: (day: number) => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Date Picker Component
 */
export function DatePicker({
  visible,
  onClose,
  title = '날짜 선택',
  yearOptions,
  selectedYear,
  onYearChange,
  monthOptions,
  selectedMonth,
  onMonthChange,
  dayOptions,
  selectedDay,
  onDayChange,
  style,
}: DatePickerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  // Temporary values for iOS (to handle cancel/confirm)
  const [tempYear, setTempYear] = useState<number | undefined>(selectedYear);
  const [tempMonth, setTempMonth] = useState<number | undefined>(selectedMonth);
  const [tempDay, setTempDay] = useState<number | undefined>(selectedDay);
  
  // Animation values (same as TopNavigation)
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(300)).current;
  
  // Update temp values when props change
  useEffect(() => {
    setTempYear(selectedYear);
    setTempMonth(selectedMonth);
    setTempDay(selectedDay);
  }, [selectedYear, selectedMonth, selectedDay]);
  
  // Animate picker open/close (same as TopNavigation)
  useEffect(() => {
    if (visible) {
      // Reset animation values before opening
      dimOpacity.setValue(0);
      pickerTranslateY.setValue(300);
      
      // Opening: Dim appears instantly, then picker slides up
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(pickerTranslateY, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Closing: Both fade out together
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(pickerTranslateY, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, dimOpacity, pickerTranslateY]);
  
  const handleDone = () => {
    // Apply temp values to actual values
    if (onYearChange && tempYear !== undefined) {
      onYearChange(tempYear);
    }
    if (onMonthChange && tempMonth !== undefined) {
      onMonthChange(tempMonth);
    }
    if (onDayChange && tempDay !== undefined) {
      onDayChange(tempDay);
    }
    onClose();
  };
  
  const handleCancel = () => {
    // Reset temp values to original values
    setTempYear(selectedYear);
    setTempMonth(selectedMonth);
    setTempDay(selectedDay);
    onClose();
  };
  
  const handleYearValueChange = (itemValue: number) => {
    if (Platform.OS === 'android') {
      onYearChange?.(itemValue);
    } else {
      setTempYear(itemValue);
    }
  };
  
  const handleMonthValueChange = (itemValue: number) => {
    if (Platform.OS === 'android') {
      onMonthChange?.(itemValue);
    } else {
      setTempMonth(itemValue);
    }
  };
  
  const handleDayValueChange = (itemValue: number) => {
    if (Platform.OS === 'android') {
      onDayChange?.(itemValue);
    } else {
      setTempDay(itemValue);
    }
  };
  
  // Count how many pickers we have
  const pickerCount = [yearOptions, monthOptions, dayOptions].filter(Boolean).length;
  
  // Android: Direct Picker rendering (if only one picker)
  if (Platform.OS === 'android' && pickerCount === 1) {
    // For Android with single picker, we can use the native dropdown
    // This would need to be handled differently based on the specific use case
    // For now, we'll use the modal approach for consistency
  }
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Animated.View 
        style={[
          styles.modalOverlay,
          { opacity: dimOpacity }
        ]}
      >
        <Pressable 
          style={styles.backdrop}
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
            
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {title}
            </Text>
            
            <Pressable onPress={handleDone} style={styles.headerButton}>
              <Text style={[styles.doneButton, { color: colors.primary }]}>
                완료
              </Text>
            </Pressable>
          </View>
          
          {/* Pickers Row */}
          <View style={styles.pickerRow}>
            {/* Year Picker */}
            {yearOptions && yearOptions.length > 0 && (
              <View style={[
                styles.pickerColumn,
                pickerCount === 1 && styles.pickerColumnFull
              ]}>
                <Picker
                  selectedValue={Platform.OS === 'ios' ? tempYear : selectedYear}
                  onValueChange={handleYearValueChange}
                  style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
                >
                  {yearOptions.map((option) => (
                    <Picker.Item
                      key={option.value}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </Picker>
              </View>
            )}
            
            {/* Month Picker */}
            {monthOptions && monthOptions.length > 0 && (
              <View style={styles.pickerColumn}>
                <Picker
                  selectedValue={Platform.OS === 'ios' ? tempMonth : selectedMonth}
                  onValueChange={handleMonthValueChange}
                  style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
                >
                  {monthOptions.map((option) => (
                    <Picker.Item
                      key={option.value}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </Picker>
              </View>
            )}
            
            {/* Day Picker */}
            {dayOptions && dayOptions.length > 0 && (
              <View style={styles.pickerColumn}>
                <Picker
                  selectedValue={Platform.OS === 'ios' ? tempDay : selectedDay}
                  onValueChange={handleDayValueChange}
                  style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
                >
                  {dayOptions.map((option) => (
                    <Picker.Item
                      key={option.value}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </Picker>
              </View>
            )}
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdrop: {
    flex: 1,
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
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '400',
  },
  pickerTitle: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    fontSize: 17,
    fontFamily: 'Pretendard',
    fontWeight: '600',
    textAlign: 'right',
  },
  pickerRow: {
    flexDirection: 'row',
    width: '100%',
  },
  pickerColumn: {
    flex: 1,
  },
  pickerColumnFull: {
    flex: 1,
    width: '100%',
  },
  iosPicker: {
    width: '100%',
    height: 216,
  },
});
