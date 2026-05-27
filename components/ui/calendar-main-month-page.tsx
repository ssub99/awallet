/**
 * Memoized month grid page for CalendarMain (home) pager.
 */

import {
  CALENDAR_DAY_CELL_WIDTH,
  CalendarDayCell,
  type CalendarDayCellAmountFontSizes,
  type CalendarDayGridType,
} from '@/components/ui/calendar-day-cell';
import { computeUnifiedSingleLineFontSize } from '@/components/ui/auto-shrink-single-line-text';
import { typographyLayout } from '@/constants/typography';
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
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

export type CalendarDayCellDescriptor = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isSelected: boolean;
  expenseLabel: string | null;
  incomeLabel: string | null;
};

const EMPTY_DAY_DATA: Record<string, DayData> = {};
export { EMPTY_DAY_DATA };

const MONTH_PAGE_AMOUNT_STYLE = typographyLayout.calendarAmount;
const MONTH_PAGE_AMOUNT_HORIZONTAL_INSET = 2;
const MONTH_PAGE_AMOUNT_MIN_FONT_SCALE = 0.55;

function formatMonthPageCurrency(num: number): string {
  return num.toLocaleString('ko-KR');
}

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
  /** 스와이프 정착 중 pager 셀 — 3달 전체 렌더 대신 빈 영역 */
  showSettlePlaceholder?: boolean;
  settlePlaceholderHeight?: number;
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

type MonthDaySignatureCacheEntry = {
  grid: CalendarGridCell[];
  dayDataEpoch: string;
  signature: string;
};

const monthDaySignatureCache = new Map<string, MonthDaySignatureCacheEntry>();

/** 슬롯별 signature — 동일 월·grid·dayDataEpoch이면 재계산 생략 */
export function clearMonthDayDataSignatureCache(): void {
  monthDaySignatureCache.clear();
}

function resolveSlotMonthDayDataSignature(
  slot: CalendarMonthSlot,
  dayData: Record<string, DayData>,
  dayDataEpoch: string,
): { signature: string; cacheHit: boolean } {
  const slotKey = `${slot.year}-${slot.month}`;
  const cached = monthDaySignatureCache.get(slotKey);
  if (cached && cached.grid === slot.grid && cached.dayDataEpoch === dayDataEpoch) {
    return { signature: cached.signature, cacheHit: true };
  }
  const signature = buildMonthDayDataSignature(slot.grid, dayData);
  monthDaySignatureCache.set(slotKey, { grid: slot.grid, dayDataEpoch, signature });
  return { signature, cacheHit: false };
}

export function resolveMonthDayDataSignatures(
  slots: CalendarMonthSlot[],
  dayData: Record<string, DayData>,
  dayDataEpoch: string,
): { signatures: string[]; cacheHits: number; cacheMisses: number } {
  let cacheHits = 0;
  let cacheMisses = 0;
  const signatures = slots.map((slot) => {
    const { signature, cacheHit } = resolveSlotMonthDayDataSignature(slot, dayData, dayDataEpoch);
    if (cacheHit) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
    }
    return signature;
  });
  return { signatures, cacheHits, cacheMisses };
}

/** 중앙 슬롯 signature만 계산 — prev/next는 lite·memo에서 미사용 */
export function resolveCalendarPagerDayDataSignatures(
  slots: CalendarMonthSlot[],
  centerSlotIndex: number,
  dayData: Record<string, DayData>,
  dayDataEpoch: string,
): { signatures: string[]; cacheHits: number; cacheMisses: number } {
  let cacheHits = 0;
  let cacheMisses = 0;
  const signatures = slots.map((slot, index) => {
    if (index !== centerSlotIndex) {
      return '';
    }
    const { signature, cacheHit } = resolveSlotMonthDayDataSignature(slot, dayData, dayDataEpoch);
    if (cacheHit) {
      cacheHits += 1;
    } else {
      cacheMisses += 1;
    }
    return signature;
  });
  return { signatures, cacheHits, cacheMisses };
}

function CalendarMainMonthPageComponent({
  monthData,
  gridType,
  dayCellHeight,
  showSettlePlaceholder = false,
  settlePlaceholderHeight,
  selectedDate,
  dayData,
  monthDayDataSignature,
  onDayPress,
  cellColorProps,
}: CalendarMainMonthPageProps) {
  const showAmounts = gridType === 'current';

  const { amountFontSizes, cellDescriptors } = useMemo(() => {
    if (showSettlePlaceholder) {
      return { amountFontSizes: undefined, cellDescriptors: [] as CalendarDayCellDescriptor[] };
    }

    const { grid } = monthData;
    const descriptors: CalendarDayCellDescriptor[] = new Array(grid.length);

    if (!showAmounts) {
      for (let i = 0; i < grid.length; i += 1) {
        const item = grid[i];
        descriptors[i] = {
          date: item.date,
          day: item.day,
          isCurrentMonth: item.isCurrentMonth,
          isSelected: item.date === selectedDate,
          expenseLabel: null,
          incomeLabel: null,
        };
      }
      return { amountFontSizes: undefined, cellDescriptors: descriptors };
    }

    const expenseTexts: string[] = [];
    const incomeTexts: string[] = [];

    for (let i = 0; i < grid.length; i += 1) {
      const item = grid[i];
      let expenseLabel: string | null = null;
      let incomeLabel: string | null = null;

      if (item.isCurrentMonth) {
        const record = dayData[item.date];
        if (record?.totalExpense != null && record.totalExpense > 0) {
          expenseLabel = formatMonthPageCurrency(record.totalExpense);
          expenseTexts.push(expenseLabel);
        }
        if (record?.totalIncome != null && record.totalIncome > 0) {
          incomeLabel = formatMonthPageCurrency(record.totalIncome);
          incomeTexts.push(incomeLabel);
        }
      }

      descriptors[i] = {
        date: item.date,
        day: item.day,
        isCurrentMonth: item.isCurrentMonth,
        isSelected: item.date === selectedDate,
        expenseLabel,
        incomeLabel,
      };
    }

    return {
      amountFontSizes: {
        expense:
          expenseTexts.length > 0
            ? computeUnifiedSingleLineFontSize({
                texts: expenseTexts,
                availableWidth: CALENDAR_DAY_CELL_WIDTH,
                textStyle: MONTH_PAGE_AMOUNT_STYLE,
                minFontScale: MONTH_PAGE_AMOUNT_MIN_FONT_SCALE,
                horizontalInset: MONTH_PAGE_AMOUNT_HORIZONTAL_INSET,
              })
            : undefined,
        income:
          incomeTexts.length > 0
            ? computeUnifiedSingleLineFontSize({
                texts: incomeTexts,
                availableWidth: CALENDAR_DAY_CELL_WIDTH,
                textStyle: MONTH_PAGE_AMOUNT_STYLE,
                minFontScale: MONTH_PAGE_AMOUNT_MIN_FONT_SCALE,
                horizontalInset: MONTH_PAGE_AMOUNT_HORIZONTAL_INSET,
              })
            : undefined,
      },
      cellDescriptors: descriptors,
    };
  }, [showAmounts, showSettlePlaceholder, monthDayDataSignature, monthData, dayData, selectedDate]);

  if (showSettlePlaceholder) {
    return (
      <View
        style={{
          height: settlePlaceholderHeight ?? dayCellHeight * 5,
          width: '100%',
        }}
      />
    );
  }

  return (
    <View style={styles.weeksContainer}>
      {cellDescriptors.map((cell) => (
        <CalendarDayCell
          key={cell.date}
          date={cell.date}
          day={cell.day}
          isCurrentMonth={cell.isCurrentMonth}
          gridType={gridType}
          dayCellHeight={dayCellHeight}
          isSelected={cell.isSelected}
          expenseLabel={cell.expenseLabel}
          incomeLabel={cell.incomeLabel}
          amountFontSizes={amountFontSizes}
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
    prev.showSettlePlaceholder === next.showSettlePlaceholder &&
    prev.settlePlaceholderHeight === next.settlePlaceholderHeight &&
    prev.gridType === next.gridType &&
    prev.dayCellHeight === next.dayCellHeight &&
    prev.monthData.year === next.monthData.year &&
    prev.monthData.month === next.monthData.month &&
    prev.monthData.grid === next.monthData.grid &&
    prev.selectedDate === next.selectedDate &&
    (prev.gridType !== 'current' && next.gridType !== 'current'
      ? true
      : prev.monthDayDataSignature === next.monthDayDataSignature) &&
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
