/**
 * Challenge Detail Screen
 *
 * Shows detailed expense records for a specific challenge period.
 * Mirrors the visual style of category detail.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { Tag } from '@/components/ui/tag';
import { UiLineText } from '@/components/ui/ui-line-text';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { loadCategories } from '@/utils/categories';
import { getChallengeById, type ChallengeRecord } from '@/utils/challenges';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TimelineItem {
  date: string; // YYYY-MM-DD
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

// 카테고리별 이모지 매핑 (챌린지 카테고리 표시용)
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

export default function ChallengeDetailScreen() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  const params = useLocalSearchParams<{ challengeId?: string }>();
  const challengeId = params.challengeId ?? '';

  const { setLoading } = useLoading();
  const { dataVersion } = useAppData();

  const categoryEmojiMap = useCategoryEmojiMap();

  const [challenge, setChallenge] = useState<ChallengeRecord | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineItem[]>([]);

  // 날짜 포맷팅 함수
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  };

  // 기간 포맷팅 (챌린지 기간 그대로 사용)
  const formatPeriod = (start: string, end: string): string => {
    return `${start.slice(2)} - ${end.slice(2)}`;
  };

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const challengeData = await getChallengeById(challengeId);
      setChallenge(challengeData);

      if (!challengeData) {
        setTimelineData([]);
        return;
      }

      const startDate = new Date(challengeData.startDate.replace(/\./g, '-'));
      const endDate = new Date(challengeData.endDate.replace(/\./g, '-'));

      const storedData = await AsyncStorage.getItem('calendarData');
      if (!storedData) {
        setTimelineData([]);
        return;
      }

      const calendarData = JSON.parse(storedData);
      const items: TimelineItem[] = [];

      Object.entries(calendarData).forEach(([dateString, data]: [string, any]) => {
        const itemDate = new Date(dateString);
        if (itemDate < startDate || itemDate > endDate) {
          return;
        }

        if (data.records && Array.isArray(data.records)) {
          data.records.forEach((record: any, recordIndex: number) => {
            // 삭제/환불 기록 제외
            if (record.isDeleted || record.isRefunded) {
              return;
            }

            if (record.type === 'expense' && record.category === challengeData.category) {
              items.push({
                date: dateString,
                category: record.category || '기타',
                memo: record.memo,
                amount: record.amount || 0,
                timestamp: record.timestamp ?? recordIndex,
                isRecurring: record.isRecurring,
                isInstallment: record.isInstallment,
                isPrepaid: record.isPrepaid,
                isRefunded: record.isRefunded,
                installmentId: record.installmentId,
                recurringId: record.recurringId,
              });
            }
          });
        }
      });

      items.sort((a, b) => {
        const dateCompare = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateCompare !== 0) return dateCompare;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });

      setTimelineData(items);
    } catch (error) {
      console.error('[challenge-detail] Failed to load data:', error);
      setTimelineData([]);
    } finally {
      setLoading(false);
    }
  }, [challengeId, setLoading]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData]),
  );

  useEffect(() => {
    refreshData();
  }, [dataVersion, refreshData]);

  const stats = useMemo(() => {
    const totalAmount = timelineData.reduce((sum, item) => sum + item.amount, 0);
    const count = timelineData.length;

    const period = challenge ? formatPeriod(challenge.startDate, challenge.endDate) : '-';
    const target = challenge?.targetAmount ?? 0;
    
    // 챌린지 시작일 확인 (진행 전 여부)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = challenge ? new Date(challenge.startDate.replace(/\./g, '-')) : null;
    if (startDate) {
      startDate.setHours(0, 0, 0, 0);
    }
    const isBeforeStart = startDate ? startDate > today : false;
    
    const rawProgress = target > 0 ? (totalAmount / target) * 100 : 0;
    const roundedProgress = Math.min(10000, Math.round(rawProgress));

    return {
      totalAmount,
      count,
      period,
      targetAmount: target,
      progress: roundedProgress,
      isOverBudget: target > 0 && totalAmount > target,
      isBeforeStart,
    };
  }, [challenge, timelineData]);

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
    void logEvent('btn', {
      screen_name: '/challenge-detail',
      target: 'detail-prev',
    });
    router.back();
  };

  const handleEdit = () => {
    if (!challengeId) return;
    void logEvent('btn', {
      screen_name: '/challenge-detail',
      target: 'detail-modification',
    });
    router.push({
      pathname: '/challenge-edit',
      params: { challengeId },
    });
  };

  const categoryEmoji = challenge ? categoryEmojiMap[challenge.category] || '📝' : '📝';
  const challengeTitle = challenge ? `${challenge.category}` : '챌린지 상세 내역';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.staticWhite }]} edges={['top', 'bottom']}>
      <TopNavigation
        type="sub"
        title="챌린지 상세 내역"
        showLeftIcon
        onLeftIconPress={handleBack}
        showRightButton
        rightButtonText="수정"
        onRightButtonPress={handleEdit}
      />

      {/* Detail Card Area */}
      <View style={[styles.detailCardBackground, { backgroundColor: palette.fill }]}>
        <View style={[styles.detailCard, { backgroundColor: palette.staticWhite }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.categoryName, { color: palette.text }]}>
              {categoryEmoji} {challengeTitle}
            </Text>
            <Text style={[styles.progressLabel, { color: palette.text }]}>
              {stats.isBeforeStart ? '진행 전' : `${stats.progress}%`}
            </Text>
          </View>

          {/* Progress */}
          <View style={[styles.progressBarBackground, { backgroundColor: palette.border }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: stats.isBeforeStart ? '5%' : `${Math.max(0, Math.min(stats.progress, 100))}%`,
                  backgroundColor: stats.isBeforeStart
                    ? '#9e9e9e'
                    : stats.isOverBudget
                    ? palette.statusNegative ?? '#ef5252'
                    : '#1ac673',
                },
              ]}
            />
          </View>

          {/* Amounts */}
          <View style={styles.amountsContainer}>
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: palette.textAssistive }]}>목표 소비금액</Text>
              <UiLineText variant="body01Bold" style={[styles.amountValue, { color: palette.text }]}>
                {stats.targetAmount.toLocaleString()}원
              </UiLineText>
            </View>
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: palette.textAssistive }]}>현재 소비금액</Text>
              <UiLineText variant="body01Bold" style={[styles.amountValue, { color: palette.text }]}>
                {stats.totalAmount.toLocaleString()}원
              </UiLineText>
            </View>
            <View style={styles.amountRow}>
              <Text style={[styles.amountLabel, { color: palette.textAssistive }]}>챌린지 기간</Text>
              <UiLineText variant="body01Bold" style={[styles.amountValue, { color: palette.text }]}>
                {stats.period}
              </UiLineText>
            </View>
          </View>
        </View>
      </View>

      {/* Expense List */}
      <ScrollView
        style={[styles.listScrollContainer, { backgroundColor: palette.staticWhite }]}
        contentContainerStyle={[
          styles.listScrollContent,
          (!challenge || timelineData.length === 0) && styles.listScrollContentEmpty,
        ]}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        {!challenge ? (
          <View style={styles.emptyContainer}>
            <Icon name="info" variant="line" size={24} color={palette.textAssistive} />
            <Text style={[styles.emptyText, { color: palette.textAssistive }]}>챌린지를 찾을 수 없습니다.</Text>
          </View>
        ) : timelineData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="info" variant="line" size={24} color={palette.textAssistive} />
            <Text style={[styles.emptyText, { color: palette.textAssistive }]}>
              해당 챌린지의 소비 내역이 없습니다.
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
                        <View style={styles.timelineItem}>
                          {/* Date */}
                          <View style={styles.dateColumn}>
                            {isFirstInGroup && (
                              <Text style={[styles.dateText, { color: palette.textAssistive }]}>{formatDate(date)}</Text>
                            )}
                          </View>

                          {/* Content */}
                          <View style={styles.itemContent}>
                            <View style={styles.itemRow1}>
                              <View style={styles.categoryContainer}>
                                <Text style={[styles.categoryText, { color: palette.text }]}>{`${categoryEmoji} ${item.category}`}</Text>
                              </View>
                              <View style={styles.amountContainer}>
                                <Text
                                  style={[styles.amountText, { color: palette.text }]}
                                  adjustsFontSizeToFit
                                  numberOfLines={1}
                                  minimumFontScale={0.7}
                                >
                                  {`- ${item.amount.toLocaleString()}원`}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.itemRow2}>
                              <View style={styles.memoContainer}>
                                <Text style={[styles.memoText, { color: palette.textAssistive }]}>
                                  {item.memo ? item.memo.replace(/\n/g, ' ') : ' '}
                                </Text>
                                {item.isInstallment && item.isPrepaid && <Tag label="할부·선결제" status="positive" />}
                                {item.isInstallment && !item.isPrepaid && (
                                  <Tag label={item.isRefunded ? '할부·환불' : '할부'} status="negative" />
                                )}
                                {!item.isInstallment && item.isPrepaid && <Tag label="선납" status="positive" />}
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
  detailCardBackground: {
    paddingBottom: 16,
  },
  detailCard: {
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryName: {
    ...typography.headline04.bold,
  },
  progressLabel: {
    ...typography.headline04.bold,
  },
  progressBarBackground: {
    height: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 10,
    borderRadius: 8,
  },
  amountsContainer: {
    marginTop: 12,
    gap: 4,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  amountLabel: {
    ...typography.body02.medium,
  },
  amountValue: {
    
  },
  listScrollContainer: {
    flex: 1,
  },
  listScrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  listScrollContentEmpty: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...typography.body01.regular,
    marginTop: 12,
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


