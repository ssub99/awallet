/**
 * Android spinner wheel column (년·월, 개월 수 등 단일 옵션 목록).
 */

import { Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { resolvePickerValue } from '@/utils/android-date-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { DatePickerOption } from '@/components/ui/date-picker';

const ITEM_HEIGHT = 48;
const VISIBLE_ITEM_COUNT = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEM_COUNT;
const WHEEL_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ITEM_COUNT / 2);

/** Android ScrollView 관성 (기본 0.985). 낮을수록 빨리 멈춤 */
const WHEEL_DECELERATION_RATE = 0.7;

export interface AndroidSpinnerWheelColumnProps {
  options: DatePickerOption[];
  value: number | undefined;
  onValueChange: (value: number) => void;
  active?: boolean;
}

export function AndroidSpinnerWheelColumn({
  options,
  value,
  onValueChange,
  active = true,
}: AndroidSpinnerWheelColumnProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const scrollRef = useRef<ScrollView>(null);
  const isUserScrollingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const lastSyncedValueRef = useRef<number | undefined>(undefined);

  const [displayValue, setDisplayValue] = useState<number | undefined>(() =>
    resolvePickerValue(value, options),
  );

  const scrollToValue = useCallback(
    (targetValue: number | undefined, animated: boolean) => {
      if (options.length === 0 || targetValue === undefined) {
        return;
      }
      const index = options.findIndex((option) => option.value === targetValue);
      const safeIndex = index >= 0 ? index : 0;
      scrollRef.current?.scrollTo({
        y: safeIndex * ITEM_HEIGHT,
        animated,
      });
    },
    [options],
  );

  const syncScrollPosition = useCallback(
    (targetValue: number | undefined, animated: boolean) => {
      if (targetValue === undefined) {
        return;
      }
      scrollToValue(targetValue, animated);
      lastSyncedValueRef.current = targetValue;
    },
    [scrollToValue],
  );

  useEffect(() => {
    if (!active) {
      isInitializedRef.current = false;
      lastSyncedValueRef.current = undefined;
      return;
    }

    const resolved = resolvePickerValue(value, options);
    if (resolved === undefined) {
      return;
    }

    setDisplayValue(resolved);

    if (isUserScrollingRef.current) {
      return;
    }

    if (lastSyncedValueRef.current === resolved) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      syncScrollPosition(resolved, false);
      isInitializedRef.current = true;
    });

    return () => cancelAnimationFrame(frame);
  }, [active, options, syncScrollPosition, value]);

  const resolveIndexFromOffset = (offsetY: number) => {
    const rawIndex = Math.round(offsetY / ITEM_HEIGHT);
    return Math.max(0, Math.min(options.length - 1, rawIndex));
  };

  const commitOffset = (offsetY: number) => {
    if (!isInitializedRef.current) {
      return;
    }
    const index = resolveIndexFromOffset(offsetY);
    const next = options[index]?.value;
    if (next !== undefined && next !== displayValue) {
      lastSyncedValueRef.current = next;
      setDisplayValue(next);
      onValueChange(next);
    }
  };

  const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    isUserScrollingRef.current = false;
    commitOffset(event.nativeEvent.contentOffset.y);
  };

  const handleContentSizeChange = () => {
    if (!active || isUserScrollingRef.current || displayValue === undefined) {
      return;
    }
    syncScrollPosition(displayValue, false);
    isInitializedRef.current = true;
  };

  if (options.length === 0 || displayValue === undefined) {
    return <View style={styles.wheel} />;
  }

  return (
    <View style={styles.wheel}>
      <View
        style={[styles.selectionBand, { backgroundColor: colors.fill }]}
        pointerEvents="none"
      />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        overScrollMode="never"
        snapToInterval={ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate={WHEEL_DECELERATION_RATE}
        disableIntervalMomentum
        onContentSizeChange={handleContentSizeChange}
        onScrollBeginDrag={() => {
          isUserScrollingRef.current = true;
        }}
        onMomentumScrollEnd={handleScrollEnd}
        onScrollEndDrag={(event) => {
          commitOffset(event.nativeEvent.contentOffset.y);
          isUserScrollingRef.current = false;
        }}
      >
        {options.map((item) => {
          const isSelected = item.value === displayValue;
          return (
            <View key={item.value} style={styles.item}>
              <Text
                style={[
                  isSelected ? styles.itemTextSelected : styles.itemText,
                  { color: isSelected ? colors.text : colors.textNeutral },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    height: WHEEL_HEIGHT,
    width: '100%',
    overflow: 'hidden',
  },
  scroll: {
    height: WHEEL_HEIGHT,
    width: '100%',
  },
  selectionBand: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: WHEEL_PADDING,
    height: ITEM_HEIGHT,
    borderRadius: 8,
    zIndex: 1,
  },
  listContent: {
    paddingVertical: WHEEL_PADDING,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  itemText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
  },
  itemTextSelected: {
    ...Typography.body1.l.bold,
    textAlign: 'center',
  },
});
