/**
 * 단일 행 텍스트 — 가로 영역을 넘으면 fontSize·(필요 시) scale로 맞춤.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { resolveTextStyleMetrics } from '@/constants/typography/merge';
import {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  type TextStyle,
  TextLayoutEventData,
  View,
  type ViewStyle,
} from 'react-native';

const DEFAULT_HORIZONTAL_INSET = 2;
const DEFAULT_MIN_FONT_SCALE = 0.5;
const ABSOLUTE_MIN_FONT_SIZE = 8;
const MIN_VISUAL_SCALE = 0.88;
const CHAR_WIDTH_EM = 0.56;
const FIT_SAFETY = 0.98;

export interface AutoShrinkSingleLineTextProps {
  children: string;
  textStyle: TextStyle;
  color?: string;
  minFontScale?: number;
  horizontalInset?: number;
  /** 지정 시 자동 계산 대신 동일 fontSize 사용 (월 현황 3칸 통일 등) */
  fontSizeOverride?: number;
  style?: ViewStyle;
}

export interface UnifiedSingleLineFontSizeParams {
  texts: string[];
  availableWidth: number;
  textStyle: TextStyle;
  minFontScale?: number;
  horizontalInset?: number;
}

function resolveBaseMetrics(textStyle: TextStyle) {
  const { fontSize, lineHeightRatio, fontWeight } = resolveTextStyleMetrics(textStyle);
  return { fontSize, lineHeightRatio, fontWeight };
}

function isBoldWeight(fontWeight: TextStyle['fontWeight']): boolean {
  return fontWeight === 'bold' || fontWeight === '700' || fontWeight === 700;
}

export function estimateSingleLineIntrinsicWidth(
  text: string,
  fontSize: number,
  fontWeight: TextStyle['fontWeight'],
): number {
  const weightFactor = isBoldWeight(fontWeight) ? 1.05 : 1;
  return text.length * fontSize * CHAR_WIDTH_EM * weightFactor;
}

export function computeFittingFontSize(
  textWidth: number,
  availableWidth: number,
  baseFontSize: number,
  minFontSize: number,
): number {
  if (textWidth <= availableWidth + 0.5) {
    return baseFontSize;
  }
  const scaled = (availableWidth / textWidth) * baseFontSize * FIT_SAFETY;
  return Math.max(
    minFontSize,
    Math.min(baseFontSize, Math.floor(scaled * 100) / 100),
  );
}

/** 여러 문자열 중 가장 긴 줄 기준으로 동일 fontSize 계산 */
export function computeUnifiedSingleLineFontSize({
  texts,
  availableWidth,
  textStyle,
  minFontScale = 0.75,
  horizontalInset = DEFAULT_HORIZONTAL_INSET,
}: UnifiedSingleLineFontSizeParams): number {
  const { fontSize: baseFontSize, fontWeight } = resolveBaseMetrics(textStyle);
  const minFontSize = Math.max(ABSOLUTE_MIN_FONT_SIZE, baseFontSize * minFontScale);
  const innerWidth = Math.max(0, availableWidth - horizontalInset * 2);
  if (innerWidth <= 0 || texts.length === 0) {
    return baseFontSize;
  }

  const widest = Math.max(
    ...texts.map((text) => estimateSingleLineIntrinsicWidth(text, baseFontSize, fontWeight)),
  );
  return computeFittingFontSize(widest, innerWidth, baseFontSize, minFontSize);
}

export const AutoShrinkSingleLineText = memo(function AutoShrinkSingleLineText({
  children,
  textStyle,
  color,
  minFontScale = DEFAULT_MIN_FONT_SCALE,
  horizontalInset = DEFAULT_HORIZONTAL_INSET,
  fontSizeOverride,
  style,
}: AutoShrinkSingleLineTextProps) {
  const { fontSize: baseFontSize, lineHeightRatio, fontWeight } =
    resolveBaseMetrics(textStyle);
  const minFontSize = Math.max(ABSOLUTE_MIN_FONT_SIZE, baseFontSize * minFontScale);
  const useOverride = fontSizeOverride != null && fontSizeOverride > 0;

  const [containerWidth, setContainerWidth] = useState(0);
  const [fontSize, setFontSize] = useState(baseFontSize);
  const [visualScale, setVisualScale] = useState(1);

  const availableWidth = Math.max(0, containerWidth - horizontalInset * 2);
  const resolvedFontSize = useOverride ? fontSizeOverride : fontSize;

  const applyInitialFontSize = useCallback(
    (width: number) => {
      if (useOverride) {
        setVisualScale(1);
        return;
      }
      const available = Math.max(0, width - horizontalInset * 2);
      if (available <= 0) {
        setFontSize(baseFontSize);
        setVisualScale(1);
        return;
      }
      const estimated = estimateSingleLineIntrinsicWidth(
        children,
        baseFontSize,
        fontWeight,
      );
      setFontSize(
        computeFittingFontSize(estimated, available, baseFontSize, minFontSize),
      );
      setVisualScale(1);
    },
    [children, baseFontSize, fontWeight, horizontalInset, minFontSize, useOverride],
  );

  useEffect(() => {
    setVisualScale(1);
    if (useOverride) {
      return;
    }
    setFontSize(baseFontSize);
    if (containerWidth > 0) {
      applyInitialFontSize(containerWidth);
    }
  }, [children, baseFontSize, containerWidth, applyInitialFontSize, useOverride]);

  useEffect(() => {
    if (useOverride) {
      setVisualScale(1);
    }
  }, [fontSizeOverride, useOverride]);

  const onContainerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const nextWidth = Math.floor(event.nativeEvent.layout.width);
      setContainerWidth((prev) => {
        if (prev === nextWidth) {
          return prev;
        }
        applyInitialFontSize(nextWidth);
        return nextWidth;
      });
    },
    [applyInitialFontSize],
  );

  const onVisibleTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (availableWidth <= 0) return;
      const lineWidth = event.nativeEvent.lines[0]?.width ?? 0;
      if (lineWidth <= 0) {
        return;
      }

      if (lineWidth <= availableWidth + 0.5) {
        setVisualScale(1);
        return;
      }

      if (useOverride) {
        setVisualScale(
          Math.max(MIN_VISUAL_SCALE, (availableWidth / lineWidth) * FIT_SAFETY),
        );
        return;
      }

      setFontSize((current: number) => {
        const ratioNext = Math.max(
          minFontSize,
          Math.floor(((availableWidth / lineWidth) * current * FIT_SAFETY) * 100) / 100,
        );

        if (ratioNext < current - 0.05) {
          setVisualScale(1);
          return ratioNext;
        }
        if (current > minFontSize + 0.05) {
          setVisualScale(1);
          return Math.max(minFontSize, current - 0.5);
        }

        setVisualScale(
          Math.max(MIN_VISUAL_SCALE, (availableWidth / lineWidth) * FIT_SAFETY),
        );
        return current;
      });
    },
    [availableWidth, minFontSize, useOverride],
  );

  const lineHeight = Math.max(
    resolvedFontSize,
    Math.round(resolvedFontSize * lineHeightRatio),
  );
  const slotHeight = Math.max(lineHeight, Math.round(baseFontSize * lineHeightRatio));

  const fittedStyle = useMemo(
    () => ({
      ...textStyle,
      fontSize: resolvedFontSize,
      lineHeight,
      ...(color != null ? { color } : null),
      textAlign: 'center' as const,
    }),
    [textStyle, resolvedFontSize, lineHeight, color],
  );

  return (
    <View style={[styles.outer, style]} onLayout={onContainerLayout}>
      <View
        style={[
          styles.inner,
          availableWidth > 0 ? { width: availableWidth } : null,
        ]}
      >
        <View
          style={[
            styles.slot,
            { height: slotHeight },
            visualScale < 1 ? { transform: [{ scale: visualScale }] } : null,
          ]}
        >
          <Text
            style={fittedStyle}
            numberOfLines={1}
            ellipsizeMode="clip"
            onTextLayout={onVisibleTextLayout}
          >
            {children}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  outer: {
    width: '100%',
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
  },
  inner: {
    minWidth: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
