/**
 * 리포트 「소비 현황」 — 기간 막대그래프 · 대표 금액 · 지출 순위/정기 지출 · 범위/평균 플로팅 바.
 * Figma `[Awallet]Home_report_default` (3016:33718)
 *
 * 범위 상태를 유지해야 하므로 서브 탭이 바뀌어도 마운트해 두고 `visible`로 화면만 숨긴다.
 */

import { TrendBarChart, type TrendBar } from '@/components/report/trend-bar-chart';
import { TrendPaymentFilterSheet, useTrendPaymentFilter } from '@/components/report/trend-payment-filter';
import type { useHideOnScroll } from '@/components/report/use-hide-on-scroll';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCategoryEmojiMap } from '@/hooks/use-category-emoji-map';
import { useCountUp } from '@/hooks/use-count-up';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { getCustomMonthInfo } from '@/utils/custom-month';
import {
  fromMonthIndex,
  getWindowMonths,
  groupByMonth,
  parseTrendItems,
  rankCategories,
  summarizeWindow,
  sumItems,
  toMonthIndex,
  type TrendItem,
  type TrendRankingFilter,
} from '@/utils/report-trend';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** 플로팅 바 높이 — 부모가 FAB를 이만큼 위로 올린다 */
export const TREND_CONTROL_BAR_HEIGHT = 56;

type TrendRange = 1 | 3 | 6 | 12;

const RANGE_OPTIONS: { value: TrendRange; label: string }[] = [
  { value: 1, label: '당월' },
  { value: 3, label: '3개월' },
  { value: 6, label: '6개월' },
  { value: 12, label: '12개월' },
];
/** 기록이 적어도 그래프에 최소한 이만큼의 달을 둔다 */
const MIN_CHART_MONTHS = 12;
const SCROLL_PADDING = 16;

const pad = (value: number) => String(value).padStart(2, '0');
const formatWon = (amount: number) => `${amount.toLocaleString()}원`;
const formatCountAndAmount = (count: number, amount: number) => `${count}건 ⋅ ${formatWon(amount)}`;

function formatMonthLabel(monthIndex: number): string {
  const { year, month } = fromMonthIndex(monthIndex);
  return `${year}년 ${pad(month)}월`;
}

function formatPeriodLabel(monthIndex: number): string {
  const { year, month } = fromMonthIndex(monthIndex);
  return `${year}.${pad(month)}`;
}

interface ReportTrendTabProps {
  visible: boolean;
  /** 선택한 달 (범위의 마지막 달) */
  year: number;
  month: number;
  onSelectMonth: (year: number, month: number) => void;
  /** 값이 바뀌면 「당월」로 전환 — 홈 「내역」처럼 특정 달을 보러 들어온 경우 */
  singleMonthEntryKey: string | null;
  onPressPeriod: () => void;
  palette: ColorPalette;
  /** 화면 하단에서 플로팅 바 하단까지 */
  controlBarBottom: number;
  /** 플로팅 바 숨김 상태 — 부모의 FAB가 함께 움직여야 해서 부모가 소유 */
  controlBar: ReturnType<typeof useHideOnScroll>;
}

export function ReportTrendTab({
  visible,
  year,
  month,
  onSelectMonth,
  singleMonthEntryKey,
  onPressPeriod,
  palette,
  controlBarBottom,
  controlBar,
}: ReportTrendTabProps) {
  const router = useRouter();
  const categoryEmojiMap = useCategoryEmojiMap();
  const { dataVersion } = useAppData();

  const [data, setData] = useState<{ items: TrendItem[]; monthStartDay: number } | null>(null);
  const [range, setRange] = useState<TrendRange>(3);
  const [isAverage, setIsAverage] = useState(true);
  const [rankingFilter, setRankingFilter] = useState<TrendRankingFilter>('all');
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [viewHeight, setViewHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);

  const [appliedEntryKey, setAppliedEntryKey] = useState<string | null>(null);
  if (singleMonthEntryKey !== null && singleMonthEntryKey !== appliedEntryKey) {
    setAppliedEntryKey(singleMonthEntryKey);
    setRange(1);
  }

  const loadData = useCallback(async () => {
    const monthStartDay = await loadMonthStartDay();
    try {
      const storedData = await AsyncStorage.getItem('calendarData');
      setData({ items: storedData ? parseTrendItems(storedData) : [], monthStartDay });
    } catch {
      setData({ items: [], monthStartDay });
    }
  }, []);

  // 화면에 들어올 때와, 보고 있는 동안 데이터가 바뀔 때 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void dataVersion;
      void loadData();
    }, [dataVersion, loadData]),
  );

  const items = useMemo(() => data?.items ?? [], [data]);
  const monthStartDay = data?.monthStartDay ?? 1;
  const filter = useTrendPaymentFilter(items);

  // 첫 기록 달은 필터와 무관하게 정한다 (필터를 바꿔도 평균의 분모가 흔들리지 않도록)
  const allByMonth = useMemo(() => groupByMonth(items, monthStartDay), [items, monthStartDay]);
  const byMonth = useMemo(
    () => groupByMonth(filter.filteredItems, monthStartDay),
    [filter.filteredItems, monthStartDay],
  );

  const anchorIndex = toMonthIndex(year, month);
  const currentMonth = getCustomMonthInfo(new Date(), monthStartDay);
  const currentIndex = toMonthIndex(currentMonth.year, currentMonth.month);
  const recordIndexes = Array.from(allByMonth.keys());
  const firstRecordIndex = recordIndexes.length > 0 ? Math.min(...recordIndexes) : null;

  const isSingleMonth = range === 1;
  const windowMonths = getWindowMonths(anchorIndex, range, firstRecordIndex);
  const summary = summarizeWindow(byMonth, windowMonths);

  // 시작 달은 선택에 따라 움직이지 않아야 막대를 눌렀을 때 그래프가 밀리지 않는다
  const chartStart = Math.min(
    firstRecordIndex ?? anchorIndex,
    currentIndex - (MIN_CHART_MONTHS - 1),
    anchorIndex,
  );
  // 그래프는 당월에서 끝난다 (미래 달은 조회하지 않음)
  const bars: TrendBar[] = Array.from({ length: currentIndex - chartStart + 1 }, (_, offset) => {
    const monthIndex = chartStart + offset;
    const amount = sumItems(byMonth.get(monthIndex)).amount;
    const isSelected = isSingleMonth ? monthIndex === anchorIndex : windowMonths.includes(monthIndex);
    return {
      monthIndex,
      amount,
      label: `${fromMonthIndex(monthIndex).month}월`,
      accessibilityLabel: `${formatMonthLabel(monthIndex)} ${formatWon(amount)}`,
      // 범위에서는 월 평균 초과면 빨강. 「당월」은 비교 없이 항상 초록.
      tone: !isSelected
        ? 'outside'
        : !isSingleMonth && amount > summary.average
          ? 'over'
          : 'within',
    };
  });

  const showAverage = !isSingleMonth && isAverage;
  const representativeAmount = Math.round(showAverage ? summary.average : summary.total);
  const displayedAmount = useCountUp(representativeAmount, `${range}|${showAverage}`);
  const representativeTitle = isSingleMonth
    ? `${month}월 소비금액`
    : `최근 ${range}개월 ${showAverage ? '평균' : '총'} 소비금액`;
  const periodLabel = isSingleMonth
    ? formatPeriodLabel(anchorIndex)
    : `${formatPeriodLabel(anchorIndex - range + 1)} - ${formatPeriodLabel(anchorIndex)}`;

  const categories = rankCategories(byMonth, windowMonths, rankingFilter);

  const handlePressBar = (monthIndex: number) => {
    setRange(1);
    const target = fromMonthIndex(monthIndex);
    onSelectMonth(target.year, target.month);
  };

  const openCategoryDetail = (category: string, monthIndex: number) => {
    void logEvent('list', {
      screen_name: '/report',
      target: rankingFilter === 'all' ? 'expense-monthly-ranking' : 'expense-recurring-ranking',
    });
    const target = fromMonthIndex(monthIndex);
    router.push({
      pathname: '/expense-category-detail',
      params: {
        category,
        year: target.year.toString(),
        month: target.month.toString(),
        rankingType: rankingFilter === 'all' ? 'monthly' : 'recurring',
      },
    });
  };

  const isAtCurrentMonth = anchorIndex >= currentIndex;
  const handleStepMonth = (step: 1 | -1) => {
    const target = fromMonthIndex(anchorIndex + step);
    onSelectMonth(target.year, target.month);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category],
    );
  };

  // 내역이 없으면 빈 카드가 남은 화면 높이를 채운다
  const isEmpty = categories.length === 0;

  // 하단 여백에는 플로팅 바 높이를 넣지 않는다(스크롤하면 바가 숨는다). 단, 스크롤이 안 되는 길이인데
  // 마지막 항목이 바에 가리면 바를 숨길 방법이 없으므로 그때만 여백을 더해 스크롤되게 한다.
  const baseContentHeight = SCROLL_PADDING + bodyHeight + controlBarBottom;
  const isStuckUnderControlBar =
    !isEmpty &&
    baseContentHeight > viewHeight - TREND_CONTROL_BAR_HEIGHT &&
    baseContentHeight <= viewHeight + SCROLL_PADDING;
  const scrollPaddingBottom = isStuckUnderControlBar
    ? controlBarBottom + TREND_CONTROL_BAR_HEIGHT + SCROLL_PADDING
    : controlBarBottom;

  return (
    <>
      {visible && data ? (
        <View style={[styles.container, { backgroundColor: palette.fill }]}>
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              isEmpty && styles.fill,
              { paddingBottom: scrollPaddingBottom },
            ]}
            bounces={false}
            overScrollMode="never"
            scrollEventThrottle={16}
            onScroll={controlBar.onScroll}
            onLayout={(event) => {
              setViewHeight(event.nativeEvent.layout.height);
              controlBar.onLayout(event.nativeEvent.layout.height);
            }}
            onContentSizeChange={(_width, height) => controlBar.onContentSizeChange(height)}
          >
            <View
              style={[styles.body, isEmpty && styles.fill]}
              onLayout={(event) => setBodyHeight(event.nativeEvent.layout.height)}
            >
              <View style={[styles.periodCard, { backgroundColor: palette.staticWhite }]}>
                <Pressable
                  onPress={() => handleStepMonth(-1)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="이전 달"
                >
                  <Icon name="arrowLeft" variant="solid" size={24} />
                </Pressable>
                <Pressable
                  style={styles.periodTextWrap}
                  onPress={onPressPeriod}
                  accessibilityRole="button"
                  accessibilityLabel="년월 선택"
                >
                  <UiLineText variant="body01Bold" style={{ color: palette.text }}>
                    {periodLabel}
                  </UiLineText>
                </Pressable>
                <Pressable
                  onPress={() => handleStepMonth(1)}
                  disabled={isAtCurrentMonth}
                  style={isAtCurrentMonth && styles.arrowDisabled}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isAtCurrentMonth }}
                  accessibilityLabel="다음 달"
                >
                  <Icon name="arrowRight" variant="solid" size={24} />
                </Pressable>
              </View>

              <View style={[styles.summaryCard, { backgroundColor: palette.staticWhite }]}>
                <Pressable
                  style={styles.summaryHeader}
                  disabled={isSingleMonth || windowMonths.length === 0}
                  onPress={() => setIsSummaryExpanded((prev) => !prev)}
                  accessibilityRole={isSingleMonth ? undefined : 'button'}
                  accessibilityState={isSingleMonth ? undefined : { expanded: isSummaryExpanded }}
                >
                  <Text style={[styles.summaryTitle, { color: palette.textAssistive }]}>
                    {representativeTitle}
                  </Text>
                  <View style={styles.row}>
                    <Text style={[styles.summaryAmount, { color: palette.text }]}>
                      {formatWon(displayedAmount)}
                    </Text>
                    {!isSingleMonth && windowMonths.length > 0 ? (
                      <Icon
                        name={isSummaryExpanded ? 'arrowUp' : 'arrowDown'}
                        variant="solid"
                        size={24}
                      />
                    ) : null}
                  </View>
                </Pressable>
                {!isSingleMonth && isSummaryExpanded && windowMonths.length > 0 ? (
                  <>
                    <View style={[styles.divider, { backgroundColor: palette.border }]} />
                    <View style={styles.monthList}>
                      {windowMonths.map((monthIndex) => (
                        <View key={monthIndex} style={styles.row}>
                          <Text style={[styles.monthLabel, { color: palette.textNeutral }]}>
                            {formatMonthLabel(monthIndex)}
                          </Text>
                          <UiLineText variant="body01Bold" style={{ color: palette.textNeutral }}>
                            {formatWon(sumItems(byMonth.get(monthIndex)).amount)}
                          </UiLineText>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>

              <TrendBarChart
                bars={bars}
                anchorIndex={anchorIndex}
                palette={palette}
                onPressBar={handlePressBar}
              />

              <View style={styles.filterBar}>
                <View style={styles.chips}>
                  <Chip
                    label="지출 순위"
                    active={rankingFilter === 'all'}
                    onPress={() => setRankingFilter('all')}
                  />
                  <Chip
                    label="정기 지출"
                    active={rankingFilter === 'recurring'}
                    onPress={() => setRankingFilter('recurring')}
                  />
                </View>
                <Pressable
                  onPress={filter.open}
                  accessibilityRole="button"
                  accessibilityLabel="결제 유형 필터"
                >
                  <View
                    style={[
                      styles.filterIconBox,
                      {
                        borderColor: filter.isApplied ? atomicColors.neutral[800] : palette.border,
                        backgroundColor: palette.staticWhite,
                      },
                    ]}
                  >
                    <Icon
                      name="filter"
                      variant="line"
                      size={24}
                      color={filter.isApplied ? palette.primary : palette.textAssistive}
                    />
                    {filter.isApplied ? (
                      <View style={[styles.filterBadge, { backgroundColor: palette.primary }]} />
                    ) : null}
                  </View>
                </Pressable>
              </View>

              {isEmpty ? (
                <View style={[styles.empty, { backgroundColor: palette.staticWhite }]}>
                  <Icon name="info" variant="line" size={24} color={palette.staticBlack} />
                  <Text style={[styles.emptyText, { color: palette.textAssistive }]}>
                    소비내역이 존재하지 않습니다.
                  </Text>
                </View>
              ) : (
                <View style={styles.categoryList}>
                  {categories.map((item) => {
                    const isExpanded = !isSingleMonth && expandedCategories.includes(item.category);
                    return (
                      <View
                        key={item.category}
                        style={[styles.categoryCard, { backgroundColor: palette.staticWhite }]}
                      >
                        <Pressable
                          style={styles.categoryHeader}
                          onPress={() =>
                            isSingleMonth
                              ? openCategoryDetail(item.category, anchorIndex)
                              : toggleCategory(item.category)
                          }
                          accessibilityRole="button"
                          accessibilityState={isSingleMonth ? undefined : { expanded: isExpanded }}
                          accessibilityLabel={`${item.category} ${isSingleMonth ? '상세' : '월별 내역'}`}
                        >
                          <UiLineText
                            variant="body01Bold"
                            style={[styles.categoryName, { color: palette.text }]}
                            numberOfLines={1}
                          >
                            {categoryEmojiMap[item.category] || '📝'} {item.category}
                          </UiLineText>
                          <View style={styles.categoryTrailing}>
                            <UiLineText variant="body01Bold" style={{ color: palette.text }}>
                              {formatCountAndAmount(item.count, item.amount)}
                            </UiLineText>
                            {!isSingleMonth ? (
                              <Icon
                                name={isExpanded ? 'arrowUp' : 'arrowDown'}
                                variant="solid"
                                size={24}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                        {isExpanded ? (
                          <>
                            <View style={[styles.divider, { backgroundColor: palette.border }]} />
                            <View style={styles.monthList}>
                              {item.monthly.map((entry) => (
                                <Pressable
                                  key={entry.monthIndex}
                                  style={styles.row}
                                  disabled={entry.count === 0}
                                  onPress={() => openCategoryDetail(item.category, entry.monthIndex)}
                                  accessibilityRole="button"
                                  accessibilityState={{ disabled: entry.count === 0 }}
                                >
                                  <Text style={[styles.monthLabel, { color: palette.textNeutral }]}>
                                    {formatMonthLabel(entry.monthIndex)}
                                  </Text>
                                  <UiLineText variant="body01Bold" style={{ color: palette.text }}>
                                    {formatCountAndAmount(entry.count, entry.amount)}
                                  </UiLineText>
                                </Pressable>
                              ))}
                            </View>
                          </>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          <Animated.View
            pointerEvents={controlBar.isHidden ? 'none' : 'auto'}
            accessibilityElementsHidden={controlBar.isHidden}
            importantForAccessibility={controlBar.isHidden ? 'no-hide-descendants' : 'auto'}
            style={[
              styles.controlBar,
              {
                bottom: controlBarBottom,
                backgroundColor: palette.staticWhite,
                opacity: controlBar.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [
                  {
                    translateY: controlBar.progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, controlBarBottom + TREND_CONTROL_BAR_HEIGHT],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.segment, { backgroundColor: atomicColors.neutral[200] }]}>
              {RANGE_OPTIONS.map((option) => {
                const isActive = option.value === range;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.segmentItem, isActive && { backgroundColor: palette.staticWhite }]}
                    onPress={() => setRange(option.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        isActive ? styles.segmentTextActive : styles.segmentText,
                        { color: isActive ? palette.textNeutral : palette.textAssistive },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.averageToggle}>
              <Text style={[styles.segmentText, { color: palette.text }]}>평균</Text>
              {/* 공용 스위치(56×32)를 시안 크기 40×24로 축소 */}
              <View style={styles.switchBox}>
                <Switch
                  style={styles.switch}
                  value={showAverage}
                  disabled={isSingleMonth}
                  onValueChange={setIsAverage}
                  accessibilityLabel="평균 금액으로 보기"
                />
              </View>
            </View>
          </Animated.View>
        </View>
      ) : null}
      <TrendPaymentFilterSheet {...filter.sheetProps} palette={palette} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: SCROLL_PADDING,
  },
  body: {
    gap: 8,
  },
  fill: {
    flexGrow: 1,
  },
  periodCard: {
    height: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  periodTextWrap: {
    flex: 1,
    alignItems: 'center',
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  summaryHeader: {
    gap: 4,
  },
  summaryTitle: {
    ...typography.body02.regular,
  },
  summaryAmount: {
    ...typography.headline03.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: {
    height: 1,
  },
  monthList: {
    gap: 8,
  },
  monthLabel: {
    ...typography.body01.regular,
  },
  filterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
  },
  filterIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  empty: {
    flexGrow: 1,
    minHeight: 240,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyText: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
  categoryList: {
    gap: 8,
  },
  categoryCard: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryName: {
    flex: 1,
  },
  categoryTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: TREND_CONTROL_BAR_HEIGHT,
    borderRadius: 32,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: atomicColors.common[100],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 12,
  },
  segmentItem: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    ...typography.body02.regular,
  },
  segmentTextActive: {
    ...typography.body02.bold,
  },
  averageToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  switchBox: {
    width: 40,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switch: {
    transform: [{ scaleX: 40 / 56 }, { scaleY: 24 / 32 }],
  },
});
