/**
 * Home calendar day cell (memoized for month transitions).
 */

import { Typography } from '@/constants/theme';
import { recordCalendarDayCellMemoSkip } from '@/utils/calendar-month-debug';
import { memo, useCallback } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export const CALENDAR_DAY_CELL_WIDTH = Math.floor(Dimensions.get('window').width / 7);
const DAY_CELL_WIDTH = CALENDAR_DAY_CELL_WIDTH;
const DAY_CIRCLE_SIZE = 32;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;

export type CalendarDayGridType = 'prev' | 'current' | 'next';

export type CalendarDayCellAmountFontSizes = {
  expense?: number;
  income?: number;
};

export interface CalendarDayCellProps {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  gridType: CalendarDayGridType;
  dayCellHeight: number;
  isSelected: boolean;
  expenseLabel?: string | null;
  incomeLabel?: string | null;
  textAssistive: string;
  textNeutral: string;
  staticWhite: string;
  primary: string;
  onDayPress: (dateString: string) => void;
  /** 월 페이지에서 한 번 계산한 금액 fontSize (셀별 onLayout 생략) */
  amountFontSizes?: CalendarDayCellAmountFontSizes;
}

function CalendarDayCellComponent({
  date,
  day,
  isCurrentMonth,
  gridType,
  dayCellHeight,
  isSelected,
  expenseLabel,
  incomeLabel,
  textAssistive,
  textNeutral,
  staticWhite,
  primary,
  onDayPress,
  amountFontSizes,
}: CalendarDayCellProps) {
  const isCurrentMonthForStyling = gridType === 'current' ? isCurrentMonth : true;

  const dayTextColor = !isCurrentMonthForStyling
    ? textAssistive
    : isSelected
      ? staticWhite
      : textNeutral;

  const dayTextStyle = !isCurrentMonthForStyling
    ? styles.dayTextOtherMonth
    : isSelected
      ? styles.dayTextSelected
      : styles.dayTextDefault;

  const handlePress = useCallback(() => {
    onDayPress(date);
  }, [date, onDayPress]);

  const showExpense =
    isCurrentMonthForStyling && expenseLabel != null && expenseLabel.length > 0;
  const showIncome =
    isCurrentMonthForStyling && incomeLabel != null && incomeLabel.length > 0;

  return (
    <View style={[styles.dayContainer, { width: DAY_CELL_WIDTH, height: dayCellHeight }]}>
      <Pressable
        {...(Platform.OS === 'android'
          ? { onPressIn: handlePress }
          : { onPress: handlePress })}
        style={({ pressed }) => [
          styles.dayPressable,
          Platform.OS === 'ios' && pressed && !isSelected && styles.dayCirclePressed,
        ]}
        android_ripple={
          Platform.OS === 'android'
            ? {
                color: isSelected ? 'rgba(255, 255, 255, 0.35)' : 'rgba(54, 100, 206, 0.2)',
                radius: DAY_CIRCLE_RADIUS,
                borderless: false,
              }
            : undefined
        }
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={date}
      >
        <View
          style={[
            styles.dayCircle,
            { backgroundColor: isSelected ? primary : 'transparent' },
          ]}
        >
          <Text style={[dayTextStyle, { color: dayTextColor }]}>{day}</Text>
        </View>
      </Pressable>

      {(showExpense || showIncome) && (
        <View style={[styles.costContainer, { width: DAY_CELL_WIDTH }]}>
          {showExpense ? (
            <Text
              style={[
                styles.expenseText,
                amountFontSizes?.expense != null && { fontSize: amountFontSizes.expense },
              ]}
              numberOfLines={1}
            >
              {expenseLabel}
            </Text>
          ) : null}
          {showIncome ? (
            <Text
              style={[
                styles.incomeText,
                amountFontSizes?.income != null && { fontSize: amountFontSizes.income },
              ]}
              numberOfLines={1}
            >
              {incomeLabel}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

function calendarDayCellPropsAreEqual(
  prev: CalendarDayCellProps,
  next: CalendarDayCellProps,
): boolean {
  const equal =
    prev.date === next.date &&
    prev.day === next.day &&
    prev.isCurrentMonth === next.isCurrentMonth &&
    prev.gridType === next.gridType &&
    prev.dayCellHeight === next.dayCellHeight &&
    prev.isSelected === next.isSelected &&
    prev.expenseLabel === next.expenseLabel &&
    prev.incomeLabel === next.incomeLabel &&
    prev.onDayPress === next.onDayPress &&
    prev.textAssistive === next.textAssistive &&
    prev.textNeutral === next.textNeutral &&
    prev.staticWhite === next.staticWhite &&
    prev.primary === next.primary &&
    prev.amountFontSizes?.expense === next.amountFontSizes?.expense &&
    prev.amountFontSizes?.income === next.amountFontSizes?.income;

  if (__DEV__ && equal) {
    recordCalendarDayCellMemoSkip();
  }

  return equal;
}

export const CalendarDayCell = memo(CalendarDayCellComponent, calendarDayCellPropsAreEqual);

const styles = StyleSheet.create({
  dayContainer: {
    alignItems: 'center',
    paddingTop: 8,
  },
  dayPressable: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_RADIUS,
    overflow: 'hidden',
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCirclePressed: {
    opacity: 0.7,
  },
  dayTextSelected: {
    ...Typography.body1.l.bold,
  },
  dayTextDefault: {
    ...Typography.body1.l.bold,
  },
  dayTextOtherMonth: {
    ...Typography.body1.l.medium,
  },
  costContainer: {
    marginTop: 4,
    gap: 0,
    alignItems: 'center',
    minWidth: 0,
    overflow: 'visible',
  },
  expenseText: {
    ...Typography.tiny.r.regular,
    color: '#ef2a2a',
  },
  incomeText: {
    ...Typography.tiny.r.regular,
    color: '#058943',
  },
});
