/**
 * Year View Component
 * 
 * Displays monthly summary cards for the entire year.
 * Shows consumption ratio, amount, and status for each month.
 */

import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

export interface MonthData {
  month: number; // 1-12
  income: number; // 수입 금액
  expense: number; // 소비 금액
}

export interface YearViewProps {
  year: number;
  monthsData: MonthData[];
  initialMonth?: number; // 초기 스크롤 위치 (월)
  onMonthPress?: (month: number) => void;
  /** 설정 시 월 카드 탭에 `list` 이벤트(`target: yearcard`) 전송 */
  yearCardAnalyticsScreenName?: string;
}

export interface YearViewRef {
  scrollToMonth: (month: number, animated?: boolean) => void;
}

/**
 * Year View Component
 */
export const YearView = forwardRef<YearViewRef, YearViewProps>(
  ({ year, monthsData, initialMonth, onMonthPress, yearCardAnalyticsScreenName }, ref) => {
    const colorScheme = useColorScheme();
    const palette = colors[colorScheme ?? 'light'] as ColorPalette;
    const scrollViewRef = useRef<ScrollView>(null);

    // 1월부터 12월까지 정렬
    const sortedData = [...monthsData].sort((a, b) => a.month - b.month);

    // 카드 높이 + 간격
    const CARD_HEIGHT = 147;
    const CARD_GAP = 16;
    const CARD_TOTAL_HEIGHT = CARD_HEIGHT + CARD_GAP;

    // 특정 월로 스크롤하는 메서드 노출
    useImperativeHandle(ref, () => ({
      scrollToMonth: (month: number, animated: boolean = true) => {
        // 1월 = index 0, 2월 = index 1, ..., 12월 = index 11
        const index = month - 1;
        const yOffset = index * CARD_TOTAL_HEIGHT;
        
        scrollViewRef.current?.scrollTo({
          y: yOffset,
          animated,
        });
      },
    }));

    // 초기 마운트 시 initialMonth가 있으면 즉시 그 위치로 (애니메이션 없이)
    // 이후 외부(home.tsx)에서 애니메이션으로 목표 위치로 이동
    useEffect(() => {
      if (initialMonth !== undefined) {
        const index = initialMonth - 1;
        const yOffset = index * CARD_TOTAL_HEIGHT;
        
        // 렌더링 즉시 해당 위치로 이동 (애니메이션 없음)
        requestAnimationFrame(() => {
          scrollViewRef.current?.scrollTo({
            y: yOffset,
            animated: false,
          });
        });
      }
    }, [CARD_TOTAL_HEIGHT, initialMonth]); // 마운트 시 1회만

    return (
      <ScrollView 
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
      >
        {sortedData.map((data) => (
          <MonthCard
            key={data.month}
            data={data}
            colors={palette}
            yearCardAnalyticsScreenName={yearCardAnalyticsScreenName}
            onPress={
              onMonthPress
                ? () => {
                    onMonthPress(data.month);
                  }
                : undefined
            }
          />
        ))}
      </ScrollView>
    );
  }
);

/**
 * Month Card Component
 */
interface MonthCardProps {
  data: MonthData;
  colors: ColorPalette;
  yearCardAnalyticsScreenName?: string;
  onPress?: () => void;
}

function MonthCard({ data, colors, yearCardAnalyticsScreenName, onPress }: MonthCardProps) {
  // 수입대비 소비율 계산
  const calculateRatio = (): number => {
    if (data.income === 0) return 0;
    return (data.expense / data.income) * 100;
  };

  const ratio = calculateRatio();
  const hasIncome = data.income > 0;

  // 상태 판단 (수입 금액 기준)
  const getStatus = () => {
    if (!hasIncome) {
      // 수입 금액 없음 → NONE
      return { emoji: '🗑️', text: 'NONE', color: '#9E9E9E', textColor: '#f5f5f5' };
    }
    if (ratio <= 100) {
      // 소비율 ≤ 100% → GOOD (100% 포함)
      return { emoji: '👍', text: 'GOOD', color: '#20C565', textColor: '#e6fff1' };
    }
    // 소비율 > 100% → BAD
    return { emoji: '😭', text: 'BAD', color: '#EF5252', textColor: '#fbe9e9' };
  };

  const status = getStatus();

  // 금액 포맷
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원';
  };

  // 비율 포맷
  const formatRatio = (ratio: number) => {
    return ratio.toFixed(1) + '%';
  };

  const handlePress = useCallback(() => {
    if (!onPress) {
      return;
    }
    if (yearCardAnalyticsScreenName) {
      void logEvent('list', {
        screen_name: yearCardAnalyticsScreenName,
        target: 'yearcard',
      });
    }
    void Haptics.selectionAsync();
    onPress();
  }, [onPress, yearCardAnalyticsScreenName]);

  const cardContent = (
    <View style={[styles.cardContent, { backgroundColor: status.color }]}>
      {/* 헤더 */}
      <View style={styles.cardHeader}>
        <Text style={styles.monthText}>{data.month}월</Text>
        <Text style={styles.statusText}>
          {status.emoji} {status.text}
        </Text>
      </View>

      {/* 정보 */}
      <View style={styles.cardInfo}>
        {/* 수입대비 소비율 */}
        <View style={styles.infoLeft}>
          <Text style={[styles.infoLabel, { color: status.textColor }]}>
            수입대비 소비율
          </Text>
          <Text style={styles.infoValue}>
            {hasIncome ? formatRatio(ratio) : '0%'}
          </Text>
        </View>

        {/* 이번달 소비 금액 */}
        <View style={styles.infoRight}>
          <Text style={[styles.infoLabel, { color: status.textColor }]}>
            이번달 소비 금액
          </Text>
          <Text style={[styles.infoValue, styles.infoValueRight]}>
            {data.expense > 0 ? formatAmount(data.expense) : '없음'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (!onPress) {
    return cardContent;
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${data.month}월 타임라인으로 이동`}
      style={({ pressed }) => [
        styles.cardPressable,
        { opacity: pressed ? 0.9 : 1 },
      ]}
    >
      {cardContent}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  cardPressable: {
    borderRadius: 16,
  },
  cardContent: {
    borderRadius: 16,
    padding: 20,
    height: 147,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthText: {
    ...typography.headline02.bold,
    color: '#ffffff',
  },
  statusText: {
    ...typography.headline02.bold,
    color: '#ffffff',
  },
  cardInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLeft: {
    gap: 4,
  },
  infoRight: {
    gap: 4,
    alignItems: 'flex-end',
  },
  infoLabel: {
    ...typography.body02.regular,
  },
  infoValue: {
    ...typography.headline04.bold,
    color: '#ffffff',
  },
  infoValueRight: {
    textAlign: 'right',
  },
});

YearView.displayName = 'YearView';

