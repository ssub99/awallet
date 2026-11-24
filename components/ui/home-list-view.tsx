/**
 * Home list view — 월 소비 요약 + 월 day strip(일 단위 조회) + 선택일 기록 리스트.
 * Figma: [Awallet]Home_month (home.month.listView, 2980:33078)
 *
 * 스펙(Figma 토큰):
 * - 본문 배경 Semantic/Fill/Normal, 카드 Semantic/Static/White r16
 * - day strip: 해당 월 전체 일자를 가로 스크롤, 셀 폭 48 고정·gap 8, h61, r12 / 선택 = Atomic/Blue/50 + Primary 텍스트
 * - 기록 카드: 행 padding 16, 이모지 슬롯 48x48 Fill/Normal 원형(r24), 구분선 inset 16
 */

import { CountUpText } from '@/components/ui/count-up-text';
import { formatSignedBalanceText } from '@/utils/format-balance-text';
import { Tag } from '@/components/ui/tag';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getEmojiTintBackground } from '@/utils/emoji-tint';
import { getTimelineItemTags } from '@/utils/timeline-item-tags';
import type { TimelineListItem } from '@/utils/timeline-from-calendar';
import LottieView from 'lottie-react-native';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type GestureResponderEvent,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/**
 * 빈 상태 얼굴(둘 다 눈 깜빡임): 오늘 = 웃는 입(시안 A), 그 외 날짜 = 일자 입(시안 B).
 * smile은 face-flat-blink의 입 경로만 시안 A의 웃는 곡선으로 바꾼 파생 파일.
 */
const EMPTY_FACE_SMILE_BLINK = require('../../assets/lottie/face-smile-blink.json');
const EMPTY_FACE_FLAT_BLINK = require('../../assets/lottie/face-flat-blink.json');

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
/** day 셀 폭 고정 48 (한 자리·두 자리 동일), 셀 간 gap 8 */
const DAY_CELL_WIDTH = 48;
const DAY_CELL_GAP = 8;
/** 홈으로 돌아온 뒤 월 소비 금액 카운트업이 시작되기까지의 지연 */
const SUMMARY_COUNT_UP_DELAY_MS = 1000;
const DAY_STRIP_PADDING = 16;

export interface HomeListViewProps {
  /** 현재 커스텀 월의 시작~끝 날짜 (YYYY-MM-DD, 오름차순 연속) */
  dateKeys: string[];
  selectedDate: string;
  /** 선택일 기록 (이미 정렬된 상태) */
  items: TimelineListItem[];
  /** 요약 타이틀 (예: "11월 소비") */
  summaryLabel: string;
  /** 이번 달 잔액 (원). 값이 바뀌면 카운트업으로 보여준다. 양수 `+`·음수 `-` 부호로 표기 */
  summaryAmount: number;
  /** 카운트업 허용(홈 포커스 중). 홈이 다시 보일 때 이전 금액에서 새 금액으로 올라간다 */
  countUpActive: boolean;
  /** 월이 바뀌면 카운트 없이 즉시 새 금액으로 (예: `2026-11`) */
  countUpResetKey: string;
  categoryEmojiMap: Record<string, string>;
  bottomInset: number;
  onSelectDate: (dateKey: string) => void;
  /** 좌우 스와이프 월 전환 (타임라인과 동일). 왼쪽으로 밀면 다음 달 */
  onSwipeNextMonth: () => void;
  /** 오른쪽으로 밀면 이전 달 */
  onSwipePrevMonth: () => void;
  /** 홈 탭 재선택 횟수. 바뀌면 요일 스트립을 선택일 위치로 다시 스크롤한다 */
  reselectTick?: number;
  onDetailPress: () => void;
  onItemPress: (item: TimelineListItem) => void;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m - 1, d);
}

function formatAmount(item: TimelineListItem): string {
  const value = `${item.amount.toLocaleString()}원`;
  if (item.type === 'income') {
    return `+ ${value}`;
  }
  // 결산/할부 환불 기록은 부호 없이 표기 (타임라인과 동일)
  if (item.isSettled || (item.isInstallment && item.isRefunded)) {
    return value;
  }
  return `- ${value}`;
}

function resolveEmoji(item: TimelineListItem, map: Record<string, string>): string {
  const mapped = map[item.category || '수입'];
  if (mapped) {
    return mapped;
  }
  return item.type === 'income' ? '💰' : '📝';
}

function HomeListViewInner({
  dateKeys,
  selectedDate,
  items,
  summaryLabel,
  summaryAmount,
  countUpActive,
  countUpResetKey,
  categoryEmojiMap,
  bottomInset,
  onSelectDate,
  onDetailPress,
  onItemPress,
  onSwipeNextMonth,
  onSwipePrevMonth,
  reselectTick = 0,
}: HomeListViewProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const dayCells = useMemo(
    () =>
      dateKeys.map((key) => {
        const date = parseKey(key);
        return { key, day: date.getDate(), weekday: date.getDay() };
      }),
    [dateKeys],
  );

  const isTodaySelected = useMemo(() => {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return selectedDate === `${now.getFullYear()}-${m}-${d}`;
  }, [selectedDate]);

  /**
   * 좌우 스와이프로 월 전환 — monthly-expense-timeline과 같은 기준
   * (가로 이동 > 10 이고 세로보다 클 때 가로 스와이프로 보고, 손을 뗄 때 50 이상이면 전환).
   * 가로 스크롤인 요일 스트립의 제스처를 가로채지 않도록 스트립 밖(요약 카드·기록 카드)에만 단다.
   */
  // 콜백이 바뀔 때만 다시 만든다 (ref 없이 항상 최신 콜백을 쓴다)
  const monthSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState,
        ) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderRelease: (
          _evt: GestureResponderEvent,
          gestureState: PanResponderGestureState,
        ) => {
          const SWIPE_THRESHOLD = 50;
          if (gestureState.dx <= -SWIPE_THRESHOLD) {
            onSwipeNextMonth();
          } else if (gestureState.dx >= SWIPE_THRESHOLD) {
            onSwipePrevMonth();
          }
        },
      }),
    [onSwipeNextMonth, onSwipePrevMonth],
  );

  const stripRef = useRef<ScrollViewInstance>(null);
  /** 셀 x/폭 (hug 레이아웃이라 onLayout으로 측정) */
  const cellLayoutRef = useRef<Record<string, { x: number; width: number }>>({});
  const stripWidthRef = useRef(0);

  const scrollToSelected = useCallback(() => {
    const layout = cellLayoutRef.current[selectedDate];
    if (!layout || stripWidthRef.current <= 0) {
      return;
    }
    const x = Math.max(0, layout.x + layout.width / 2 - stripWidthRef.current / 2);
    stripRef.current?.scrollTo({ x, animated: true });
  }, [selectedDate]);

  // 선택일이 가운데 오도록 스크롤 (월 전환·외부 선택 변경 시)
  // reselectTick: 홈 탭을 다시 눌렀을 때 — 선택일이 그대로 오늘이어도 스트립을 선택일로 되돌린다
  useEffect(() => {
    const id = requestAnimationFrame(scrollToSelected);
    return () => cancelAnimationFrame(id);
  }, [dayCells, scrollToSelected, reselectTick]);

  return (
    <View style={styles.root}>
      {/* 월 소비 요약 */}
      <View
        style={[styles.summaryCard, { backgroundColor: palette.staticWhite }]}
        {...monthSwipeResponder.panHandlers}
      >
        <View style={styles.summaryTexts}>
          <Text style={[styles.summaryLabel, { color: palette.text }]}>{summaryLabel}</Text>
          <CountUpText
            value={summaryAmount}
            active={countUpActive}
            startDelayMs={SUMMARY_COUNT_UP_DELAY_MS}
            resetKey={countUpResetKey}
            format={formatSignedBalanceText}
            style={[styles.summaryAmount, { color: palette.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          />
        </View>
        <Pressable
          onPress={onDetailPress}
          style={[styles.detailButton, { backgroundColor: palette.fill }]}
          accessibilityRole="button"
          accessibilityLabel="내역 보기"
        >
          <Text style={[styles.detailButtonText, { color: palette.textNeutral }]}>내역</Text>
        </Pressable>
      </View>

      {/* day strip: 해당 월의 모든 일자 (일 단위 조회) */}
      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.strip}
        contentContainerStyle={styles.stripContent}
        onLayout={(e) => {
          stripWidthRef.current = e.nativeEvent.layout.width;
          scrollToSelected();
        }}
      >
        {dayCells.map((cell) => {
          const isSelected = cell.key === selectedDate;
          return (
            <Pressable
              key={cell.key}
              onPress={() => onSelectDate(cell.key)}
              onLayout={(e) => {
                cellLayoutRef.current[cell.key] = {
                  x: e.nativeEvent.layout.x,
                  width: e.nativeEvent.layout.width,
                };
                // 앱을 새로 켠 직후에는 선택일 셀이 아직 측정되기 전에 스크롤이 시도돼 건너뛰어진다.
                // 선택일 셀의 위치가 잡히는 시점에 다시 스크롤한다.
                if (isSelected) {
                  scrollToSelected();
                }
              }}
              style={[
                styles.dayCell,
                {
                  backgroundColor: isSelected ? atomicColors.blue[50] : palette.staticWhite,
                  borderColor: isSelected ? palette.primary : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${cell.day}일 ${WEEKDAY_LABELS[cell.weekday]}요일`}
            >
              <Text
                style={[
                  styles.dayWeekday,
                  { color: isSelected ? palette.primary : palette.textAssistive },
                ]}
              >
                {WEEKDAY_LABELS[cell.weekday]}
              </Text>
              <View style={styles.dayNumberWrap}>
                <Text
                  style={[
                    styles.dayNumber,
                    {
                      color: isSelected ? palette.primary : palette.textAssistive,
                    },
                  ]}
                >
                  {cell.day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 기록 리스트 카드: 요일 스트립 아래 ~ 하단 칩 위 12px까지 고정 영역. 행은 카드 안에서만 스크롤 */}
      <View
        style={[styles.list, { marginBottom: bottomInset }]}
        {...monthSwipeResponder.panHandlers}
      >
        <View style={[styles.listCard, { backgroundColor: palette.staticWhite }]}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <LottieView
                source={isTodaySelected ? EMPTY_FACE_SMILE_BLINK : EMPTY_FACE_FLAT_BLINK}
                autoPlay
                loop
                resizeMode="contain"
                style={styles.emptyFace}
              />
              <Text style={[styles.emptyText, { color: palette.textAssistive }]}>
                {isTodaySelected ? '오늘은 어떤 소비를 하셨나요?' : '소비내역이 존재하지 않습니다.'}
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {items.map((item, index) => {
                const tags = getTimelineItemTags(item);
                const emoji = resolveEmoji(item, categoryEmojiMap);
                const isLast = index === items.length - 1;
                return (
                  <View key={item.id ?? `${item.date}-${item.timestamp ?? index}-${index}`}>
                    <Pressable
                      style={styles.row}
                      onPress={() => onItemPress(item)}
                      accessibilityRole="button"
                    >
                      {/* 배경: 이모지 대표색의 옅은 색 (기존 회색 배경과 같은 정도). 대표색이 없으면 기존 회색 */}
                      <View
                        style={[
                          styles.emojiSlot,
                          { backgroundColor: getEmojiTintBackground(emoji, palette.fill) },
                        ]}
                      >
                        <Text style={styles.emoji}>{emoji}</Text>
                      </View>
                      <View style={styles.rowContent}>
                        <View style={styles.rowLine}>
                          <Text
                            style={[styles.category, { color: palette.text }]}
                            numberOfLines={1}
                          >
                            {item.category || '수입'}
                          </Text>
                          <Text
                            style={[styles.amount, { color: palette.text }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.7}
                          >
                            {formatAmount(item)}
                          </Text>
                        </View>
                        <View style={styles.rowLine}>
                          <Text
                            style={[styles.memo, { color: palette.textAssistive }]}
                            numberOfLines={1}
                          >
                            {item.memo ? item.memo.replace(/\n/g, ' ') : ' '}
                          </Text>
                          {tags.length > 0 && (
                            <View style={styles.tags}>
                              {tags.map((tag) => (
                                <Tag key={tag.label} label={tag.label} status={tag.status} />
                              ))}
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                    {!isLast && (
                      <View style={[styles.divider, { backgroundColor: palette.border }]} />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

export const HomeListView = memo(HomeListViewInner);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 16,
  },
  summaryCard: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryTexts: {
    flex: 1,
    gap: 4,
  },
  summaryLabel: {
    ...typography.body02.medium,
  },
  summaryAmount: {
    ...typography.headline04.bold,
  },
  detailButton: {
    width: 64,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailButtonText: {
    ...typography.button01.medium,
  },
  strip: {
    flexGrow: 0,
    marginTop: 12,
  },
  stripContent: {
    paddingHorizontal: DAY_STRIP_PADDING,
    gap: DAY_CELL_GAP,
  },
  dayCell: {
    width: DAY_CELL_WIDTH,
    height: 61,
    borderWidth: 1,
    paddingHorizontal: 3,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  dayWeekday: {
    ...typography.body02.medium,
  },
  dayNumberWrap: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    ...typography.headline04.bold,
  },
  list: {
    flex: 1,
    marginTop: 12,
    marginHorizontal: 16,
  },
  listCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 16,
  },
  /** Figma: headline04 (21px) 이모지 텍스트 */
  emoji: {
    ...typography.headline04.bold,
  },
  emojiSlot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowLine: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  category: {
    ...typography.body02.bold,
    flexShrink: 1,
  },
  amount: {
    ...typography.body02.bold,
    flexShrink: 0,
    textAlign: 'right',
  },
  memo: {
    ...typography.body02.regular,
    flex: 1,
  },
  tags: {
    flexDirection: 'row',
    gap: 4,
    flexShrink: 0,
  },
  divider: {
    height: 1, // 타임라인(monthly-expense-timeline)의 항목 구분선과 같은 두께·색
    marginHorizontal: 16,
  },
  /** 얼굴 72 + 8 간격 + 문구 24, 카드 가운데 (시안 96 → 72로 축소) */
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    // 시안은 정중앙보다 약간 위(카드 상단에서 81px)
    paddingBottom: 6,
    minHeight: 200,
  },
  emptyFace: {
    width: 72,
    height: 72,
  },
  emptyText: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
