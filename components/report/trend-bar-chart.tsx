/**
 * 월별 지출 막대그래프(추세) — 좌우 스크롤. 보이는 막대 수는 화면 너비에 따라 달라진다.
 * Figma `[Awallet]Home_report_default` (3016:33718)
 */

import { atomicColors } from '@/constants/atomic-colors';
import { typography, type ColorPalette } from '@/constants/theme';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
const MIN_BAR_HEIGHT = 4;
const GROW_DURATION = 900;
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
}

interface TrendBarChartProps {
  /** 오래된 달 → 최신 달 */
  bars: TrendBar[];
  /** 선택 범위의 마지막 달 — 화면 밖이면 보이도록 스크롤 */
  revealIndex: number;
  /** 선택 범위에서 소비 금액이 0원인 날 수 */
  noSpendDays: number;
  /** 값이 바뀌면 막대가 아래에서부터 다시 올라온다 */
  growKey: string;
  palette: ColorPalette;
  onPressBar: (monthIndex: number) => void;
}

export function TrendBarChart({
  bars,
  revealIndex,
  noSpendDays,
  growKey,
  palette,
  onPressBar,
}: TrendBarChartProps) {
  /** 0 = 바닥, 1 = 실제 높이 */
  const [grow] = useState(() => new Animated.Value(1));
  const growKeyRef = useRef(growKey);
  // 새 높이가 화면에 먼저 보이지 않도록 그리기 전에 바닥으로 내린다
  useLayoutEffect(() => {
    if (growKeyRef.current === growKey) return;
    growKeyRef.current = growKey;
    grow.setValue(0);
    Animated.timing(grow, {
      toValue: 1,
      duration: GROW_DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [grow, growKey]);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const widthRef = useRef(0);
  const offsetRef = useRef<number | null>(null);
  const firstMonthIndex = bars[0]?.monthIndex ?? revealIndex;
  const maxAmount = bars.reduce((max, bar) => Math.max(max, bar.amount), 0);

  const revealMonth = useCallback(() => {
    const width = widthRef.current;
    if (width <= 0) return;
    const right = (revealIndex - firstMonthIndex + 1) * COLUMN_WIDTH;
    const left = right - COLUMN_WIDTH;
    const offset = offsetRef.current;
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
            accessibilityRole="button"
            accessibilityLabel={bar.accessibilityLabel}
          >
            <View style={styles.barArea}>
              <Animated.View
                style={[
                  styles.bar,
                  {
                    height: grow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [
                        MIN_BAR_HEIGHT,
                        bar.amount > 0
                          ? Math.max(MIN_BAR_HEIGHT, (bar.amount / maxAmount) * MAX_BAR_HEIGHT)
                          : MIN_BAR_HEIGHT,
                      ],
                    }),
                    backgroundColor:
                      bar.tone === 'over'
                        ? palette.statusNegative
                        : bar.tone === 'within'
                          ? BAR_FILL_WITHIN
                          : BAR_FILL_OUTSIDE,
                    borderColor:
                      bar.tone === 'outside' ? atomicColors.neutral[400] : atomicColors.neutral[800],
                  },
                ]}
              />
            </View>
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
    paddingTop: 16,
    alignItems: 'center',
    gap: 8,
  },
  barArea: {
    height: MAX_BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 24,
    borderWidth: 1,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  label: {
    ...typography.body02.regular,
  },
  labelActive: {
    ...typography.body02.bold,
  },
});
