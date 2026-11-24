/**
 * Home month view — income / expense / balance summary (isolated from calendar re-renders).
 */

import { computeUnifiedSingleLineFontSize } from '@/components/ui/auto-shrink-single-line-text';
import { CountUpText } from '@/components/ui/count-up-text';
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

/** 카운트업 중 표시 문자열 (최종 문자열 incomeText/expenseText/balanceText와 같은 규칙) */
const formatIncome = (amount: number) => (amount > 0 ? `+ ${amount.toLocaleString()}원` : '0원');
const formatExpense = (amount: number) => (amount > 0 ? `- ${amount.toLocaleString()}원` : '0원');
const formatBalance = (amount: number) => {
  if (amount === 0) return '0원';
  if (amount < 0) return `- ${Math.abs(amount).toLocaleString()}원`;
  return `${amount.toLocaleString()}원`;
};

/** 홈으로 돌아온 뒤 카운트업이 시작되기까지의 지연 */
const COUNT_UP_START_DELAY_MS = 1000;

export interface HomeMonthStatusCardProps {
  /** 최종 표시 문자열 — 글자 크기 통일 계산 기준 (카운트업 중에도 크기가 흔들리지 않게) */
  incomeText: string;
  expenseText: string;
  balanceText: string;
  /** 카운트업 대상 금액 (원) */
  incomeAmount: number;
  expenseAmount: number;
  balanceAmount: number;
  /** 카운트업 허용(홈 포커스 중). 홈이 다시 보이면 1초 뒤 이전 금액에서 새 금액으로 올라간다 */
  countUpActive: boolean;
  balanceNegative: boolean;
  onIncomePress: () => void;
  onExpensePress: () => void;
  onBalancePress: () => void;
}

function HomeMonthStatusCardInner({
  incomeText,
  expenseText,
  balanceText,
  incomeAmount,
  expenseAmount,
  balanceAmount,
  countUpActive,
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
            <CountUpText
              value={incomeAmount}
              active={countUpActive}
              startDelayMs={COUNT_UP_START_DELAY_MS}
              format={formatIncome}
              style={[amountTextStyle, monthStatusCenteredText, { color: palette.text }]}
              numberOfLines={1}
            />
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
            <CountUpText
              value={expenseAmount}
              active={countUpActive}
              startDelayMs={COUNT_UP_START_DELAY_MS}
              format={formatExpense}
              style={[amountTextStyle, monthStatusCenteredText, { color: palette.text }]}
              numberOfLines={1}
            />
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
            <CountUpText
              value={balanceAmount}
              active={countUpActive}
              startDelayMs={COUNT_UP_START_DELAY_MS}
              format={formatBalance}
              style={[
                amountTextStyle,
                monthStatusCenteredText,
                {
                  color: balanceNegative ? atomicColors.red[500] : atomicColors.green[600],
                },
              ]}
              numberOfLines={1}
            />
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
    ...typographyLayout.uiLineDetailMedium,
    ...monthStatusCenteredText,
  },
  monthStatusDivider: {
    width: 1,
    height: 40,
  },
});
