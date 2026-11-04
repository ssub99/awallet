/**
 * 기록 수신 체험 · 수신함 칩 포커스 딤
 * Figma: home.month.quickInputEntry.tutorialReceiveConfirm.smsInboxFocus
 * overlayDimStacked = full dim − chip cutout (칩 주변 균일 패딩 + 라운드)
 *
 * 히트: 컷아웃 밖만 차단 → 아래 수신함 칩만 탭 가능
 * 컷아웃 밖 탭은 흡수만 하고 딤/오버레이를 닫지 않는다 (튜토리얼 전용).
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

/** Figma: chip (16,404,146×40) → cutout (10,398,158×52) = 6px inset */
export const SMS_INBOX_FOCUS_CUTOUT_PAD = 6;
/** actionChip borderRadius 24 — 패딩만큼 키운 라운드 */
export const SMS_INBOX_CHIP_RADIUS = 24;

const FADE_MS = 180;
const FADE_EASING = Easing.inOut(Easing.cubic);

export type SmsInboxFocusCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuickInputSmsInboxFocusDimProps = {
  /** window 좌표 칩 bounds (measureInWindow). null이면 전체 딤만 */
  chipBounds: SmsInboxFocusCutout | null;
  cutoutPad?: number;
  /** 칩 cornerRadius (기본 24) */
  chipRadius?: number;
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

export function QuickInputSmsInboxFocusDim({
  chipBounds,
  cutoutPad = SMS_INBOX_FOCUS_CUTOUT_PAD,
  chipRadius = SMS_INBOX_CHIP_RADIUS,
}: QuickInputSmsInboxFocusDimProps) {
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

  const cutout = chipBounds
    ? {
        x: Math.max(0, chipBounds.x - cutoutPad),
        y: Math.max(0, chipBounds.y - cutoutPad),
        width: chipBounds.width + cutoutPad * 2,
        height: chipBounds.height + cutoutPad * 2,
      }
    : null;

  const cutoutRadius = cutout
    ? Math.min(chipRadius + cutoutPad, cutout.width / 2, cutout.height / 2)
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

  return (
    <Animated.View
      style={[styles.root, fadeStyle]}
      pointerEvents="box-none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* 시각: evenodd 라운드 컷아웃 */}
      <Svg
        width={screenW}
        height={screenH}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Path d={dimPath} fill={dimColor} fillRule="evenodd" />
      </Svg>

      {/* 히트: 컷아웃 밖만 차단 (사각 — 라운드 모서리는 통과) */}
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
    zIndex: 5,
    elevation: 5,
  },
  block: {
    position: 'absolute',
  },
});
