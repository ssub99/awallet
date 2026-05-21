/**
 * Home month view — income / expense / balance summary (isolated from calendar re-renders).
 */

import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography, TypographyScale } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextLayoutEventData,
  View,
} from 'react-native';

const MONTH_STATUS_AMOUNT_MIN_FONT_SCALE = 0.7;

const BODY01_METRICS = TypographyScale.body01.ios;
const BASE_FONT_SIZE = BODY01_METRICS.fontSize;
const BASE_LINE_HEIGHT = BODY01_METRICS.lineHeight;
const LINE_HEIGHT_RATIO = BASE_LINE_HEIGHT / BASE_FONT_SIZE;
const MIN_FONT_SIZE = BASE_FONT_SIZE * MONTH_STATUS_AMOUNT_MIN_FONT_SCALE;

const MonthStatusAmountText = memo(function MonthStatusAmountText({
  children,
  color,
}: {
  children: string;
  color: string;
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [fontSize, setFontSize] = useState(BASE_FONT_SIZE);

  useEffect(() => {
    setFontSize(BASE_FONT_SIZE);
  }, [children, containerWidth]);

  const onWrapLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.floor(event.nativeEvent.layout.width);
    setContainerWidth((prev) => (prev === nextWidth ? prev : nextWidth));
  }, []);

  const onTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (containerWidth <= 0) return;
      const line = event.nativeEvent.lines[0];
      if (!line) return;

      const textWidth = line.width;
      if (textWidth <= containerWidth + 0.5) {
        return;
      }

      setFontSize((current) => {
        const scaled = Math.max(
          MIN_FONT_SIZE,
          (containerWidth / textWidth) * current,
        );
        const rounded = Math.floor(scaled * 10) / 10;
        return Math.abs(current - rounded) < 0.05 ? current : rounded;
      });
    },
    [containerWidth],
  );

  const dynamicMetrics = useMemo(
    () => ({
      fontSize,
      lineHeight: Math.round(fontSize * LINE_HEIGHT_RATIO),
    }),
    [fontSize],
  );

  return (
    <View style={styles.monthStatusValueWrap} onLayout={onWrapLayout}>
      <Text
        style={[styles.monthStatusValue, dynamicMetrics, { color }]}
        numberOfLines={1}
        onTextLayout={onTextLayout}
      >
        {children}
      </Text>
    </View>
  );
});

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
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  return (
    <View style={[styles.monthStatusWrap, { backgroundColor: colors.fill }]}>
      <View style={[styles.monthStatusCard, { backgroundColor: colors.staticWhite }]}>
        <Pressable
          style={styles.monthStatusPressable}
          onPress={onIncomePress}
          accessibilityRole="button"
          accessibilityLabel="수입 기록하기"
        >
          <View style={styles.monthStatusItem}>
            <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>수입</Text>
            <MonthStatusAmountText color={colors.text}>{incomeText}</MonthStatusAmountText>
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
            <MonthStatusAmountText color={colors.text}>{expenseText}</MonthStatusAmountText>
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
            <MonthStatusAmountText
              color={balanceNegative ? AtomicColors.red[500] : AtomicColors.green[600]}
            >
              {balanceText}
            </MonthStatusAmountText>
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
  },
  monthStatusPressable: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
  },
  monthStatusItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  monthStatusLabel: {
    ...Typography.detail.r.medium,
  },
  monthStatusValueWrap: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  monthStatusValue: {
    ...Typography.body1.l.bold,
    textAlign: 'center',
  },
  monthStatusDivider: {
    width: 1,
    height: 40,
  },
});
