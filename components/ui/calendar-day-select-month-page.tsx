/**
 * Memoized month grid page for CalendarDaySelect pager.
 */

import {
  CalendarDaySelectCell,
  type CalendarDaySelectGridType,
} from '@/components/ui/calendar-day-select-cell';
import type { CalendarMonthSlot } from '@/utils/calendar-month-grid-cache';
import { memo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DAY_CELLS_AREA_HEIGHT = 288;

export type CalendarDaySelectMonthPageColorProps = {
  textAssistive: string;
  textNeutral: string;
  staticWhite: string;
  primary: string;
};

export type CalendarDaySelectMonthPageProps = {
  monthData: CalendarMonthSlot;
  gridType: CalendarDaySelectGridType;
  showSettlePlaceholder: boolean;
  selectedDate?: string;
  disablePastDates: boolean;
  todayLocal: string;
  onDayPress: (dateString: string) => void;
  onInvalidPastDate?: () => void;
  cellColorProps: CalendarDaySelectMonthPageColorProps;
};

function CalendarDaySelectMonthPageComponent({
  monthData,
  gridType,
  showSettlePlaceholder,
  selectedDate,
  disablePastDates,
  todayLocal,
  onDayPress,
  onInvalidPastDate,
  cellColorProps,
}: CalendarDaySelectMonthPageProps) {
  if (showSettlePlaceholder) {
    return <View style={styles.monthPageSettlePlaceholder} />;
  }

  return (
    <View style={styles.weeksContainer}>
      {monthData.grid.map((item, dayIndex) => (
        <CalendarDaySelectCell
          key={`${gridType}-${item.date}-${dayIndex}`}
          date={item.date}
          day={item.day}
          isCurrentMonth={item.isCurrentMonth}
          gridType={gridType}
          selectedDate={selectedDate}
          disablePastDates={disablePastDates}
          todayLocal={todayLocal}
          onDayPress={onDayPress}
          onInvalidPastDate={onInvalidPastDate}
          {...cellColorProps}
        />
      ))}
    </View>
  );
}

function monthPagePropsAreEqual(
  prev: CalendarDaySelectMonthPageProps,
  next: CalendarDaySelectMonthPageProps,
): boolean {
  return (
    prev.showSettlePlaceholder === next.showSettlePlaceholder &&
    prev.gridType === next.gridType &&
    prev.monthData.year === next.monthData.year &&
    prev.monthData.month === next.monthData.month &&
    prev.monthData.grid === next.monthData.grid &&
    prev.selectedDate === next.selectedDate &&
    prev.disablePastDates === next.disablePastDates &&
    prev.todayLocal === next.todayLocal &&
    prev.onDayPress === next.onDayPress &&
    prev.onInvalidPastDate === next.onInvalidPastDate &&
    prev.cellColorProps.textAssistive === next.cellColorProps.textAssistive &&
    prev.cellColorProps.textNeutral === next.cellColorProps.textNeutral &&
    prev.cellColorProps.staticWhite === next.cellColorProps.staticWhite &&
    prev.cellColorProps.primary === next.cellColorProps.primary
  );
}

export const CalendarDaySelectMonthPage = memo(
  CalendarDaySelectMonthPageComponent,
  monthPagePropsAreEqual,
);

const styles = StyleSheet.create({
  monthPageSettlePlaceholder: {
    height: DAY_CELLS_AREA_HEIGHT,
    width: SCREEN_WIDTH,
  },
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
