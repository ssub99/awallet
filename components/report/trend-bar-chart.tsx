/**
 * 월별 지출 막대그래프(추세) — 좌우 스크롤. 보이는 막대 수는 화면 너비에 따라 달라진다.
 * Figma `[Awallet]Home_report_default` (3016:33718)
 */

import { atomicColors } from '@/constants/atomic-colors';
import { typography, type ColorPalette } from '@/constants/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const COLUMN_WIDTH = 44;
const MAX_BAR_HEIGHT = 100;
/** 막대 층의 위 여백 — 가장 높은 막대의 그림자가 잘리지 않을 자리 */
const BAR_AREA_TOP_SPACE = 16;
/** 막대 층이 칸 양옆으로 더 넓은 만큼. 막대 옆 여백(10)과 합쳐 그림자 블러(16)를 담는다 */
const SHADOW_BLEED = 6;
const MIN_BAR_HEIGHT = 4;
/** 선택한 달의 드롭 섀도 — 색은 막대 채움색(6자리 hex)에 알파를 붙여 쓴다 */
const SELECTED_SHADOW_OFFSET = '0px 2px 16px 0px';
/** 불투명도 65% */
const SELECTED_SHADOW_ALPHA = 'A6';
/** 금액이 바뀔 때 막대가 새 높이로 옮겨 가는 시간 */
const RESIZE_DURATION = 900;
/** 막대를 취합에서 빼거나 되돌리는 길게 누르기 시간 */
const LONG_PRESS_DELAY = 500;
/** 시안 채움색 — Figma에서 토큰에 묶이지 않은 값 */
const BAR_FILL_WITHIN = '#22CD64';
const BAR_FILL_OUTSIDE = '#C8C8C8';

export type TrendBarTone = 'over' | 'within' | 'outside';

export interface TrendBar {
  monthIndex: number;
  label: string;
  accessibilityLabel: string;
  amount: number;
  tone: TrendBarTone;
  /** 사용자가 선택한 달 — 범위 안에서도 이 달만 드롭 섀도를 준다 */
  isSelected: boolean;
}

interface TrendBarChartProps {
  /** 오래된 달 → 최신 달 */
  bars: TrendBar[];
  /** 선택 범위의 마지막 달 — 화면 밖이면 보이도록 스크롤 */
  revealIndex: number;
  /** 선택 범위에서 소비 금액이 0원인 날 수 */
  noSpendDays: number;
  palette: ColorPalette;
  onPressBar: (monthIndex: number) => void;
  /** 반응할지는 받는 쪽이 정한다. 길게 누른 뒤 손을 떼도 `onPressBar`는 불리지 않는다 */
  onLongPressBar: (monthIndex: number) => void;
}

interface TrendBarShapeProps {
  height: number;
  fillColor: string;
  borderColor: string;
  isSelected: boolean;
}

/** 막대 하나 — 처음에는 바로 그리고, 높이가 바뀌면 지금 높이에서 새 높이로 움직인다 */
function TrendBarShape({ height, fillColor, borderColor, isSelected }: TrendBarShapeProps) {
  const [animatedHeight] = useState(() => new Animated.Value(height));
  useEffect(() => {
    const animation = Animated.timing(animatedHeight, {
      toValue: height,
      duration: RESIZE_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    // 움직이는 중에 값이 또 바뀌면 멈춘 높이에서 이어 간다
    return () => animation.stop();
  }, [animatedHeight, height]);

  return (
    <Animated.View
      style={[
        styles.bar,
        { height: animatedHeight, backgroundColor: fillColor, borderColor },
        isSelected && { boxShadow: `${SELECTED_SHADOW_OFFSET} ${fillColor}${SELECTED_SHADOW_ALPHA}` },
      ]}
    />
  );
}

export function TrendBarChart({
  bars,
  revealIndex,
  noSpendDays,
  palette,
  onPressBar,
  onLongPressBar,
}: TrendBarChartProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const widthRef = useRef(0);
  const offsetRef = useRef<number | null>(null);
  const firstMonthIndex = bars[0]?.monthIndex ?? revealIndex;
  /** `offsetRef`가 기준으로 삼은 첫 막대의 달 */
  const offsetBaseRef = useRef(firstMonthIndex);
  const maxAmount = bars.reduce((max, bar) => Math.max(max, bar.amount), 0);

  const revealMonth = useCallback(() => {
    const width = widthRef.current;
    if (width <= 0) return;
    const right = (revealIndex - firstMonthIndex + 1) * COLUMN_WIDTH;
    const left = right - COLUMN_WIDTH;
    // 왼쪽에 달이 늘면 보던 막대는 그만큼 오른쪽으로 밀린다 (화면 위치는 ScrollView가 유지)
    const added = (offsetBaseRef.current - firstMonthIndex) * COLUMN_WIDTH;
    offsetBaseRef.current = firstMonthIndex;
    if (offsetRef.current !== null) offsetRef.current += added;
    // 왼쪽 달이 줄면 보던 위치를 이어 갈 수 없으므로 구간을 오른쪽 끝에 다시 맞춘다
    const offset = added < 0 ? null : offsetRef.current;
    if (offset !== null && left >= offset && right <= offset + width) return;
    // 처음에는 오른쪽 끝에 맞추고, 이후에는 가려진 만큼만 움직인다
    const nextOffset = Math.max(0, offset !== null && left < offset ? left : right - width);
    offsetRef.current = nextOffset;
    scrollRef.current?.scrollTo({ x: nextOffset, animated: false });
  }, [revealIndex, firstMonthIndex]);

  useEffect(() => {
    revealMonth();
  }, [revealMonth]);

  return (
    <View style={[styles.card, { backgroundColor: palette.staticWhite }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.text }]}>추세</Text>
        <View style={styles.noSpend}>
          <Text style={[styles.noSpendLabel, { color: palette.textNeutral }]}>소비 없는날</Text>
          <Text style={[styles.title, { color: palette.textNeutral }]}>
            {noSpendDays.toLocaleString()}일
          </Text>
        </View>
      </View>
      <View style={[styles.baseline, { backgroundColor: palette.border }]} />
      <ScrollView
        ref={scrollRef}
        horizontal
        // 왼쪽에 달이 늘어도 보던 막대가 제자리에 있게 한다
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        scrollEventThrottle={16}
        onScroll={(event) => {
          offsetRef.current = event.nativeEvent.contentOffset.x;
        }}
        onLayout={(event) => {
          widthRef.current = event.nativeEvent.layout.width;
          revealMonth();
        }}
        onContentSizeChange={revealMonth}
      >
        {bars.map((bar) => (
          <Pressable
            key={bar.monthIndex}
            style={styles.column}
            onPress={() => onPressBar(bar.monthIndex)}
            onLongPress={() => onLongPressBar(bar.monthIndex)}
            delayLongPress={LONG_PRESS_DELAY}
            accessibilityRole="button"
            accessibilityLabel={bar.accessibilityLabel}
            accessibilityState={{ selected: bar.isSelected }}
          >
            {/* 바닥선에서 잘라 그림자가 날짜 영역(옆 달 포함)으로 내려가지 않게 한다 */}
            <View style={styles.barArea} pointerEvents="none">
              <TrendBarShape
                height={
                  bar.amount > 0
                    ? Math.max(MIN_BAR_HEIGHT, (bar.amount / maxAmount) * MAX_BAR_HEIGHT)
                    : MIN_BAR_HEIGHT
                }
                fillColor={
                  bar.tone === 'over'
                    ? palette.statusNegative
                    : bar.tone === 'within'
                      ? BAR_FILL_WITHIN
                      : BAR_FILL_OUTSIDE
                }
                borderColor={
                  bar.tone === 'outside' ? atomicColors.neutral[400] : atomicColors.neutral[800]
                }
                isSelected={bar.isSelected}
              />
            </View>
            {/* 막대 아래의 날짜 층 — 배경을 채워 막대 층과 구분한다 */}
            <View
              style={[
                styles.labelLayer,
                { backgroundColor: palette.staticWhite, borderTopColor: palette.border },
              ]}
            >
              {/* 선택(활성)된 달만 굵게 */}
              <Text
                style={
                  bar.tone === 'outside'
                    ? [styles.label, { color: palette.textAssistive }]
                    : [styles.labelActive, { color: palette.textNeutral }]
                }
                numberOfLines={1}
              >
                {bar.label}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 206,
    borderRadius: 12,
    overflow: 'hidden',
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 160,
    height: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    ...typography.body02.bold,
  },
  noSpend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  noSpendLabel: {
    ...typography.body02.regular,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  column: {
    width: COLUMN_WIDTH,
    alignItems: 'center',
  },
  barArea: {
    width: COLUMN_WIDTH + SHADOW_BLEED * 2,
    height: BAR_AREA_TOP_SPACE + MAX_BAR_HEIGHT,
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bar: {
    width: 24,
    borderWidth: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  /** 윗선은 카드의 바닥선과 같은 위치·색 (층이 바닥선을 덮으므로 다시 그린다) */
  labelLayer: {
    alignSelf: 'stretch',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 7,
  },
  label: {
    ...typography.body02.regular,
  },
  labelActive: {
    ...typography.body02.bold,
  },
});
