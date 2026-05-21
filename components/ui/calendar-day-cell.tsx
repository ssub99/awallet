/**
 * Home calendar day cell (memoized for month transitions).
 */

import { Typography } from '@/constants/theme';
import { memo, useCallback } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export interface CalendarDayRecord {
  totalIncome?: number;
  totalExpense?: number;
}

const DAY_CELL_WIDTH = Math.floor(Dimensions.get('window').width / 7);
const DAY_CIRCLE_SIZE = 32;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;

export type CalendarDayGridType = 'prev' | 'current' | 'next';

export interface CalendarDayCellProps {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  gridType: CalendarDayGridType;
  dayCellHeight: number;
  isSelected: boolean;
  dayRecord?: CalendarDayRecord;
  textAssistive: string;
  textNeutral: string;
  staticWhite: string;
  primary: string;
  onDayPress: (dateString: string) => void;
}

function formatCurrency(num: number): string {
  return num.toLocaleString('ko-KR');
}

function CalendarDayCellComponent({
  date,
  day,
  isCurrentMonth,
  gridType,
  dayCellHeight,
  isSelected,
  dayRecord,
  textAssistive,
  textNeutral,
  staticWhite,
  primary,
  onDayPress,
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
    isCurrentMonthForStyling &&
    dayRecord?.totalExpense !== undefined &&
    dayRecord.totalExpense > 0;
  const showIncome =
    isCurrentMonthForStyling &&
    dayRecord?.totalIncome !== undefined &&
    dayRecord.totalIncome > 0;

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
        <View style={styles.costContainer}>
          {showExpense ? (
            <Text style={styles.expenseText} numberOfLines={1} ellipsizeMode="tail">
              {formatCurrency(dayRecord!.totalExpense!)}
            </Text>
          ) : null}
          {showIncome ? (
            <Text style={styles.incomeText} numberOfLines={1} ellipsizeMode="tail">
              {formatCurrency(dayRecord!.totalIncome!)}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

export const CalendarDayCell = memo(CalendarDayCellComponent);

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
