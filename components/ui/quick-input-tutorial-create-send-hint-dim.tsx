/**
 * 간편 기록 생성 체험 · 전송 힌트 딤
 * Figma: home.month.quickInputEntry.tutorialCreateSendHint (promoted)
 *
 * paint: overlayDim(backdrop) → create bar / chips / keyboard
 *      → overlayDimStacked (full − create-bar cutout)
 *      → tip + pointer
 *
 * tip/pointer는 cutout window 좌표 추적 (수신 카테고리 힌트와 동일 패턴)
 *
 * 히트: 컷아웃만 통과 → 입력바·전송 버튼만 탭 가능
 */

import SendHintPointer from '@/assets/images/icons/solid/tutorial-create-send-hint-pointer.svg';
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

/** Figma Rectangle 2281 vs simple create bar */
export const CREATE_SEND_HINT_CUTOUT_PAD_X = 7;
export const CREATE_SEND_HINT_CUTOUT_PAD_Y = 6;
export const CREATE_SEND_HINT_CUTOUT_RADIUS = 16;

/**
 * Figma tip/pointer — cutout(9,450,356×60) 기준
 * tip(94,352) → (+85,-98) / pointer(246,392,89×56) → (+237,-58)
 */
const TIP_OFFSET_X = 85;
const TIP_OFFSET_Y = -98;
const TIP_WIDTH = 265;
const POINTER_OFFSET_X = 237;
const POINTER_OFFSET_Y = -58;
const POINTER_WIDTH = 89;
const POINTER_HEIGHT = 56;

const TIP_COPY = '버튼을 눌러 기입된 문장을 전송해 주세요.';

/** 체험 전용 — constants/typography 에 올리지 않음 */
const TUTORIAL_BRUSH_FONT_FAMILY = 'Nanum Brush Script';

const FADE_MS = 180;
const FADE_EASING = Easing.inOut(Easing.cubic);

export type CreateSendHintCutout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type QuickInputTutorialCreateSendHintDimProps = {
  /** window 좌표 simple create bar bounds (measureInWindow) */
  createBarBounds: CreateSendHintCutout | null;
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

export function QuickInputTutorialCreateSendHintDim({
  createBarBounds,
}: QuickInputTutorialCreateSendHintDimProps) {
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

  const cutout = createBarBounds
    ? {
        x: Math.max(0, createBarBounds.x - CREATE_SEND_HINT_CUTOUT_PAD_X),
        y: Math.max(0, createBarBounds.y - CREATE_SEND_HINT_CUTOUT_PAD_Y),
        width: createBarBounds.width + CREATE_SEND_HINT_CUTOUT_PAD_X * 2,
        height: createBarBounds.height + CREATE_SEND_HINT_CUTOUT_PAD_Y * 2,
      }
    : null;

  const cutoutRadius = cutout
    ? Math.min(CREATE_SEND_HINT_CUTOUT_RADIUS, cutout.width / 2, cutout.height / 2)
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
      <View
        style={styles.root}
        pointerEvents="auto"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        // 빈 View는 히트 안 됨 — 투명 배경으로 전체 터치 흡수
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

  const tipLeft = cutout.x + TIP_OFFSET_X;
  const tipTop = cutout.y + TIP_OFFSET_Y;
  const pointerLeft = cutout.x + POINTER_OFFSET_X;
  const pointerTop = cutout.y + POINTER_OFFSET_Y;

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
          <SendHintPointer width={POINTER_WIDTH} height={POINTER_HEIGHT} />
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
          {TIP_COPY}
        </Text>
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
  pointer: {
    position: 'absolute',
    width: POINTER_WIDTH,
    height: POINTER_HEIGHT,
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
