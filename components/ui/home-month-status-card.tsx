/**
 * Home month view — income / expense / balance summary (isolated from calendar re-renders).
 */

import { computeUnifiedSingleLineFontSize } from '@/components/ui/auto-shrink-single-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, type ColorPalette } from '@/constants/theme';
import { scaleTextStyleFontSize, typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { memo, useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

const MONTH_STATUS_AMOUNT_HORIZONTAL_INSET = 4;
const MONTH_STATUS_AMOUNT_MIN_FONT_SCALE = 0.75;

const monthStatusCenteredText = {
  width: '100%' as const,
  textAlign: 'center' as const,
};

const monthStatusAmountTextStyle = typographyLayout.monthStatusAmount;

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
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

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
        ? scaleTextStyleFontSize(monthStatusAmountTextStyle, unifiedAmountFontSize)
        : monthStatusAmountTextStyle,
    [amountColumnWidth, unifiedAmountFontSize],
  );

  const onAmountColumnLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    setAmountColumnWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  return (
    <View style={[styles.monthStatusWrap, { backgroundColor: palette.fill }]}>
      <View style={[styles.monthStatusCard, { backgroundColor: palette.staticWhite }]}>
        <Pressable
          style={styles.monthStatusPressable}
          onPress={onIncomePress}
          accessibilityRole="button"
          accessibilityLabel="수입 기록하기"
        >
          <View style={styles.monthStatusItem} onLayout={onAmountColumnLayout}>
            <Text style={[styles.monthStatusLabel, { color: palette.textNeutral }]}>수입</Text>
            <Text
              style={[amountTextStyle, monthStatusCenteredText, { color: palette.text }]}
              numberOfLines={1}
            >
              {incomeText}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: palette.border }]} />

        <Pressable
          style={styles.monthStatusPressable}
          onPress={onExpensePress}
          accessibilityRole="button"
          accessibilityLabel="소비 기록하기"
        >
          <View style={styles.monthStatusItem}>
            <Text style={[styles.monthStatusLabel, { color: palette.textNeutral }]}>소비</Text>
            <Text
              style={[amountTextStyle, monthStatusCenteredText, { color: palette.text }]}
              numberOfLines={1}
            >
              {expenseText}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: palette.border }]} />

        <Pressable
          style={styles.monthStatusPressable}
          onPress={onBalancePress}
          accessibilityRole="button"
          accessibilityLabel="챌린지 통계 소비 리포트 보기"
        >
          <View style={styles.monthStatusItem}>
            <Text style={[styles.monthStatusLabel, { color: palette.textNeutral }]}>잔액</Text>
            <Text
              style={[
                amountTextStyle,
                monthStatusCenteredText,
                {
                  color: balanceNegative ? atomicColors.red[500] : atomicColors.green[600],
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
    ...typographyLayout.monthStatusLabel,
    ...monthStatusCenteredText,
  },
  monthStatusDivider: {
    width: 1,
    height: 40,
  },
});
