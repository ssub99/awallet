/**
 * Challenge Tab Screen
 *
 * 챌린지 탭: 월 소비 현황의 '챌린지 현황' 탭과 동일한 UI·로직을 단독 화면으로 표시.
 * 공통 컴포넌트 없이 이 파일에만 구현되어 있으며, 월 소비 현황 챌린지 탭 로직은 변경하지 않음.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useThemeColor } from '@/hooks/use-theme-color';
import { loadCategories } from '@/utils/categories';
import { getChallengesByDateRange } from '@/utils/challenges';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { getCustomMonthInfo, getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Animated,
    GestureResponderEvent,
    InteractionManager,
    PanResponder,
    PanResponderGestureState,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const FAB_SIZE = 48;
const FAB_OFFSET_ABOVE_TABS = 16;

interface ChallengeData {
  id: string;
  category: string;
  startDate: string;
  endDate: string;
  targetAmount: number;
  createdAt: number;
  recurringId: string;
}

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
      .catch(() => {});
  }, []);

  return map;
};

interface MonthSwitcherProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  textColor: string;
  fillColor: string;
  assistiveColor: string;
}

const MonthSwitcher: React.FC<MonthSwitcherProps> = ({
  year,
  month,
  onPrev,
  onNext,
  textColor,
  fillColor,
  assistiveColor,
}) => {
  return (
    <View style={styles.periodRow}>
      <Pressable
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel="이전 달"
      >
        <View style={[styles.monthArrowButton, { backgroundColor: fillColor }]}>
          <Icon name="arrowLeft" variant="solid" size={24} color={assistiveColor} />
        </View>
      </Pressable>

      <Text style={[styles.periodText, { color: textColor }]}>
        {year}년 {String(month).padStart(2, '0')}월
      </Text>

      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel="다음 달"
      >
        <View style={[styles.monthArrowButton, { backgroundColor: fillColor }]}>
          <Icon name="arrowRight" variant="solid" size={24} color={assistiveColor} />
        </View>
      </Pressable>
    </View>
  );
};

export default function ChallengeTabScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const iconWhite = useThemeColor({}, 'staticWhite');
  const categoryEmojiMap = useCategoryEmojiMap();
  const { setLoading } = useLoading();
  const { updateCalendarContext } = useCreateSheetContext();
  const pendingOpsRef = useRef(0);
  const beginLoad = useCallback(() => {
    pendingOpsRef.current += 1;
    setLoading(true);
  }, [setLoading]);
  const endLoad = useCallback(() => {
    pendingOpsRef.current = Math.max(0, pendingOpsRef.current - 1);
    if (pendingOpsRef.current === 0) setLoading(false);
  }, [setLoading]);
  const router = useRouter();
  const navigation = useNavigation();
  const isNavigating = useRef(false);

  const params = useLocalSearchParams<{ year?: string; month?: string }>();

  const [monthStartDay, setMonthStartDay] = useState(1);
  const now = new Date();
  const initialYear = params.year ? parseInt(params.year, 10) || now.getFullYear() : now.getFullYear();
  const initialMonth = params.month ? parseInt(params.month, 10) || now.getMonth() + 1 : now.getMonth() + 1;
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const year = currentYear;
  const month = currentMonth;

  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [challengeAmounts, setChallengeAmounts] = useState<Record<string, number>>({});
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  const refreshData = useCallback(async () => {
    beginLoad();
    try {
      if (!hasAnimatedRef.current) {
        setIsContentReady(false);
      }

      const monthStart = await loadMonthStartDay();
      setMonthStartDay(monthStart);

      const { startDate: customStart, endDate: customEnd } = getCustomMonthRange(year, month, monthStart);
      const formatChallengeDate = (dateObj: Date) => {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}`;
      };

      const challengeRecords = await getChallengesByDateRange(
        formatChallengeDate(customStart),
        formatChallengeDate(customEnd)
      );
      const activeChallenges = challengeRecords.filter((challenge) => {
        const [startY, startM, startD] = challenge.startDate.split('.').map(Number);
        const startDate = new Date(startY, startM - 1, startD);
        return isDateInCustomMonth(startDate, year, month, monthStart);
      });
      setChallenges(activeChallenges);

      setIsContentReady(true);
      hasAnimatedRef.current = true;
    } catch (err) {
      console.error('[challenge-tab] Failed to load challenges:', err);
      setChallenges([]);
      setIsContentReady(true);
      hasAnimatedRef.current = true;
    } finally {
      endLoad();
    }
  }, [year, month, beginLoad, endLoad]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const { dataVersion } = useAppData();
  useEffect(() => {
    refreshData();
  }, [dataVersion, year, month, refreshData]);

  // 챌린지 탭에서 FAB를 열 때도, 홈과 동일하게 현재 보고 있는 년/월 정보를 공유
  useEffect(() => {
    const paddedMonth = String(currentMonth).padStart(2, '0');
    const syntheticDate = `${currentYear}-${paddedMonth}-01`;

    updateCalendarContext({
      selectedDate: syntheticDate,
      calendarYear: currentYear,
      calendarMonth: currentMonth,
    });
  }, [currentYear, currentMonth, updateCalendarContext]);

  // 페이드인 애니메이션
  useEffect(() => {
    if (isContentReady) {
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);

  // reset() 직후 언마운트·마운트가 겹치지 않도록 무거운 계산을 인터랙션 종료 후로 지연
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      const calculateChallengeAmounts = async () => {
        const amounts: Record<string, number> = {};
        for (const challenge of challenges) {
          let totalAmount = 0;
          const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
          const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
          const storedData = await AsyncStorage.getItem('calendarData');
          if (storedData) {
            const calendarData = JSON.parse(storedData, (key: string, value: unknown) => {
              if (key === 'recurringType' && value === null) return undefined;
              return value;
            });
            Object.entries(calendarData).forEach(([dateString, data]: [string, unknown]) => {
              const itemDate = new Date(dateString);
              if (itemDate >= startDate && itemDate <= endDate && data && typeof data === 'object' && 'records' in data) {
                const records = (data as { records?: unknown[] }).records;
                if (Array.isArray(records)) {
                  records.forEach((record: { isDeleted?: boolean; isRefunded?: boolean; type?: string; category?: string; amount?: number }) => {
                    if (record.isDeleted || record.isRefunded) return;
                    if (record.type === 'expense' && record.category === challenge.category) {
                      totalAmount += record.amount || 0;
                    }
                  });
                }
              }
            });
          }
          amounts[challenge.id] = totalAmount;
        }
        setChallengeAmounts(amounts);
      };
      calculateChallengeAmounts();
    });
    return () => task.cancel();
  }, [challenges]);

  // 오늘 날짜 기준으로, 커스텀 월 시작일을 반영한 년/월로 이동
  const resetToCurrentMonth = useCallback(async () => {
    const today = new Date();
    const monthStart = await loadMonthStartDay();
    const customMonthInfo = getCustomMonthInfo(today, monthStart);

    setCurrentYear(customMonthInfo.year);
    setCurrentMonth(customMonthInfo.month);
  }, []);

  // Handle double-tap on challenge tab: reset to today's custom month
  useEffect(() => {
    const unsubscribe = navigation.addListener('tabDoubleTap' as any, (e: any) => {
      if (e.data?.routeName === 'challenge') {
        resetToCurrentMonth().catch((error) => {
          console.error('[challenge-tab] Failed to reset to today:', error);
        });
      }
    });

    return unsubscribe;
  }, [navigation, resetToCurrentMonth]);

  const handlePrevMonth = useCallback(() => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 1) {
        setCurrentYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth((prevMonth) => {
      if (prevMonth === 12) {
        setCurrentYear((prevYear) => prevYear + 1);
        return 1;
      }
      return prevMonth + 1;
    });
  }, []);

  // Horizontal swipe to change month (left: prev, right: next)
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx, dy } = gestureState;
        // 가로 스와이프가 세로보다 크고, 일정 거리 이상일 때만 처리
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const SWIPE_THRESHOLD = 50;
        const { dx } = gestureState;

        if (dx <= -SWIPE_THRESHOLD) {
          // 왼쪽으로 스와이프 → 다음 달
          handleNextMonth();
        } else if (dx >= SWIPE_THRESHOLD) {
          // 오른쪽으로 스와이프 → 이전 달
          handlePrevMonth();
        }
      },
    })
  ).current;

  return (
    <View style={styles.screenWrapper}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <Animated.View style={{ opacity: isContentReady ? contentOpacity : 0 }}>
          <TopNavigation type="main" title="챌린지" />
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            {
              backgroundColor: colors.fill,
              opacity: isContentReady ? contentOpacity : 0,
            },
          ]}
          {...panResponder.panHandlers}
        >
          <MonthSwitcher
            year={year}
            month={month}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            textColor={colors.text}
            fillColor={colors.fill}
            assistiveColor={colors.textAssistive}
          />

          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
          >
            {challenges.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textAssistive }]}>
                  생성된 챌린지가 없습니다.
                </Text>
              </View>
            ) : (
              <View style={styles.challengeList}>
                {challenges.map((challenge) => {
              const categoryEmoji = categoryEmojiMap[challenge.category];
              let targetAmount = 0;
              if (challenge.targetAmount != null) {
                if (typeof challenge.targetAmount === 'string') {
                  targetAmount = parseInt((challenge.targetAmount as string).replace(/,/g, ''), 10) || 0;
                } else {
                  targetAmount = Number(challenge.targetAmount);
                }
              }
              const currentAmount = challengeAmounts[challenge.id] ?? 0;
              const progress = targetAmount > 0 ? (currentAmount / targetAmount) * 100 : 0;
              const isOverBudget = currentAmount > targetAmount;

              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
              startDate.setHours(0, 0, 0, 0);
              const endDate = new Date(challenge.endDate.replace(/\./g, '-'));
              endDate.setHours(0, 0, 0, 0);
              const isChallengeStarted = startDate <= today;
              const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

              let status: {
                text: string;
                color: string;
                bgColor: string;
                showProgressComplete: boolean;
                isBeforeStart: boolean;
                rightLabel: string;
              };
              if (!isChallengeStarted) {
                status = {
                  text: '진행 전',
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: true,
                  rightLabel: '진행 전',
                };
              } else if (daysLeft < 0) {
                status = {
                  text: isOverBudget ? 'Failed' : 'Success',
                  color: isOverBudget ? '#ef5252' : '#07b63b',
                  bgColor: isOverBudget ? '#ef5252' : '#07b63b',
                  showProgressComplete: true,
                  isBeforeStart: false,
                  rightLabel: '진행완료',
                };
              } else if (daysLeft === 0) {
                status = {
                  text: 'D-0',
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: false,
                  rightLabel: 'D-0',
                };
              } else {
                status = {
                  text: `D-${daysLeft}`,
                  color: '#222222',
                  bgColor: 'transparent',
                  showProgressComplete: false,
                  isBeforeStart: false,
                  rightLabel: `D-${daysLeft}`,
                };
              }

              return (
                <Pressable
                  key={challenge.id}
                  style={[styles.challengeCard, { backgroundColor: colors.staticWhite }]}
                  onPress={() => {
                    if (isNavigating.current) return;
                    isNavigating.current = true;
                    router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id } });
                    setTimeout(() => { isNavigating.current = false; }, 500);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${challenge.category} 챌린지`}
                >
                  <View style={styles.challengeHeader}>
                    <View style={styles.challengeCategory}>
                      <Text style={[styles.challengeCategoryName, { color: colors.text }]}>
                        {categoryEmoji || '📝'} {challenge.category}
                      </Text>
                      {status.showProgressComplete && status.bgColor !== 'transparent' && (
                        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                          <Text style={[styles.statusText, { color: '#ffffff' }]}>{status.text}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.statusLabel, { color: colors.text }]}>{status.rightLabel}</Text>
                  </View>

                  <View style={[styles.progressContainer, { backgroundColor: '#E3E3E3' }]}>
                    <View
                      style={[
                        styles.progressBar,
                        {
                          width: `${status.isBeforeStart ? 5 : Math.max(progress, 1)}%`,
                          backgroundColor: status.isBeforeStart ? '#9e9e9e' : isOverBudget ? '#F66262' : '#1AC673',
                        },
                      ]}
                    />
                  </View>

                  <View style={styles.challengeAmounts}>
                    <View style={styles.amountLeft}>
                      <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>현재 소비금액</Text>
                      <Text style={[styles.amountValue, { color: colors.textNeutral }]}>
                        {status.isBeforeStart ? '0원' : `${currentAmount.toLocaleString()}원`}
                      </Text>
                    </View>
                    <View style={styles.amountRight}>
                      <Text style={[styles.amountLabel, { color: colors.textAssistive }]}>목표 소비금액</Text>
                      <Text style={[styles.amountValue, { color: colors.textNeutral }]}>
                        {targetAmount.toLocaleString()}원
                      </Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            </View>
          )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>

      <Pressable
        style={[
          styles.fab,
          styles.fabShadow,
          {
            backgroundColor: colors.primary,
            bottom: FAB_OFFSET_ABOVE_TABS,
          },
        ]}
        onPress={() => createSheetEvent.emit()}
        accessibilityRole="button"
        accessibilityLabel="기록 또는 챌린지 선택"
      >
        <Icon name="addTaskFab" variant="line" size={24} color={iconWhite} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: Colors.light.staticWhite,
  },
  periodText: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  monthArrowButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    ...Typography.body1.l.regular,
  },
  challengeList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  challengeCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeCategory: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  challengeCategoryName: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    ...Typography.tiny.r.bold,
    fontSize: 12,
    lineHeight: 18,
  },
  statusLabel: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
  progressContainer: {
    height: 10,
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 8,
  },
  challengeAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  amountLeft: {
    alignItems: 'flex-start',
  },
  amountRight: {
    alignItems: 'flex-end',
  },
  amountLabel: {
    ...Typography.tiny.r.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 2,
  },
  amountValue: {
    ...Typography.body1.l.bold,
    fontSize: 16,
    lineHeight: 24,
  },
});
