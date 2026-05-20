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
import { pretendardFontFamily, pretendardTextStyle } from '@/constants/fonts';

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
   * Cancel button press handler (header "취소")
   */
  onCancelPress?: () => void;

  /**
   * Done button press handler (header "완료")
   */
  onDonePress?: () => void;
  
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
  onCancelPress,
  onDonePress,
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

  // 휠 배경은 항상 staticWhite라 라벨은 항상 어두운 고정색을 씁니다.
  // (다크 모드에서 시스템 라벨 색이 밝게 잡히면 흰 배경 위에서 글자가 사라짐)
  const iosWheelItemStyle =
    Platform.OS === 'ios'
      ? { color: colors.staticBlack, fontSize: 22 }
      : undefined;
  
  const clampToOptions = (value: number | undefined, options?: DatePickerOption[]) => {
    if (!options || options.length === 0 || value === undefined) {
      return value;
    }
    const min = options[0].value;
    const max = options[options.length - 1].value;
    return Math.min(max, Math.max(min, value));
  };
  
  // Temporary values for iOS (to handle cancel/confirm)
  const [tempYear, setTempYear] = useState<number | undefined>(
    clampToOptions(selectedYear, yearOptions)
  );
  const [tempMonth, setTempMonth] = useState<number | undefined>(
    clampToOptions(selectedMonth, monthOptions)
  );
  const [tempDay, setTempDay] = useState<number | undefined>(
    clampToOptions(selectedDay, dayOptions)
  );
  const tempYearRef = useRef<number | undefined>(tempYear);
  const tempMonthRef = useRef<number | undefined>(tempMonth);
  const tempDayRef = useRef<number | undefined>(tempDay);
  
  // 모달이 닫히는 중인지 추적 (prop 변경 무시하기 위함)
  const isClosingRef = useRef(false);
  // 완료 시 적용 지연 타이머 (iOS wheel 관성 대비)
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Animation values (same as TopNavigation)
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(300)).current;
  
  // Track if picker has been opened (to prevent prop updates while open)
  const wasOpenRef = useRef(false);
  
  // Update temp values when props change
  useEffect(() => {
    if (__DEV__) {
    }
    
    // 모달이 닫히는 중이면 prop 변경 무시
    if (isClosingRef.current) {
      if (__DEV__) {
      }
      return;
    }
    
    // 피커가 열려있는 동안에는 prop 변경 완전히 무시
    if (visible) {
      // 피커가 막 열릴 때만 초기값 설정 (이미 열려있으면 무시)
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        if (__DEV__) {
        }
        if (selectedYear !== undefined) {
          const next = clampToOptions(selectedYear, yearOptions);
          setTempYear(next);
          tempYearRef.current = next;
        }
        if (selectedMonth !== undefined) {
          const next = clampToOptions(selectedMonth, monthOptions);
          setTempMonth(next);
          tempMonthRef.current = next;
        }
        if (selectedDay !== undefined) {
          const next = clampToOptions(selectedDay, dayOptions);
          setTempDay(next);
          tempDayRef.current = next;
        }
      } else {
        if (__DEV__) {
        }
      }
    } else {
      // 피커가 닫혀있을 때는 항상 prop 값으로 동기화
      wasOpenRef.current = false;
      if (__DEV__) {
      }
      const nextYear = clampToOptions(selectedYear, yearOptions);
      const nextMonth = clampToOptions(selectedMonth, monthOptions);
      const nextDay = clampToOptions(selectedDay, dayOptions);
      setTempYear(nextYear);
      setTempMonth(nextMonth);
      setTempDay(nextDay);
      tempYearRef.current = nextYear;
      tempMonthRef.current = nextMonth;
      tempDayRef.current = nextDay;
    }
  }, [selectedYear, selectedMonth, selectedDay, visible, yearOptions, monthOptions, dayOptions]);
  
  // Animate picker open/close (same as TopNavigation)
  useEffect(() => {
    if (__DEV__) {
    }
    if (visible) {
      // 모달이 열릴 때 isClosing 플래그 리셋
      isClosingRef.current = false;
      
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
      ]).start(() => {
        if (__DEV__) {
        }
      });
    } else {
      // 모달이 닫히기 시작할 때 플래그 설정
      isClosingRef.current = true;
      if (__DEV__) {
      }
      
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
      ]).start(() => {
        if (__DEV__) {
        }
        // 애니메이션 완료 후 플래그 리셋 (약간의 지연을 두어 prop 변경이 완료될 때까지 대기)
        setTimeout(() => {
          isClosingRef.current = false;
        }, 100);
      });
    }
  }, [visible, dimOpacity, pickerTranslateY]);
  
  const handleDone = () => {
    if (__DEV__) {
    }
    try {
      // 먼저 닫기 플래그 설정 (prop 변경 무시)
      isClosingRef.current = true;
      // 기존 적용 타이머가 있으면 취소
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
      if (__DEV__) {
      }
      
      // iOS wheel 관성으로 인한 값 변화를 흡수하기 위해 짧은 지연 후 적용
      applyTimerRef.current = setTimeout(() => {
        try {
          if (onYearChange && tempYear !== undefined) {
            onYearChange(tempYear);
          }
          if (onMonthChange && tempMonth !== undefined) {
            onMonthChange(tempMonth);
          }
          if (onDayChange && tempDay !== undefined) {
            onDayChange(tempDay);
          }
        } catch (error) {
          if (__DEV__) {
            console.error('❌ [DatePicker] 상태 변경 에러:', error);
          }
        } finally {
          onClose();
          setTimeout(() => {
            isClosingRef.current = false;
          }, 100);
        }
      }, 150); // 관성 마무리 대기 (150ms)
    } catch (error) {
      if (__DEV__) {
        console.error('❌ [DatePicker] handleDone 에러:', error);
      }
      isClosingRef.current = false;
      // 에러 발생 시에도 모달은 닫기
      onClose();
    }
  };
  
  const handleCancel = () => {
    if (__DEV__) {
    }
    try {
      // 먼저 닫기 플래그 설정 (prop 변경 무시)
      isClosingRef.current = true;
      // 적용 타이머가 있으면 취소
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current);
        applyTimerRef.current = null;
      }
      if (__DEV__) {
      }
      
      // 먼저 모달을 닫기
      if (__DEV__) {
      }
      onClose();
      
      // 모달이 닫힌 후 temp 값을 원래 값으로 복원 (다음 프레임에서 실행)
      setTimeout(() => {
        if (__DEV__) {
        }
        try {
          setTempYear(selectedYear);
          setTempMonth(selectedMonth);
          setTempDay(selectedDay);
          if (__DEV__) {
          }
          
          // 복원 완료 후 플래그 리셋
          setTimeout(() => {
            isClosingRef.current = false;
            if (__DEV__) {
            }
          }, 100);
        } catch (error) {
          if (__DEV__) {
            console.error('❌ [DatePicker] temp 값 복원 에러:', error);
          }
          isClosingRef.current = false;
        }
      }, 50);
    } catch (error) {
      if (__DEV__) {
        console.error('❌ [DatePicker] handleCancel 에러:', error);
      }
      isClosingRef.current = false;
      // 에러 발생 시에도 모달은 닫기
      onClose();
    }
  };
  
  const handleYearValueChange = (itemValue: number) => {
    const clamped = clampToOptions(itemValue, yearOptions);
    if (Platform.OS === 'android') {
      if (clamped !== undefined) {
        onYearChange?.(clamped);
      }
    } else {
      setTempYear(clamped);
      tempYearRef.current = clamped;
    }
  };
  
  const handleMonthValueChange = (itemValue: number) => {
    const clamped = clampToOptions(itemValue, monthOptions);
    if (Platform.OS === 'android') {
      if (clamped !== undefined) {
        onMonthChange?.(clamped);
      }
    } else {
      setTempMonth(clamped);
      tempMonthRef.current = clamped;
    }
  };
  
  const handleDayValueChange = (itemValue: number) => {
    const clamped = clampToOptions(itemValue, dayOptions);
    if (Platform.OS === 'android') {
      if (clamped !== undefined) {
        onDayChange?.(clamped);
      }
    } else {
      setTempDay(clamped);
      tempDayRef.current = clamped;
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
          onPress={() => {
            if (__DEV__) {
            }
            handleCancel();
          }}
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
            <Pressable 
              onPress={() => {
                if (__DEV__) {
                }
                onCancelPress?.();
                handleCancel();
              }} 
              style={styles.headerButton}
            >
              <Text style={[styles.cancelButton, { color: colors.textNeutral }]}>
                취소
              </Text>
            </Pressable>
            
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              {title}
            </Text>
            
            <Pressable 
              onPress={() => {
                if (__DEV__) {
                }
                onDonePress?.();
                handleDone();
              }} 
              style={styles.headerButton}
            >
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
                  itemStyle={iosWheelItemStyle}
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
              <View
                style={[
                  styles.pickerColumn,
                  pickerCount === 1 && styles.pickerColumnFull,
                ]}
              >
                <Picker
                  selectedValue={Platform.OS === 'ios' ? tempMonth : selectedMonth}
                  onValueChange={handleMonthValueChange}
                  style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
                  itemStyle={iosWheelItemStyle}
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
              <View
                style={[
                  styles.pickerColumn,
                  pickerCount === 1 && styles.pickerColumnFull,
                ]}
              >
                <Picker
                  selectedValue={Platform.OS === 'ios' ? tempDay : selectedDay}
                  onValueChange={handleDayValueChange}
                  style={[styles.iosPicker, { backgroundColor: colors.staticWhite }]}
                  itemStyle={iosWheelItemStyle}
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
    ...pretendardTextStyle('400'),
  },
  pickerTitle: {
    fontSize: 17,
    ...pretendardTextStyle('500'),
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    fontSize: 17,
    ...pretendardTextStyle('500'),
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
