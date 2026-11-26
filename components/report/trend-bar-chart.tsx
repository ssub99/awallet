/**
 * 월별 지출 막대그래프 — 좌우 스크롤. 보이는 막대 수는 화면 너비에 따라 달라진다.
 * Figma `[Awallet]Home_report_default` (3016:33718)
 */

import { atomicColors } from '@/constants/atomic-colors';
import { typography, type ColorPalette } from '@/constants/theme';
import { useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const COLUMN_WIDTH = 44;
const MAX_BAR_HEIGHT = 108;
const MIN_BAR_HEIGHT = 4;
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
  /** 이 달이 화면 밖이면 오른쪽 끝에 오도록 스크롤 */
  anchorIndex: number;
  palette: ColorPalette;
  onPressBar: (monthIndex: number) => void;
}

export function TrendBarChart({ bars, anchorIndex, palette, onPressBar }: TrendBarChartProps) {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const widthRef = useRef(0);
  const offsetRef = useRef<number | null>(null);
  const firstMonthIndex = bars[0]?.monthIndex ?? anchorIndex;
  const maxAmount = bars.reduce((max, bar) => Math.max(max, bar.amount), 0);

  const revealAnchor = useCallback(() => {
    const width = widthRef.current;
    if (width <= 0) return;
    const right = (anchorIndex - firstMonthIndex + 1) * COLUMN_WIDTH;
    const left = right - COLUMN_WIDTH;
    const offset = offsetRef.current;
    if (offset !== null && left >= offset && right <= offset + width) return;
    // 처음에는 오른쪽 끝에 맞추고, 이후에는 가려진 만큼만 움직인다
    const nextOffset = Math.max(0, offset !== null && left < offset ? left : right - width);
    offsetRef.current = nextOffset;
    scrollRef.current?.scrollTo({ x: nextOffset, animated: false });
  }, [anchorIndex, firstMonthIndex]);

  useEffect(() => {
    revealAnchor();
  }, [revealAnchor]);

  return (
    <View style={[styles.card, { backgroundColor: palette.staticWhite }]}>
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
          revealAnchor();
        }}
        onContentSizeChange={revealAnchor}
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
              <View
                style={[
                  styles.bar,
                  {
                    height:
                      bar.amount > 0
                        ? Math.max(MIN_BAR_HEIGHT, (bar.amount / maxAmount) * MAX_BAR_HEIGHT)
                        : MIN_BAR_HEIGHT,
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
            <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
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
    height: 169,
    borderRadius: 12,
    overflow: 'hidden',
  },
  baseline: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 123,
    height: 1,
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
    ...typography.body02.bold,
  },
});
