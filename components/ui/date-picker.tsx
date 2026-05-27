/**
 * Date Picker Component
 *
 * - iOS: bottom sheet + wheel picker (취소/완료)
 * - Android (년/월·년도): 스피너 휠 다이얼로그 — 년·월만 (시스템 DatePicker는 일 컬럼 제거 불가)
 * - Android (일 전용): 시스템 DatePickerDialog 스피너 (`DateTimePickerAndroid`)
 * - Android (비날짜 목록, 예: N개월): 년/월과 동일한 스피너 휠 다이얼로그
 */

import { AndroidSpinnerWheelColumn } from '@/components/ui/android-spinner-wheel-column';
import { colors, type ColorPalette } from '@/constants/theme';
import { getPlatformTypographySizes, typography, typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  buildNativePickerDate,
  isCustomListDayPicker,
  resolveNativePickerBounds,
  resolvePickerValue,
  shouldUseAndroidNativeDayPicker,
  shouldUseAndroidYearMonthSpinner,
} from '@/utils/android-date-picker';
import {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

/** Modal safe frame — statusBarTranslucent Modal 전체 높이 기준 flex 중앙 정렬 */
function getAndroidYearMonthFrameInsets(): { paddingTop: number; paddingBottom: number } {
  const metricsTop = initialWindowMetrics?.insets.top ?? 0;
  const paddingTop = metricsTop > 0 ? metricsTop : StatusBar.currentHeight ?? 0;
  const paddingBottom = initialWindowMetrics?.insets.bottom ?? 0;
  return { paddingTop, paddingBottom };
}

const ANDROID_YEAR_MONTH_FRAME_INSETS = getAndroidYearMonthFrameInsets();

export interface DatePickerOption {
  label: string;
  value: number;
}

export interface DatePickerProps {
  visible: boolean;
  onClose: () => void;
  onCancelPress?: () => void;
  onDonePress?: () => void;
  title?: string;
  yearOptions?: DatePickerOption[];
  selectedYear?: number;
  onYearChange?: (year: number) => void;
  /** 년·월을 한 번에 반영 (홈 리렌더 1회용, Android 확인 속도) */
  onYearMonthChange?: (year: number, month: number | undefined) => void;
  monthOptions?: DatePickerOption[];
  selectedMonth?: number;
  onMonthChange?: (month: number) => void;
  dayOptions?: DatePickerOption[];
  selectedDay?: number;
  onDayChange?: (day: number) => void;
  /** Android 일(day) 전용 네이티브 피커 기준 년·월 */
  referenceYear?: number;
  referenceMonth?: number;
  style?: ViewStyle;
}

export function DatePicker({
  visible,
  onClose,
  onCancelPress,
  onDonePress,
  title = '날짜 선택',
  yearOptions,
  selectedYear,
  onYearChange,
  onYearMonthChange,
  monthOptions,
  selectedMonth,
  onMonthChange,
  dayOptions,
  selectedDay,
  onDayChange,
  referenceYear,
  referenceMonth,
}: DatePickerProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const isAndroid = Platform.OS === 'android';
  const isIos = Platform.OS === 'ios';

  const isCustomListOnly = useMemo(
    () => isCustomListDayPicker(dayOptions, yearOptions, monthOptions),
    [dayOptions, yearOptions, monthOptions],
  );

  const isAndroidYearMonthSpinner = useMemo(
    () =>
      isAndroid &&
      shouldUseAndroidYearMonthSpinner(dayOptions, yearOptions, monthOptions, isCustomListOnly),
    [dayOptions, isAndroid, isCustomListOnly, monthOptions, yearOptions],
  );

  const isAndroidNativeDayPicker = useMemo(
    () =>
      isAndroid &&
      shouldUseAndroidNativeDayPicker(dayOptions, yearOptions, monthOptions, isCustomListOnly),
    [dayOptions, isAndroid, isCustomListOnly, monthOptions, yearOptions],
  );

  const wheelTypo = getPlatformTypographySizes('pickerWheel');
  const iosWheelItemStyle = isIos
    ? { color: palette.staticBlack, fontSize: wheelTypo.fontSize, lineHeight: wheelTypo.lineHeight }
    : undefined;

  const [tempYear, setTempYear] = useState<number | undefined>(() =>
    resolvePickerValue(selectedYear, yearOptions),
  );
  const [tempMonth, setTempMonth] = useState<number | undefined>(() =>
    resolvePickerValue(selectedMonth, monthOptions),
  );
  const [tempDay, setTempDay] = useState<number | undefined>(() =>
    resolvePickerValue(selectedDay, dayOptions),
  );
  const tempYearRef = useRef<number | undefined>(tempYear);
  const tempMonthRef = useRef<number | undefined>(tempMonth);
  const tempDayRef = useRef<number | undefined>(tempDay);

  const isClosingRef = useRef(false);
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const androidNativeOpenedRef = useRef(false);
  const prevVisibleRef = useRef(false);
  const androidScreenMinHeight = useMemo(() => Dimensions.get('screen').height, [visible]);

  const androidYearMonthFrameStyle = useMemo(
    () => ({
      flex: 1,
      minHeight: androidScreenMinHeight,
      paddingTop: ANDROID_YEAR_MONTH_FRAME_INSETS.paddingTop,
      paddingBottom: ANDROID_YEAR_MONTH_FRAME_INSETS.paddingBottom,
    }),
    [androidScreenMinHeight],
  );

  const dimOpacity = useRef(new Animated.Value(0)).current;
  const pickerTranslateY = useRef(new Animated.Value(300)).current;
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isClosingRef.current) {
      return;
    }
    if (visible) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        const nextYear = resolvePickerValue(selectedYear, yearOptions);
        const nextMonth = resolvePickerValue(selectedMonth, monthOptions);
        const nextDay = resolvePickerValue(selectedDay, dayOptions);
        setTempYear(nextYear);
        setTempMonth(nextMonth);
        setTempDay(nextDay);
        tempYearRef.current = nextYear;
        tempMonthRef.current = nextMonth;
        tempDayRef.current = nextDay;
      }
    } else {
      wasOpenRef.current = false;
      const nextYear = resolvePickerValue(selectedYear, yearOptions);
      const nextMonth = resolvePickerValue(selectedMonth, monthOptions);
      const nextDay = resolvePickerValue(selectedDay, dayOptions);
      setTempYear(nextYear);
      setTempMonth(nextMonth);
      setTempDay(nextDay);
      tempYearRef.current = nextYear;
      tempMonthRef.current = nextMonth;
      tempDayRef.current = nextDay;
    }
  }, [selectedYear, selectedMonth, selectedDay, visible, yearOptions, monthOptions, dayOptions]);

  useEffect(() => {
    if (!isIos) {
      return;
    }
    if (visible) {
      isClosingRef.current = false;
      dimOpacity.setValue(0);
      pickerTranslateY.setValue(300);
      Animated.parallel([
        Animated.timing(dimOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
        Animated.timing(pickerTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      isClosingRef.current = true;
      Animated.parallel([
        Animated.timing(dimOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(pickerTranslateY, { toValue: 300, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(() => {
          isClosingRef.current = false;
        }, 100);
      });
    }
  }, [visible, dimOpacity, pickerTranslateY, isIos]);

  const applyTempValues = useCallback(() => {
    const year = tempYearRef.current;
    const month = tempMonthRef.current;
    const day = tempDayRef.current;

    if (yearOptions?.length && year !== undefined) {
      const yearChanged = year !== selectedYear;
      const monthChanged =
        monthOptions?.length &&
        month !== undefined &&
        month !== selectedMonth;

      if (onYearMonthChange && (yearChanged || monthChanged)) {
        onYearMonthChange(year, monthOptions?.length ? month : undefined);
      } else {
        if (onYearChange && yearChanged) {
          onYearChange(year);
        }
        if (monthOptions?.length && onMonthChange && month !== undefined && monthChanged) {
          onMonthChange(month);
        }
      }
    }

    if (dayOptions?.length && onDayChange && day !== undefined && day !== selectedDay) {
      onDayChange(day);
    }
  }, [
    dayOptions,
    monthOptions,
    onDayChange,
    onMonthChange,
    onYearChange,
    onYearMonthChange,
    selectedDay,
    selectedMonth,
    selectedYear,
    yearOptions,
  ]);

  const closePicker = useCallback(() => {
    isClosingRef.current = true;
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }
    onClose();
    if (isIos) {
      setTimeout(() => {
        isClosingRef.current = false;
      }, 100);
      return;
    }
    isClosingRef.current = false;
  }, [isIos, onClose]);

  const applyNativeDayDate = useCallback(
    (date: Date) => {
      if (dayOptions?.length && onDayChange) {
        const day = resolvePickerValue(date.getDate(), dayOptions);
        if (day !== undefined) {
          onDayChange(day);
        }
      }
    },
    [dayOptions, onDayChange],
  );

  const handleAndroidNativeChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      androidNativeOpenedRef.current = false;

      if (event.type === 'dismissed') {
        onCancelPress?.();
        closePicker();
        return;
      }

      if (event.type === 'set' && date) {
        applyNativeDayDate(date);
        onDonePress?.();
        closePicker();
      }
    },
    [applyNativeDayDate, closePicker, onCancelPress, onDonePress],
  );

  const openAndroidNativeDatePicker = useCallback(() => {
    const value = buildNativePickerDate({
      selectedYear,
      selectedMonth,
      selectedDay,
      yearOptions,
      monthOptions,
      dayOptions,
      referenceYear,
      referenceMonth,
    });
    const { minimumDate, maximumDate } = resolveNativePickerBounds({
      yearOptions,
      dayOptions,
      referenceYear,
      referenceMonth,
    });

    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      display: 'spinner',
      minimumDate,
      maximumDate,
      onChange: handleAndroidNativeChange,
    });
  }, [
    dayOptions,
    handleAndroidNativeChange,
    monthOptions,
    referenceMonth,
    referenceYear,
    selectedDay,
    selectedMonth,
    selectedYear,
    yearOptions,
  ]);

  useEffect(() => {
    if (!isAndroid) {
      return;
    }

    const justOpened = visible && !prevVisibleRef.current;
    prevVisibleRef.current = visible;

    if (!visible) {
      androidNativeOpenedRef.current = false;
      return;
    }

    if (!justOpened || androidNativeOpenedRef.current) {
      return;
    }

    if (isCustomListOnly || isAndroidYearMonthSpinner) {
      return;
    }

    if (!isAndroidNativeDayPicker) {
      return;
    }

    androidNativeOpenedRef.current = true;
    openAndroidNativeDatePicker();
  }, [
    isAndroid,
    isAndroidNativeDayPicker,
    isAndroidYearMonthSpinner,
    isCustomListOnly,
    openAndroidNativeDatePicker,
    visible,
  ]);

  const handleDone = useCallback(() => {
    isClosingRef.current = true;
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }

    const finishIos = () => {
      applyTempValues();
      closePicker();
    };

    const finishAndroid = () => {
      closePicker();
      // 데이터 reload 없음 — 보기 년/월만 반영 (모달은 이미 닫힘)
      applyTempValues();
    };

    // iOS 휠 관성 대기 — Android는 모달 닫기와 년/월 반영을 같은 턴에 처리
    if (isIos) {
      applyTimerRef.current = setTimeout(finishIos, 150);
      return;
    }

    finishAndroid();
  }, [applyTempValues, closePicker, isIos]);

  const handleCancel = useCallback(() => {
    isClosingRef.current = true;
    if (applyTimerRef.current) {
      clearTimeout(applyTimerRef.current);
      applyTimerRef.current = null;
    }

    setTempYear(selectedYear);
    setTempMonth(selectedMonth);
    setTempDay(selectedDay);
    tempYearRef.current = selectedYear;
    tempMonthRef.current = selectedMonth;
    tempDayRef.current = selectedDay;
    closePicker();
  }, [closePicker, selectedDay, selectedMonth, selectedYear]);

  const handleYearValueChange = useCallback(
    (itemValue: number) => {
      const next = resolvePickerValue(itemValue, yearOptions);
      tempYearRef.current = next;
      // iOS Picker는 selectedValue(temp state)와 동기화 필요 — ref만 갱신 시 스크롤 후 되돌아감
      if (isIos) {
        setTempYear(next);
      }
    },
    [isIos, yearOptions],
  );

  const handleMonthValueChange = useCallback(
    (itemValue: number) => {
      const next = resolvePickerValue(itemValue, monthOptions);
      tempMonthRef.current = next;
      if (isIos) {
        setTempMonth(next);
      }
    },
    [isIos, monthOptions],
  );

  const handleDayValueChange = useCallback(
    (itemValue: number) => {
      const next = resolvePickerValue(itemValue, dayOptions);
      tempDayRef.current = next;
      if (isIos) {
        setTempDay(next);
      }
    },
    [dayOptions, isIos],
  );

  const pickerCount = [yearOptions, monthOptions, dayOptions].filter(
    (options) => options && options.length > 0,
  ).length;

  const renderIosPickerColumn = (
    options: DatePickerOption[],
    selected: number | undefined,
    onValueChange: (value: number) => void,
  ) => (
    <Picker
      selectedValue={selected}
      onValueChange={onValueChange}
      style={[styles.iosPicker, { backgroundColor: palette.staticWhite, color: palette.text }]}
      itemStyle={iosWheelItemStyle}
    >
      {options.map((option) => (
        <Picker.Item key={option.value} label={option.label} value={option.value} />
      ))}
    </Picker>
  );

  if (isAndroid && isAndroidYearMonthSpinner && visible) {
    return (
      <Modal
        visible
        transparent
        animationType="none"
        onRequestClose={handleCancel}
        statusBarTranslucent
        presentationStyle="overFullScreen"
      >
        <View style={[styles.androidYearMonthRoot, androidYearMonthFrameStyle]}>
          <Pressable
            style={styles.androidYearMonthDim}
            onPress={handleCancel}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          />
          <View
            style={[styles.androidYearMonthDialog, { backgroundColor: palette.background }]}
          >
          <Text style={[styles.androidYearMonthTitle, { color: palette.text }]}>{title}</Text>

          <View
            style={[
              styles.androidYearMonthSpinnerRow,
              { backgroundColor: palette.staticWhite },
            ]}
          >
            {yearOptions && yearOptions.length > 0 ? (
              <View
                style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}
              >
                <AndroidSpinnerWheelColumn
                  key={`year-${visible}-${tempYear ?? 'x'}`}
                  options={yearOptions}
                  value={tempYear}
                  onValueChange={handleYearValueChange}
                  active={visible}
                />
              </View>
            ) : null}

            {monthOptions && monthOptions.length > 0 ? (
              <View
                style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}
              >
                <AndroidSpinnerWheelColumn
                  key={`month-${visible}-${tempMonth ?? 'x'}`}
                  options={monthOptions}
                  value={tempMonth}
                  onValueChange={handleMonthValueChange}
                  active={visible}
                />
              </View>
            ) : null}

            {dayOptions && dayOptions.length > 0 ? (
              <View
                style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}
              >
                <AndroidSpinnerWheelColumn
                  key={`custom-${visible}-${tempDay ?? 'x'}`}
                  options={dayOptions}
                  value={tempDay}
                  onValueChange={handleDayValueChange}
                  active={visible}
                />
              </View>
            ) : null}
          </View>

          <View
            style={[
              styles.androidYearMonthActions,
              { borderTopColor: palette.border, backgroundColor: palette.fill },
            ]}
          >
            <Pressable
              onPress={() => {
                onCancelPress?.();
                handleCancel();
              }}
              style={styles.androidYearMonthActionButton}
              accessibilityRole="button"
              accessibilityLabel="취소"
            >
              <Text style={[styles.androidYearMonthCancel, { color: palette.textNeutral }]}>
                취소
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                handleDone();
                onDonePress?.();
              }}
              style={styles.androidYearMonthActionButton}
              accessibilityRole="button"
              accessibilityLabel="확인"
            >
              <Text style={[styles.androidYearMonthConfirm, { color: palette.primary }]}>
                확인
              </Text>
            </Pressable>
          </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (isAndroid) {
    return null;
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: dimOpacity }]}>
        <Pressable style={styles.backdrop} onPress={handleCancel} />
      </Animated.View>

      <Animated.View
        style={[styles.modalContent, { transform: [{ translateY: pickerTranslateY }] }]}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={[styles.pickerHeader, { backgroundColor: palette.background }]}>
            <Pressable
              onPress={() => {
                onCancelPress?.();
                handleCancel();
              }}
              style={styles.headerButton}
            >
              <Text style={[styles.cancelButton, { color: palette.textNeutral }]}>취소</Text>
            </Pressable>

            <Text style={[styles.pickerTitle, { color: palette.text }]}>{title}</Text>

            <Pressable
              onPress={() => {
                onDonePress?.();
                handleDone();
              }}
              style={styles.headerButton}
            >
              <Text style={[styles.doneButton, { color: palette.primary }]}>완료</Text>
            </Pressable>
          </View>

          <View style={styles.pickerRow}>
            {yearOptions && yearOptions.length > 0 ? (
              <View style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}>
                {renderIosPickerColumn(yearOptions, tempYear, handleYearValueChange)}
              </View>
            ) : null}

            {monthOptions && monthOptions.length > 0 ? (
              <View style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}>
                {renderIosPickerColumn(monthOptions, tempMonth, handleMonthValueChange)}
              </View>
            ) : null}

            {dayOptions && dayOptions.length > 0 ? (
              <View style={[styles.pickerColumn, pickerCount === 1 && styles.pickerColumnFull]}>
                {renderIosPickerColumn(dayOptions, tempDay, handleDayValueChange)}
              </View>
            ) : null}
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
  cancelButton: typographyLayout.pickerNavRegular,
  pickerTitle: {
    ...typographyLayout.pickerNavMedium,
    flex: 1,
    textAlign: 'center',
  },
  doneButton: {
    ...typographyLayout.pickerNavMedium,
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
  androidYearMonthRoot: {
    justifyContent: 'center',
  },
  androidYearMonthDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  androidYearMonthDialog: {
    marginHorizontal: 24,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    zIndex: 1,
  },
  androidYearMonthTitle: {
    ...typography.body1.l.bold,
    textAlign: 'center',
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  androidYearMonthSpinnerRow: {
    flexDirection: 'row',
    height: 240,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  androidYearMonthActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  androidYearMonthActionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    justifyContent: 'center',
  },
  androidYearMonthCancel: {
    ...typography.body1.l.medium,
  },
  androidYearMonthConfirm: {
    ...typography.body1.l.bold,
  },
});
