/**
 * Memoized month grid page for CalendarMain (home) pager.
 */

import {
  CalendarDayCell,
  type CalendarDayGridType,
} from '@/components/ui/calendar-day-cell';
import type { CalendarGridCell, CalendarMonthSlot } from '@/utils/calendar-month-grid-cache';

export interface DayData {
  totalIncome?: number;
  totalExpense?: number;
  records?: {
    type: 'income' | 'expense';
    amount: number;
    category: string;
    memo?: string;
    timestamp: number;
  }[];
}
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

export type CalendarMainMonthPageColorProps = {
  textAssistive: string;
  textNeutral: string;
  staticWhite: string;
  primary: string;
};

export type CalendarMainMonthPageProps = {
  monthData: CalendarMonthSlot;
  gridType: CalendarDayGridType;
  dayCellHeight: number;
  selectedDate?: string;
  dayData: Record<string, DayData>;
  monthDayDataSignature: string;
  onDayPress: (dateString: string) => void;
  cellColorProps: CalendarMainMonthPageColorProps;
};

/** 해당 월 그리드 날짜만 집계 — 전체 dayData 참조 변경과 분리 */
export function buildMonthDayDataSignature(
  grid: CalendarGridCell[],
  dayData: Record<string, DayData>,
): string {
  let sig = '';
  for (let i = 0; i < grid.length; i += 1) {
    const date = grid[i].date;
    const record = dayData[date];
    sig += `${date}|${record?.totalExpense ?? 0}|${record?.totalIncome ?? 0};`;
  }
  return sig;
}

function CalendarMainMonthPageComponent({
  monthData,
  gridType,
  dayCellHeight,
  selectedDate,
  dayData,
  onDayPress,
  cellColorProps,
}: CalendarMainMonthPageProps) {
  return (
    <View style={styles.weeksContainer}>
      {monthData.grid.map((item, dayIndex) => (
        <CalendarDayCell
          key={`${gridType}-${item.date}-${dayIndex}`}
          date={item.date}
          day={item.day}
          isCurrentMonth={item.isCurrentMonth}
          gridType={gridType}
          dayCellHeight={dayCellHeight}
          isSelected={item.date === selectedDate}
          dayRecord={dayData[item.date]}
          onDayPress={onDayPress}
          {...cellColorProps}
        />
      ))}
    </View>
  );
}

function monthPagePropsAreEqual(
  prev: CalendarMainMonthPageProps,
  next: CalendarMainMonthPageProps,
): boolean {
  return (
    prev.gridType === next.gridType &&
    prev.dayCellHeight === next.dayCellHeight &&
    prev.monthData.year === next.monthData.year &&
    prev.monthData.month === next.monthData.month &&
    prev.monthData.grid === next.monthData.grid &&
    prev.selectedDate === next.selectedDate &&
    prev.monthDayDataSignature === next.monthDayDataSignature &&
    prev.onDayPress === next.onDayPress &&
    prev.cellColorProps.textAssistive === next.cellColorProps.textAssistive &&
    prev.cellColorProps.textNeutral === next.cellColorProps.textNeutral &&
    prev.cellColorProps.staticWhite === next.cellColorProps.staticWhite &&
    prev.cellColorProps.primary === next.cellColorProps.primary
  );
}

export const CalendarMainMonthPage = memo(
  CalendarMainMonthPageComponent,
  monthPagePropsAreEqual,
);

const styles = StyleSheet.create({
  weeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
