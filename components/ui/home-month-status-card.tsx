/**
 * Home month view — income / expense / balance summary (isolated from calendar re-renders).
 */

import { computeUnifiedSingleLineFontSize } from '@/components/ui/auto-shrink-single-line-text';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { singleRowCenteredTextStyle } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logCalendarMonthDebug } from '@/utils/calendar-month-debug';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

const HOME_STATUS_CARD_DEBUG_TAG = '[HomeMonthStatusCard]';
const MONTH_STATUS_AMOUNT_HORIZONTAL_INSET = 4;
const MONTH_STATUS_AMOUNT_MIN_FONT_SCALE = 0.75;

const monthStatusCenteredText = {
  width: '100%' as const,
  textAlign: 'center' as const,
};

const monthStatusAmountTextStyle = Typography.body1.l.bold;

export interface HomeMonthStatusCardProps {
  incomeText: string;
  expenseText: string;
  balanceText: string;
  balanceNegative: boolean;
  onIncomePress: () => void;
  onExpensePress: () => void;
  onBalancePress: () => void;
}

function HomeMonthStatusCardInner({
  incomeText,
  expenseText,
  balanceText,
  balanceNegative,
  onIncomePress,
  onExpensePress,
  onBalancePress,
}: HomeMonthStatusCardProps) {
  const statusCardDebugSeqRef = useRef(0);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    logCalendarMonthDebug(HOME_STATUS_CARD_DEBUG_TAG, statusCardDebugSeqRef, 'render commit', {
      incomeText,
      expenseText,
      balanceText,
    });
  });
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const [amountColumnWidth, setAmountColumnWidth] = useState(0);

  const unifiedAmountFontSize = useMemo(
    () =>
      computeUnifiedSingleLineFontSize({
        texts: [incomeText, expenseText, balanceText],
        availableWidth: amountColumnWidth,
        textStyle: monthStatusAmountTextStyle,
        minFontScale: MONTH_STATUS_AMOUNT_MIN_FONT_SCALE,
        horizontalInset: MONTH_STATUS_AMOUNT_HORIZONTAL_INSET,
      }),
    [incomeText, expenseText, balanceText, amountColumnWidth],
  );

  const amountTextStyle = useMemo(
    () =>
      amountColumnWidth > 0
        ? [monthStatusAmountTextStyle, { fontSize: unifiedAmountFontSize }]
        : monthStatusAmountTextStyle,
    [amountColumnWidth, unifiedAmountFontSize],
  );

  const onAmountColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    setAmountColumnWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  return (
    <View style={[styles.monthStatusWrap, { backgroundColor: colors.fill }]}>
      <View style={[styles.monthStatusCard, { backgroundColor: colors.staticWhite }]}>
        <Pressable
          style={styles.monthStatusPressable}
          onPress={onIncomePress}
          accessibilityRole="button"
          accessibilityLabel="수입 기록하기"
        >
          <View style={styles.monthStatusItem} onLayout={onAmountColumnLayout}>
            <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>수입</Text>
            <Text
              style={[amountTextStyle, monthStatusCenteredText, { color: colors.text }]}
              numberOfLines={1}
            >
              {incomeText}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.monthStatusPressable}
          onPress={onExpensePress}
          accessibilityRole="button"
          accessibilityLabel="소비 기록하기"
        >
          <View style={styles.monthStatusItem}>
            <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>소비</Text>
            <Text
              style={[amountTextStyle, monthStatusCenteredText, { color: colors.text }]}
              numberOfLines={1}
            >
              {expenseText}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.monthStatusPressable}
          onPress={onBalancePress}
          accessibilityRole="button"
          accessibilityLabel="챌린지 통계 소비 리포트 보기"
        >
          <View style={styles.monthStatusItem}>
            <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>잔액</Text>
            <Text
              style={[
                amountTextStyle,
                monthStatusCenteredText,
                {
                  color: balanceNegative ? AtomicColors.red[500] : AtomicColors.green[600],
                },
              ]}
              numberOfLines={1}
            >
              {balanceText}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export const HomeMonthStatusCard = memo(HomeMonthStatusCardInner);

const styles = StyleSheet.create({
  monthStatusWrap: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  monthStatusCard: {
    height: 78,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    overflow: 'visible',
  },
  monthStatusPressable: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    overflow: 'visible',
  },
  monthStatusItem: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 0,
    overflow: 'visible',
  },
  monthStatusLabel: {
    ...singleRowCenteredTextStyle(Typography.detail.r.medium),
    ...monthStatusCenteredText,
  },
  monthStatusDivider: {
    width: 1,
    height: 40,
  },
});
