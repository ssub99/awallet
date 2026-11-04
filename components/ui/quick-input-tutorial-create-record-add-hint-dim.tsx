/**
 * 간편 기록 생성 체험 · 기록 카드 추가 힌트 딤
 * Figma: home.month.quickInputEntry.tutorialCreateRecordAddHint (promoted)
 *
 * overlayDimStacked = full dim − 추가 버튼 cutout
 * tip/pointer 없음 — 컷아웃 딤 + 히트만
 *
 * 히트: 컷아웃만 통과 → 추가 버튼만 탭 가능
 */

import { colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/** Figma dimCutout vs 추가 버튼 — 균일 패딩 */
export const CREATE_RECORD_ADD_HINT_CUTOUT_PAD = 6;
export const CREATE_RECORD_ADD_HINT_CUTOUT_RADIUS = 16;

const FADE_MS = 180;
const FADE_EASING = Easing.inOut(Easing.cubic);

export type CreateRecordAddHintCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuickInputTutorialCreateRecordAddHintDimProps = {
  /** window 좌표 추가 버튼 bounds */
  addButtonBounds: CreateRecordAddHintCutout | null;
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

export function QuickInputTutorialCreateRecordAddHintDim({
  addButtonBounds,
}: QuickInputTutorialCreateRecordAddHintDimProps) {
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

  const cutout = addButtonBounds
    ? {
        x: Math.max(0, addButtonBounds.x - CREATE_RECORD_ADD_HINT_CUTOUT_PAD),
        y: Math.max(0, addButtonBounds.y - CREATE_RECORD_ADD_HINT_CUTOUT_PAD),
        width: addButtonBounds.width + CREATE_RECORD_ADD_HINT_CUTOUT_PAD * 2,
        height: addButtonBounds.height + CREATE_RECORD_ADD_HINT_CUTOUT_PAD * 2,
      }
    : null;

  const cutoutRadius = cutout
    ? Math.min(
        CREATE_RECORD_ADD_HINT_CUTOUT_RADIUS,
        cutout.width / 2,
        cutout.height / 2,
      )
    : 0;

  const dimColor = palette.overlayDim;

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
      <View
        style={styles.root}
        pointerEvents="auto"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        collapsable={false}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.fadeFill, fadeStyle, { backgroundColor: dimColor }]}
        />
        <View style={styles.fullBlock} pointerEvents="auto" collapsable={false} />
      </View>
    );
  }

  const topH = cutout.y;
  const midH = cutout.height;
  const bottomH = Math.max(0, screenH - (cutout.y + cutout.height));
  const leftW = cutout.x;
  const rightW = Math.max(0, screenW - (cutout.x + cutout.width));

  return (
    <View
      style={styles.root}
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.fadeFill, fadeStyle]} pointerEvents="none">
        <Svg
          width={screenW}
          height={screenH}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path d={dimPath} fill={dimColor} fillRule="evenodd" />
        </Svg>
      </Animated.View>

      {/* 컷아웃 밖만 터치 흡수 — transparent 없으면 히트 스킵됨 */}
      <View
        pointerEvents="auto"
        collapsable={false}
        style={[styles.block, { top: 0, left: 0, right: 0, height: topH }]}
      />
      <View
        pointerEvents="auto"
        collapsable={false}
        style={[styles.block, { top: cutout.y, left: 0, width: leftW, height: midH }]}
      />
      <View
        pointerEvents="auto"
        collapsable={false}
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
        collapsable={false}
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
    </View>
  );
}

const styles = StyleSheet.create({
  /** plain View 루트 — Reanimated opacity를 루트에 두면 형제 zIndex가 깨짐 */
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    elevation: 5,
  },
  fadeFill: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBlock: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  block: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
});
