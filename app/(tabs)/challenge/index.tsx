/**
 * Challenge Tab Screen — 챌린지 목록.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { UiLineText } from '@/components/ui/ui-line-text';
import { CHALLENGE_STACK_PATHS } from '@/constants/navigation/route-ownership';
import {
  getFabBottomAboveTabBar,
  getTabScreenScrollPaddingBottom,
} from '@/constants/navigation/tab-bar-metrics';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useAppData } from '@/contexts/app-data-context';
import { useCreateSheetContext } from '@/contexts/create-sheet-context';
import { useLoading } from '@/contexts/loading-context';
import { useCategoryEmojiMap } from '@/hooks/use-category-emoji-map';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { logEvent } from '@/utils/analytics';
import { getChallengesByDateRange } from '@/utils/challenges';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { tabReselectEvent } from '@/utils/tab-reselect-event';
import { getCustomMonthInfo, getCustomMonthRange, isDateInCustomMonth } from '@/utils/custom-month';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const FAB_SIZE = 48;

/** 월 변경 시 페이드 아웃/인 애니메이션 (챌린지·타임라인 동일) */
const MONTH_CHANGE_FADE_OUT_DURATION = 150;
const MONTH_CHANGE_FADE_IN_DURATION = 200;

interface ChallengeData {
  id: string;
  category: string;
  startDate: string;
  endDate: string;
  targetAmount: number;
  createdAt: number;
  recurringId: string;
}

function calendarDataJsonReviver(key: string, value: unknown): unknown {
  if (key === 'recurringType' && value === null) return undefined;
  return value;
}

/** 챌린지 목록별 소비 합산 (calendarData 1회 로드) */
async function computeChallengeAmountsForList(
  challengeList: ChallengeData[],
): Promise<Record<string, number>> {
  const amounts: Record<string, number> = {};
  for (const challenge of challengeList) {
    amounts[challenge.id] = 0;
  }
  if (challengeList.length === 0) return amounts;

  const storedData = await AsyncStorage.getItem('calendarData');
  if (!storedData) return amounts;

  const calendarData = JSON.parse(storedData, calendarDataJsonReviver) as Record<string, unknown>;

  for (const challenge of challengeList) {
    let totalAmount = 0;
    const startDate = new Date(challenge.startDate.replace(/\./g, '-'));
    const endDate = new Date(challenge.endDate.replace(/\./g, '-'));

    Object.entries(calendarData).forEach(([dateString, data]) => {
      const itemDate = new Date(dateString);
      if (
        itemDate >= startDate &&
        itemDate <= endDate &&
        data &&
        typeof data === 'object' &&
        'records' in data
      ) {
        const records = (data as { records?: unknown[] }).records;
        if (Array.isArray(records)) {
          records.forEach((value) => {
            const record = value as {
              isDeleted?: boolean;
              isRefunded?: boolean;
              type?: string;
              category?: string;
              amount?: number;
            };
            if (record.isDeleted || record.isRefunded) return;
            if (record.type === 'expense' && record.category === challenge.category) {
              totalAmount += record.amount || 0;
            }
          });
        }
      }
    });
    amounts[challenge.id] = totalAmount;
  }

  return amounts;
}

interface MonthSwitcherProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  textColor: string;
  fillColor: string;
  assistiveColor: string;
  /** 년/월 텍스트 탭 시 호출 (타임라인 탑 네비와 동일한 년월 피커 열기) */
  onDatePress?: () => void;
}

const MonthSwitcher: React.FC<MonthSwitcherProps> = ({
  year,
  month,
  onPrev,
  onNext,
  textColor,
  fillColor,
  assistiveColor,
  onDatePress,
}) => {
  const dateLabel = `${year}년 ${String(month).padStart(2, '0')}월`;
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

      {onDatePress != null ? (
        <Pressable
          onPress={onDatePress}
          style={styles.periodTextWithArrow}
          accessibilityRole="button"
          accessibilityLabel="년월 선택"
        >
          <UiLineText variant="body01Bold" style={[styles.periodText, { color: textColor }]}>
            {dateLabel}
          </UiLineText>
        </Pressable>
      ) : (
        <UiLineText variant="body01Bold" style={[styles.periodText, { color: textColor }]}>
          {dateLabel}
        </UiLineText>
      )}

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
  const insets = useSafeAreaInsets();
  const bottomContentInset = getTabScreenScrollPaddingBottom(insets.bottom);
  const fabBottom = getFabBottomAboveTabBar(insets.bottom);
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
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
  const isNavigating = useRef(false);

  const params = useLocalSearchParams<{ year?: string; month?: string }>();

  const now = new Date();
  const initialYear = params.year ? parseInt(params.year, 10) || now.getFullYear() : now.getFullYear();
  const initialMonth = params.month ? parseInt(params.month, 10) || now.getMonth() + 1 : now.getMonth() + 1;
  const [challengeYear, setChallengeYear] = useState(initialYear);
  const [challengeMonth, setChallengeMonth] = useState(initialMonth);
  const [showYearMonthPicker, setShowYearMonthPicker] = useState(false);
  // 년/월 피커 옵션 (타임라인 탑 네비와 100% 동일: ±10년, 1~12월)
  const yearOptions = useMemo(() => {
    const cy = new Date().getFullYear();
    return Array.from({ length: 21 }, (_, i) => {
      const y = cy - 10 + i;
      return { label: `${y}년`, value: y };
    });
  }, []);
  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { label: `${m}월`, value: m };
    });
  }, []);

  // 생성·수정 후 넘긴 year/month가 있으면 해당 연·월로 표시 (탭 재진입 시에도 동기화)
  useEffect(() => {
    const paramYear = params.year ? parseInt(params.year, 10) : undefined;
    const paramMonth = params.month ? parseInt(params.month, 10) : undefined;
    if (paramYear != null && !Number.isNaN(paramYear)) {
      setChallengeYear(paramYear);
    }
    if (paramMonth != null && !Number.isNaN(paramMonth) && paramMonth >= 1 && paramMonth <= 12) {
      setChallengeMonth(paramMonth);
    }
  }, [params.year, params.month]);

  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [challengeAmounts, setChallengeAmounts] = useState<Record<string, number>>({});
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const hasAnimatedRef = useRef(false);

  // 탭 진입 시 탑 네비 + 날짜 박스 페이드인용 (월 변경 시에는 사용 안 함, 1로 유지)
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const hasInitiallyFadedInRef = useRef(false);

  // 챌린지 탭 월 변경 시 페이드 아웃/인 (타임라인과 동일)
  const prevChallengeMonthRef = useRef<{ year: number; month: number } | null>(null);
  const challengeRefreshedForRef = useRef<{ year: number; month: number } | null>(null);
  const challengeMonthChangeInProgressRef = useRef(false);
  const challengeDidFadeInRef = useRef(false);

  const refreshData = useCallback(async () => {
    beginLoad();
    try {
      if (!hasAnimatedRef.current) {
        setIsContentReady(false);
      }

      const monthStart = await loadMonthStartDay();

      const { startDate: customStart, endDate: customEnd } = getCustomMonthRange(
        challengeYear,
        challengeMonth,
        monthStart,
      );
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
        return isDateInCustomMonth(startDate, challengeYear, challengeMonth, monthStart);
      });
      const amounts = await computeChallengeAmountsForList(activeChallenges);
      setChallenges(activeChallenges);
      setChallengeAmounts(amounts);

      setIsContentReady(true);
      hasAnimatedRef.current = true;
      challengeRefreshedForRef.current = { year: challengeYear, month: challengeMonth };
      if (challengeMonthChangeInProgressRef.current) {
        challengeMonthChangeInProgressRef.current = false;
        challengeDidFadeInRef.current = true;
        contentOpacity.setValue(0);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: MONTH_CHANGE_FADE_IN_DURATION,
          useNativeDriver: true,
        }).start();
      }
    } catch (err) {
      console.error('[challenge-tab] Failed to load challenges:', err);
      setChallenges([]);
      setChallengeAmounts({});
      setIsContentReady(true);
      hasAnimatedRef.current = true;
      challengeRefreshedForRef.current = { year: challengeYear, month: challengeMonth };
      if (challengeMonthChangeInProgressRef.current) {
        challengeMonthChangeInProgressRef.current = false;
        challengeDidFadeInRef.current = true;
        contentOpacity.setValue(0);
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: MONTH_CHANGE_FADE_IN_DURATION,
          useNativeDriver: true,
        }).start();
      }
    } finally {
      endLoad();
    }
  }, [challengeYear, challengeMonth, beginLoad, endLoad, contentOpacity]);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  const { dataVersion } = useAppData();
  useEffect(() => {
    refreshData();
  }, [dataVersion, challengeYear, challengeMonth, refreshData]);

  // 챌린지 탭에서 FAB를 열 때도, 홈과 동일하게 현재 보고 있는 년/월 정보를 공유
  useEffect(() => {
    const paddedMonth = String(challengeMonth).padStart(2, '0');
    const syntheticDate = `${challengeYear}-${paddedMonth}-01`;

    updateCalendarContext({
      selectedDate: syntheticDate,
      calendarYear: challengeYear,
      calendarMonth: challengeMonth,
    });
  }, [challengeYear, challengeMonth, updateCalendarContext]);

  // 탭 진입 시: 탑 네비 + 날짜 박스 페이드인 (최초 1회만, 이후 screenOpacity는 1 유지)
  useEffect(() => {
    if (!isContentReady || hasInitiallyFadedInRef.current) return;
    hasInitiallyFadedInRef.current = true;
    screenOpacity.setValue(0);
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: MONTH_CHANGE_FADE_IN_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isContentReady, screenOpacity]);

  // 챌린지 카드 리스트 페이드인 (탭 진입 시 + 월 변경 시)
  useEffect(() => {
    if (isContentReady) {
      if (challengeDidFadeInRef.current) {
        challengeDidFadeInRef.current = false;
        return;
      }
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: MONTH_CHANGE_FADE_IN_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);

  // 월 변경 감지 → 페이드아웃, 로딩 완료 시 페이드인 (타임라인과 동일)
  useEffect(() => {
    const prev = prevChallengeMonthRef.current;
    if (prev === null) {
      prevChallengeMonthRef.current = { year: challengeYear, month: challengeMonth };
      return;
    }
    if (prev.year !== challengeYear || prev.month !== challengeMonth) {
      prevChallengeMonthRef.current = { year: challengeYear, month: challengeMonth };
      challengeRefreshedForRef.current = null;
      challengeMonthChangeInProgressRef.current = true;
      Animated.timing(contentOpacity, {
        toValue: 0,
        duration: MONTH_CHANGE_FADE_OUT_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (
          finished &&
          (challengeRefreshedForRef.current?.year !== challengeYear ||
            challengeRefreshedForRef.current?.month !== challengeMonth)
        ) {
          setIsContentReady(false);
        }
      });
    }
  }, [challengeYear, challengeMonth, contentOpacity]);

  // 오늘 날짜 기준으로, 커스텀 월 시작일을 반영한 년/월로 이동
  const resetToCurrentMonth = useCallback(async () => {
    const today = new Date();
    const monthStart = await loadMonthStartDay();
    const customMonthInfo = getCustomMonthInfo(today, monthStart);

    setChallengeYear(customMonthInfo.year);
    setChallengeMonth(customMonthInfo.month);
  }, []);

  // 이미 선택된 탭을 다시 탭 → 중첩 화면 닫고 이번 달로 리셋 (NativeTabs 재선택)
  useEffect(() => {
    return tabReselectEvent.subscribe((tabName) => {
      if (tabName !== 'challenge') {
        return;
      }
      if (router.canDismiss()) {
        router.dismissTo(CHALLENGE_STACK_PATHS.index);
      }
      resetToCurrentMonth().catch((error) => {
        console.error('[challenge-tab] Failed to reset to today:', error);
      });
    });
  }, [resetToCurrentMonth, router]);

  const handlePrevMonth = useCallback(() => {
    setChallengeMonth((prevMonth) => {
      if (prevMonth === 1) {
        setChallengeYear((prevYear) => prevYear - 1);
        return 12;
      }
      return prevMonth - 1;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setChallengeMonth((prevMonth) => {
      if (prevMonth === 12) {
        setChallengeYear((prevYear) => prevYear + 1);
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
      <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top']}>
        {/* 탭 진입 시: 데이터 로드 완료 후 탑 네비 + 날짜 박스 페이드인 (월 변경 시에는 애니메이션 없음) */}
        <Animated.View style={{ opacity: screenOpacity }}>
          <TopNavigation
            type="main"
            title="챌린지"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.content,
            {
              backgroundColor: palette.fill,
              opacity: screenOpacity,
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* 날짜 박스 - 고정 */}
          <MonthSwitcher
            year={challengeYear}
            month={challengeMonth}
            onPrev={handlePrevMonth}
            onNext={handleNextMonth}
            textColor={palette.text}
            fillColor={palette.fill}
            assistiveColor={palette.textAssistive}
            onDatePress={() => setShowYearMonthPicker(true)}
          />

          {/* 챌린지 카드 리스트 - 로딩 완료 시 페이드인 */}
          <Animated.View style={{ flex: 1, opacity: isContentReady ? contentOpacity : 0 }}>
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomContentInset },
            ]}
            bounces={false}
            overScrollMode="never"
          >
            {challenges.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon name="info" variant="line" size={24} color={palette.textAssistive} />
                <Text style={[styles.emptyText, { color: palette.textAssistive }]}>
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
                  style={[styles.challengeCard, { backgroundColor: palette.staticWhite }]}
                  onPress={() => {
                    if (isNavigating.current) return;
                    void logEvent('list', {
                      screen_name: '/challenge',
                      target: 'challenge-item',
                    });
                    isNavigating.current = true;
                    router.push({ pathname: '/challenge-detail', params: { challengeId: challenge.id } });
                    setTimeout(() => { isNavigating.current = false; }, 500);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${challenge.category} 챌린지`}
                >
                  <View style={styles.challengeHeader}>
                    <View style={styles.challengeCategory}>
                      <UiLineText variant="body01Bold" style={[styles.challengeCategoryName, { color: palette.text }]}>
                        {categoryEmoji || '📝'} {challenge.category}
                      </UiLineText>
                      {status.showProgressComplete && status.bgColor !== 'transparent' && (
                        <View style={[styles.statusBadge, { backgroundColor: status.bgColor }]}>
                          <Text style={[styles.statusText, { color: '#ffffff' }]}>{status.text}</Text>
                        </View>
                      )}
                    </View>
                    <UiLineText variant="body01Bold" style={[styles.statusLabel, { color: palette.text }]}>
                      {status.rightLabel}
                    </UiLineText>
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
                      <Text style={[styles.amountLabel, { color: palette.textAssistive }]}>현재 소비금액</Text>
                      <UiLineText variant="body01Bold" style={[styles.amountValue, { color: palette.textNeutral }]}>
                        {status.isBeforeStart ? '0원' : `${currentAmount.toLocaleString()}원`}
                      </UiLineText>
                    </View>
                    <View style={styles.amountRight}>
                      <Text style={[styles.amountLabel, { color: palette.textAssistive }]}>목표 소비금액</Text>
                      <UiLineText variant="body01Bold" style={[styles.amountValue, { color: palette.textNeutral }]}>
                        {targetAmount.toLocaleString()}원
                      </UiLineText>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            </View>
          )}
          </ScrollView>
          </Animated.View>
        </Animated.View>

        {/* 년/월 피커 (타임라인 탑 네비와 100% 동일한 DatePicker) */}
        <DatePicker
          visible={showYearMonthPicker}
          onClose={() => setShowYearMonthPicker(false)}
          title="년/월 선택"
          yearOptions={yearOptions}
          selectedYear={challengeYear}
          onYearChange={(newYear) => {
            const minY = yearOptions[0]?.value ?? newYear;
            const maxY = yearOptions[yearOptions.length - 1]?.value ?? newYear;
            setChallengeYear(Math.min(maxY, Math.max(minY, newYear)));
          }}
          monthOptions={monthOptions}
          selectedMonth={challengeMonth}
          onMonthChange={setChallengeMonth}
        />

        <View collapsable={false} style={styles.bottomChromeAnchor} pointerEvents="box-none">
          <Pressable
            style={[
              styles.fab,
              styles.fabShadow,
              {
                backgroundColor: palette.primary,
                bottom: fabBottom,
              },
            ]}
            onPress={() => createSheetEvent.emit()}
            accessibilityRole="button"
            accessibilityLabel="기록 또는 챌린지 선택"
          >
            <Icon name="addTaskFab" variant="line" size={24} color={palette.staticWhite} />
          </Pressable>
        </View>
      </SafeAreaView>
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
  bottomChromeAnchor: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 21,
  },
  fabShadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 21,
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
    backgroundColor: colors.light.staticWhite,
  },
  periodTextWithArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  periodText: {
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyText: {
    ...typography.body01.regular,
    marginTop: 12,
  },
  challengeList: {
    paddingHorizontal: 16,
    gap: 16,
  },
  challengeCard: {
    borderRadius: 16,
    padding: 16,
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
    
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusText: {
    ...typography.detail.bold,
  },
  statusLabel: {
    
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
    ...typography.detail.regular,
    marginBottom: 2,
  },
  amountValue: {
    
  },
});
