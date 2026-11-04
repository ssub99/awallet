/**
 * 기록 수신 체험 · 수신함 카드 카테고리 힌트 딤
 * Figma: Home_month_quickInputSmsInbox_categoryHint
 * overlayDimStacked = full dim − category value cutout
 * tip + pointer는 컷아웃 window 좌표를 추적
 *
 * 히트: 컷아웃만 통과 → 카테고리 텍스트 버튼만 탭 가능
 *
 * Nanum Brush Script는 체험 전용 로컬 폰트(DS typography 미등록).
 */

import CategoryHintPointer from '@/assets/images/icons/solid/category-hint-pointer.svg';
import { colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Figma dimCutout 106×32 vs recordCardFieldValue 92×24
 * pad = (cutout − value) / 2
 */
export const CATEGORY_HINT_CUTOUT_PAD_X = 7;
export const CATEGORY_HINT_CUTOUT_PAD_Y = 4;
export const CATEGORY_HINT_CUTOUT_RADIUS = 16;

/** Figma categoryHintTip / Pointer — cutout 좌상단 기준 오프셋 */
const TIP_OFFSET_X = 110;
const TIP_OFFSET_Y = -66;
const TIP_WIDTH = 105;
const POINTER_OFFSET_X = 70;
const POINTER_OFFSET_Y = -34;
const POINTER_SIZE = 32;

/** 체험 전용 — constants/typography 에 올리지 않음 */
const TUTORIAL_BRUSH_FONT_FAMILY = 'Nanum Brush Script';

const FADE_MS = 180;
const FADE_EASING = Easing.inOut(Easing.cubic);

export type CategoryHintCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuickInputTutorialCategoryHintDimProps = {
  /** window 좌표 카테고리 value(텍스트) bounds — hug 측정 */
  categoryBounds: CategoryHintCutout | null;
};

function roundedRectPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r <= 0) {
    return `M${x},${y} H${x + w} V${y + h} H${x} Z`;
  }
  return [
    `M${x + r},${y}`,
    `H${x + w - r}`,
    `A${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 1 ${x + w - r},${y + h}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + h - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
}

export function QuickInputTutorialCategoryHintDim({
  categoryBounds,
}: QuickInputTutorialCategoryHintDimProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const { width: screenW, height: screenH } = useWindowDimensions();
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, { duration: FADE_MS, easing: FADE_EASING });
  }, [opacity]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const cutout = categoryBounds
    ? {
        x: Math.max(0, categoryBounds.x - CATEGORY_HINT_CUTOUT_PAD_X),
        y: Math.max(0, categoryBounds.y - CATEGORY_HINT_CUTOUT_PAD_Y),
        width: categoryBounds.width + CATEGORY_HINT_CUTOUT_PAD_X * 2,
        height: categoryBounds.height + CATEGORY_HINT_CUTOUT_PAD_Y * 2,
      }
    : null;

  const cutoutRadius = cutout
    ? Math.min(CATEGORY_HINT_CUTOUT_RADIUS, cutout.width / 2, cutout.height / 2)
    : 0;

  const dimColor = palette.overlayDim;
  const tipColor = palette.staticWhite;

  const dimPath = useMemo(() => {
    if (!cutout) {
      return `M0,0 H${screenW} V${screenH} H0 Z`;
    }
    const outer = `M0,0 H${screenW} V${screenH} H0 Z`;
    const hole = roundedRectPath(
      cutout.x,
      cutout.y,
      cutout.width,
      cutout.height,
      cutoutRadius,
    );
    return `${outer} ${hole}`;
  }, [cutout, cutoutRadius, screenH, screenW]);

  if (!cutout) {
    return (
      <Animated.View
        style={[styles.root, fadeStyle, { backgroundColor: dimColor }]}
        pointerEvents="auto"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    );
  }

  const topH = cutout.y;
  const midH = cutout.height;
  const bottomH = Math.max(0, screenH - (cutout.y + cutout.height));
  const leftW = cutout.x;
  const rightW = Math.max(0, screenW - (cutout.x + cutout.width));

  const tipLeft = cutout.x + TIP_OFFSET_X;
  const tipTop = cutout.y + TIP_OFFSET_Y;
  const pointerLeft = cutout.x + POINTER_OFFSET_X;
  const pointerTop = cutout.y + POINTER_OFFSET_Y;

  return (
    <Animated.View
      style={[styles.root, fadeStyle]}
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        width={screenW}
        height={screenH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Path d={dimPath} fill={dimColor} fillRule="evenodd" />
      </Svg>

      <View
        pointerEvents="none"
        style={[
          styles.pointer,
          {
            left: pointerLeft,
            top: pointerTop,
          },
        ]}
      >
        <CategoryHintPointer width={POINTER_SIZE} height={POINTER_SIZE} />
      </View>
      <Text
        pointerEvents="none"
        style={[
          styles.tip,
          {
            left: tipLeft,
            top: tipTop,
            color: tipColor,
          },
        ]}
      >
        {'카테고리를\n선택해 주세요.'}
      </Text>

      <View
        pointerEvents="auto"
        style={[styles.block, { top: 0, left: 0, right: 0, height: topH }]}
      />
      <View
        pointerEvents="auto"
        style={[styles.block, { top: cutout.y, left: 0, width: leftW, height: midH }]}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.block,
          {
            top: cutout.y,
            left: cutout.x + cutout.width,
            width: rightW,
            height: midH,
          },
        ]}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.block,
          {
            top: cutout.y + cutout.height,
            left: 0,
            right: 0,
            height: bottomH,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    elevation: 6,
  },
  block: {
    position: 'absolute',
  },
  pointer: {
    position: 'absolute',
    width: POINTER_SIZE,
    height: POINTER_SIZE,
    overflow: 'visible',
  },
  tip: {
    position: 'absolute',
    width: TIP_WIDTH,
    fontFamily: TUTORIAL_BRUSH_FONT_FAMILY,
    fontSize: 24,
    lineHeight: 32,
    includeFontPadding: false,
  },
});
