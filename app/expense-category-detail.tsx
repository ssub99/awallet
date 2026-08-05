/**
 * Category Detail Screen
 * 
 * Shows detailed expense information for a specific category in a month.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Tag } from '@/components/ui/tag';
import { UiLineText } from '@/components/ui/ui-line-text';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TimelineItem {
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  category: string;
  memo?: string;
  amount: number;
  timestamp?: number;
  isRecurring?: boolean;
  isInstallment?: boolean;
  isPrepaid?: boolean;
  isRefunded?: boolean;
  installmentId?: string;
  recurringId?: string;
}

// 카테고리별 이모지 매핑
const useCategoryEmojiMap = () => {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([loadCategories('expense'), loadCategories('income')])
      .then(([expense, income]) => {
        const next: Record<string, string> = {};
        [...expense, ...income].forEach((c) => {
          next[c.label] = c.emoji;
        });
        setMap(next);
      })
      .catch(() => {
        // 로드 실패 시 빈 맵 유지
      });
  }, []);

  return map;
};

export default function ExpenseCategoryDetailScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  const params = useLocalSearchParams<{
    category: string;
    year?: string;
    month?: string;
    rankingType?: string;
  }>();

  const category = params.category || '';
  const year = params.year ? parseInt(params.year) : new Date().getFullYear();
  const month = params.month ? parseInt(params.month) : new Date().getMonth() + 1;

  const categoryEmojiMap = useCategoryEmojiMap();
  const { setLoading } = useLoading();
  const [timelineData, setTimelineData] = useState<TimelineItem[]>([]);
  const [monthStartDay, setMonthStartDay] = useState(1);
  const { dataVersion } = useAppData();

  // 날짜 포맷팅 함수
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  // 소비 기간 포맷팅
  const formatPeriod = (start: Date, end: Date): string => {
    const startStr = `${String(start.getFullYear()).slice(-2)}.${String(start.getMonth() + 1).padStart(2, '0')}.${String(start.getDate()).padStart(2, '0')}`;
    const endStr = `${String(end.getFullYear()).slice(-2)}.${String(end.getMonth() + 1).padStart(2, '0')}.${String(end.getDate()).padStart(2, '0')}`;
    return `${startStr} - ${endStr}`;
  };

  // 데이터 새로고침
  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      // Load month start day
      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);

      // 타임라인 데이터 새로고침
      const storedData = await AsyncStorage.getItem('calendarData');
      if (storedData) {
        const calendarData = JSON.parse(storedData);
        const items: TimelineItem[] = [];

        Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
          // 날짜 문자열을 로컬 타임존으로 파싱
          const [yearStr, monthStr, dayStr] = dateString.split('-');
          const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr));

          // Use custom month filtering
          const isIncluded = isDateInCustomMonth(date, year, month, monthStart);

          if (isIncluded && data.records && Array.isArray(data.records)) {
            data.records.forEach((record: any) => {
              // 해당 카테고리이고 삭제되지 않은 기록만 필터링
              if (
                record.isDeleted ||
                record.type !== 'expense' ||
                record.category !== category
              ) {
                return;
              }

              items.push({
                date: dateString,
                type: record.type,
                category: record.category || '기타',
                memo: record.memo,
                amount: record.amount || 0,
                timestamp: record.timestamp,
                isRecurring: record.isRecurring,
                isInstallment: record.isInstallment,
                isPrepaid: record.isPrepaid,
                isRefunded: record.isRefunded,
                installmentId: record.installmentId,
                recurringId: record.recurringId,
              });
            });
          }
        });

        // Sort by date (newest first), then by timestamp within same date
        items.sort((a, b) => {
          const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
          if (dateCompare !== 0) return dateCompare;
          return (b.timestamp || 0) - (a.timestamp || 0);
        });

        setTimelineData(items);
      }
    } catch (error) {
      console.error('[expense-category-detail] Failed to load data:', error);
      setTimelineData([]);
    } finally {
      setLoading(false);
    }
  }, [year, month, category, setLoading]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  useEffect(() => {
    refreshData();
  }, [dataVersion, refreshData]);

  // 카테고리 상세 통계 계산
  const categoryStats = useMemo(() => {
    const totalAmount = timelineData.reduce((sum, item) => {
      // 환불된 기록은 제외
      if (item.isRefunded) return sum;
      return sum + item.amount;
    }, 0);
    const count = timelineData.filter((item) => !item.isRefunded).length;

    // 소비 기간 계산
    const { startDate, endDate } = getCustomMonthRange(year, month, monthStartDay);

    return {
      totalAmount,
      count,
      period: formatPeriod(startDate, endDate),
    };
  }, [timelineData, year, month, monthStartDay]);

  // 날짜별로 그룹화
  const groupedByDate = useMemo(() => {
    const groups: Record<string, TimelineItem[]> = {};
    timelineData.forEach((item) => {
      if (!groups[item.date]) {
        groups[item.date] = [];
      }
      groups[item.date].push(item);
    });
    return groups;
  }, [timelineData]);

  const sortedDates = useMemo(() => {
    return Object.keys(groupedByDate).sort((a, b) => {
      return new Date(b).getTime() - new Date(a).getTime();
    });
  }, [groupedByDate]);

  const handleBack = () => {
    const target =
      params.rankingType === 'recurring'
        ? 'expense-recurring-ranking-prev'
        : 'expense-monthly-ranking-prev';

    void logEvent('btn', {
      screen_name: '/expense-category-detail',
      target,
    });
    router.back();
  };

  const categoryEmoji = categoryEmojiMap[category] || '📝';
  const monthLabel = `${year}년 ${String(month).padStart(2, '0')}월`;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.staticWhite }]} edges={['top', 'bottom']}>

      {/* Top Navigation */}
      <TopNavigation
        type="sub"
        title="카테고리 상세 내역"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      {/* Category Detail Card Background Area - 전체 너비 (고정) */}
      <View style={[styles.detailCardBackground, { backgroundColor: palette.fill }]}>
        {/* Category Detail Card - 좌우 16px 여백 */}
        <View style={[styles.detailCard, { backgroundColor: palette.staticWhite }]}>
          {/* Category Name */}
          <View style={styles.headerRow}>
            <Text style={[styles.categoryName, { color: palette.text }]}>
              {categoryEmoji} {category}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: palette.textAssistive }]}>
                {monthLabel} 소비건수
              </Text>
              <UiLineText variant="body01Bold" style={[styles.statValue, { color: palette.text }]}>
                {categoryStats.count}건
              </UiLineText>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: palette.textAssistive }]}>
                {monthLabel} 소비합계
              </Text>
              <UiLineText variant="body01Bold" style={[styles.statValue, { color: palette.text }]}>
                {categoryStats.totalAmount.toLocaleString()}원
              </UiLineText>
            </View>
            <View style={styles.statRow}>
              <Text style={[styles.statLabel, { color: palette.textAssistive }]}>
                소비 기간
              </Text>
              <UiLineText variant="body01Bold" style={[styles.statValue, { color: palette.text }]}>
                {categoryStats.period}
              </UiLineText>
            </View>
          </View>
        </View>
      </View>

      {/* Expense List - 스크롤 영역 */}
      <ScrollView
        style={[styles.listScrollContainer, { backgroundColor: palette.staticWhite }]}
        contentContainerStyle={styles.listScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {timelineData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: palette.textAssistive }]}>
              해당 카테고리의 소비 내역이 없습니다.
            </Text>
          </View>
        ) : (
          <>
            {sortedDates.map((date, dateIndex) => {
              const items = groupedByDate[date];
              const isLastGroup = dateIndex === sortedDates.length - 1;

              return (
                <View key={date} style={styles.dateGroup}>
                  {items.map((item, itemIndex) => {
                    const isFirstInGroup = itemIndex === 0;
                    const isLastInGroup = itemIndex === items.length - 1;
                    const showItemDivider = !isLastInGroup || !isLastGroup;

                    return (
                      <View key={`${item.date}-${item.timestamp}-${itemIndex}`}>
                        <View
                          style={styles.timelineItem}
                        >
                          {/* Date Column */}
                          <View style={styles.dateColumn}>
                            {isFirstInGroup && (
                              <Text style={[styles.dateText, { color: palette.textAssistive }]}>
                                {formatDate(date)}
                              </Text>
                            )}
                          </View>

                          {/* Content: Category/Amount + Memo */}
                          <View style={styles.itemContent}>
                            {/* Category and Amount */}
                            <View style={styles.itemRow1}>
                              <View style={styles.categoryContainer}>
                                <Text style={[styles.categoryText, { color: palette.text }]}>
                                  {categoryEmoji} {item.category}
                                </Text>
                              </View>
                              <View style={styles.amountContainer}>
                                <Text
                                  style={[styles.amountText, { color: palette.text }]}
                                  adjustsFontSizeToFit
                                  numberOfLines={1}
                                  minimumFontScale={0.7}
                                >
                                  {item.isInstallment && item.isRefunded
                                    ? `${item.amount.toLocaleString()}원`
                                    : `- ${item.amount.toLocaleString()}원`}
                                </Text>
                              </View>
                            </View>

                            {/* Memo */}
                            <View style={styles.itemRow2}>
                              <View style={styles.memoContainer}>
                                <Text style={[styles.memoText, { color: palette.textAssistive }]}>
                                  {item.memo ? item.memo.replace(/\n/g, ' ') : ' '}
                                </Text>
                                {/* 태그 표시 */}
                                {item.isInstallment && item.isPrepaid && (
                                  <Tag label="할부·선결제" status="positive" />
                                )}
                                {item.isInstallment && !item.isPrepaid && (
                                  <Tag
                                    label={item.isRefunded ? '할부·환불' : '할부'}
                                    status="negative"
                                  />
                                )}
                                {!item.isInstallment && item.isPrepaid && (
                                  <Tag label="선납" status="positive" />
                                )}
                                {!item.isInstallment && item.isRecurring && !item.isPrepaid && (
                                  <Tag label="정기" status="normal" />
                                )}
                              </View>
                            </View>
                          </View>
                        </View>

                        {showItemDivider ? (
                          <View
                            style={[
                              isFirstInGroup || isLastInGroup
                                ? styles.itemDividerInset
                                : styles.itemDividerContent,
                              { backgroundColor: palette.border },
                            ]}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listScrollContainer: {
    flex: 1,
  },
  listScrollContent: {
    paddingBottom: 32,
  },
  detailCardBackground: {
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 16,
  },
  detailCard: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  headerRow: {
    marginBottom: 16,
  },
  categoryName: {
    ...typography.headline04.bold,
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  statsContainer: {
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    ...typography.body02.medium,
  },
  statValue: {
    
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    ...typography.body01.regular,
  },
  dateGroup: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  dateColumn: {
    width: 94,
  },
  dateText: {
    ...typography.body02.medium,
  },
  itemContent: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  itemRow1: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  itemRow2: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  categoryContainer: {
    flex: 6,
  },
  categoryText: {
    ...typography.body02.bold,
  },
  amountContainer: {
    flex: 4,
    alignItems: 'flex-end',
  },
  amountText: {
    ...typography.body02.bold,
    textAlign: 'right',
  },
  memoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memoText: {
    ...typography.body02.regular,
    flex: 1,
  },
  itemDividerInset: {
    height: 1,
    marginHorizontal: 16,
  },
  itemDividerContent: {
    height: 1,
    marginLeft: 118, // padding 16 + date 94 + gap 8
    marginRight: 16,
  },
});

