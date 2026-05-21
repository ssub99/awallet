/**
 * Home month view — income / expense / balance summary (isolated from calendar re-renders).
 */

import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
          style={styles.monthStatusItem}
          onPress={onIncomePress}
          accessibilityRole="button"
          accessibilityLabel="수입 기록하기"
        >
          <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>수입</Text>
          <Text style={[styles.monthStatusValue, { color: colors.text }]} numberOfLines={1}>
            {incomeText}
          </Text>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.monthStatusItem}
          onPress={onExpensePress}
          accessibilityRole="button"
          accessibilityLabel="소비 기록하기"
        >
          <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>소비</Text>
          <Text style={[styles.monthStatusValue, { color: colors.text }]} numberOfLines={1}>
            {expenseText}
          </Text>
        </Pressable>

        <View style={[styles.monthStatusDivider, { backgroundColor: colors.border }]} />

        <Pressable
          style={styles.monthStatusItem}
          onPress={onBalancePress}
          accessibilityRole="button"
          accessibilityLabel="챌린지 통계 소비 리포트 보기"
        >
          <Text style={[styles.monthStatusLabel, { color: colors.textNeutral }]}>잔액</Text>
          <Text
            style={[
              styles.monthStatusValue,
              {
                color: balanceNegative ? AtomicColors.red[500] : AtomicColors.green[600],
              },
            ]}
            numberOfLines={1}
          >
            {balanceText}
          </Text>
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
  monthStatusItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  monthStatusLabel: {
    ...Typography.detail.r.medium,
  },
  monthStatusValue: {
    ...Typography.body1.l.bold,
  },
  monthStatusDivider: {
    width: 1,
    height: 40,
  },
});
