/**
 * Memoized day cell for CalendarDaySelect (date picker).
 */

import { typographyLayout } from '@/constants/typography';
import { memo, useCallback } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const DAY_CELL_WIDTH = Math.floor(Dimensions.get('window').width / 7);
const DAY_CIRCLE_SIZE = 32;
const DAY_CIRCLE_RADIUS = DAY_CIRCLE_SIZE / 2;
const DAY_CELL_HEIGHT = 48;

export type CalendarDaySelectGridType = 'prev' | 'current' | 'next';

export interface CalendarDaySelectCellProps {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  gridType: CalendarDaySelectGridType;
  selectedDate?: string;
  disablePastDates: boolean;
  todayLocal: string;
  textAssistive: string;
  textNeutral: string;
  staticWhite: string;
  primary: string;
  onDayPress: (dateString: string) => void;
  onInvalidPastDate?: () => void;
}

function CalendarDaySelectCellComponent({
  date,
  day,
  isCurrentMonth,
  gridType,
  selectedDate,
  disablePastDates,
  todayLocal,
  textAssistive,
  textNeutral,
  staticWhite,
  primary,
  onDayPress,
  onInvalidPastDate,
}: CalendarDaySelectCellProps) {
  const isSelected = date === selectedDate;
  const isPast = disablePastDates && date < todayLocal;
  const isCurrentMonthForStyling = gridType === 'current' ? isCurrentMonth : true;

  const dayTextColor = isPast
    ? textAssistive
    : !isCurrentMonthForStyling
      ? textAssistive
      : isSelected
        ? staticWhite
        : textNeutral;

  const dayTextStyle = isPast
    ? styles.dayTextOtherMonth
    : !isCurrentMonthForStyling
      ? styles.dayTextOtherMonth
      : isSelected
        ? styles.dayTextSelected
        : styles.dayTextDefault;

  const handlePress = useCallback(() => {
    if (isPast) {
      onInvalidPastDate?.();
      return;
    }
    onDayPress(date);
  }, [date, isPast, onDayPress, onInvalidPastDate]);

  return (
    <View style={[styles.dayContainer, { width: DAY_CELL_WIDTH }]}>
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.dayPressable,
          Platform.OS === 'ios' && pressed && !isSelected && !isPast && styles.dayCirclePressed,
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
        disabled={isPast}
      >
        <View
          style={[
            styles.dayCircle,
            {
              backgroundColor: isSelected && !isPast ? primary : 'transparent',
            },
          ]}
        >
          <Text style={[dayTextStyle, { color: dayTextColor }]}>{day}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export const CalendarDaySelectCell = memo(CalendarDaySelectCellComponent);

const styles = StyleSheet.create({
  dayContainer: {
    height: DAY_CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
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
    ...typographyLayout.uiLineBody01Bold,
  },
  dayTextDefault: {
    ...typographyLayout.uiLineBody01Bold,
  },
  dayTextOtherMonth: {
    ...typographyLayout.uiLineBody01Medium,
  },
});
