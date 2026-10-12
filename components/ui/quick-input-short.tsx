import { BlurRuntime } from '@/constants/blur-runtime';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, type ColorPalette } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { Icon } from '@/components/ui/icon';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useQuickInputContext } from '@/contexts/quick-input-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { shouldApplyReactBlurOverlay } from '@/utils/expo-blur-platform';
import { logEvent } from '@/utils/analytics';
import type { ComponentRef } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Path, Svg } from 'react-native-svg';
import { QuickInputStar } from '@/components/ui/quick-input-star';

const QUICK_INPUT_HEIGHT = 48;
/** 테두리 빛이 둘레를 따라 움직이는 속도 (px/s) */
const BORDER_GLOW_SPEED = 150;
/** 빛 전체 길이(px). 가운데가 진하고 앞뒤 끝으로 흐려지도록 가운데를 맞춘 구간을 겹친다 */
const BORDER_GLOW_LENGTH = 128;
/** 겹침 수가 많을수록 진하기 단계가 촘촘해진다 */
const BORDER_GLOW_LAYERS = 32;
const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const FALLBACK_ESTIMATE = 64;
const MIN_BOTTOM = 16;
const MAX_BOTTOM_OFFSET = 80;

/** measureInWindow 결과가 유효한지 검증 (레이아웃 미완료 시 0 등 반환) */
function isValidMeasure(
  screenHeight: number,
  y: number,
  height: number,
  shortBottomFromScreen: number
): boolean {
  if (height < QUICK_INPUT_HEIGHT * 0.5) return false;
  if (shortBottomFromScreen < 0 || shortBottomFromScreen > screenHeight - 20) return false;
  if (y < -100 || y > screenHeight + 100) return false;
  return true;
}

/** measureInWindow 결과로 shortBottom 계산, 유효하지 않으면 fallback 사용 */
function resolveShortBottom(
  screenHeight: number,
  y: number,
  height: number,
  lastShortBottom: number | null,
  fallbackBottom: number
): number {
  const shortBottomFromScreen = screenHeight - (y + height);
  if (isValidMeasure(screenHeight, y, height, shortBottomFromScreen)) {
    return shortBottomFromScreen;
  }
  if (lastShortBottom != null) return lastShortBottom;
  return Math.max(MIN_BOTTOM, Math.min(screenHeight - MAX_BOTTOM_OFFSET, fallbackBottom));
}

/** 9시 방향에서 출발해 시계 방향으로 한 바퀴 도는 알약 테두리 경로 (1px 선 중심) */
function pillBorderPath(width: number) {
  const x0 = 0.5;
  const x1 = width - 0.5;
  const y0 = 0.5;
  const y1 = QUICK_INPUT_HEIGHT - 0.5;
  const r = (y1 - y0) / 2;
  const cy = QUICK_INPUT_HEIGHT / 2;
  const d = [
    `M ${x0} ${cy}`,
    `A ${r} ${r} 0 0 1 ${x0 + r} ${y0}`,
    `H ${x1 - r}`,
    `A ${r} ${r} 0 0 1 ${x1 - r} ${y1}`,
    `H ${x0 + r}`,
    `A ${r} ${r} 0 0 1 ${x0} ${cy}`,
    'Z',
  ].join(' ');
  return { d, length: 2 * (x1 - x0 - 2 * r) + 2 * Math.PI * r };
}

/** 빛 가운데 위치(head)를 중심으로 앞뒤 length/2씩 칠한 구간 */
function GlowSegment({
  d,
  perimeter,
  length,
  opacity,
  head,
}: {
  d: string;
  perimeter: number;
  length: number;
  opacity: number;
  head: SharedValue<number>;
}) {
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: length / 2 - head.value }));
  return (
    <AnimatedPath
      d={d}
      fill="none"
      stroke={atomicColors.blue[700]}
      strokeOpacity={opacity}
      strokeWidth={1}
      strokeDasharray={[length, perimeter - length]}
      animatedProps={animatedProps}
    />
  );
}

/** 1px 테두리. 파란 빛이 9시 방향에서 출발해 시계 방향으로 일정한 속도로 계속 돈다 */
function RotatingGradientBorder({ width }: { width: number }) {
  const head = useSharedValue(0);
  const { d, length: perimeter } = pillBorderPath(width);

  useEffect(() => {
    head.value = 0;
    head.value = withRepeat(
      withTiming(perimeter, {
        duration: (perimeter / BORDER_GLOW_SPEED) * 1000,
        easing: Easing.linear,
      }),
      -1,
    );
    return () => cancelAnimation(head);
  }, [head, perimeter]);

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path
        d={d}
        fill="none"
        stroke={atomicColors.coolNeutral[500]}
        strokeOpacity={0.16}
        strokeWidth={1}
      />
      {/* i번째로 짧은 구간 투명도 1/(i+1) → 겹친 결과 진하기가 양 끝 0에서 가운데 1까지 직선으로 오른다 */}
      {Array.from({ length: BORDER_GLOW_LAYERS }, (_, i) => (
        <GlowSegment
          key={i}
          d={d}
          perimeter={perimeter}
          length={(BORDER_GLOW_LENGTH * (i + 1)) / BORDER_GLOW_LAYERS}
          opacity={1 / (i + 1)}
          head={head}
        />
      ))}
    </Svg>
  );
}

interface QuickInputShortProps {
  bottom: number;
  onPress: (shortBottomFromScreen: number) => void;
  starScale: Animated.Value;
  starRotate: Animated.Value;
}

export function QuickInputShort({
  bottom,
  onPress,
  starScale,
  starRotate,
}: QuickInputShortProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const { recordInboxUnreadCount } = useQuickInputContext();
  const containerRef = useRef<ComponentRef<typeof Pressable>>(null);
  const lastShortBottomRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
    containerRef.current?.measureInWindow((_x, y, _width, height) => {
      const screenHeight = Dimensions.get('window').height;
      const shortBottomFromScreen = screenHeight - (y + height);
      if (isValidMeasure(screenHeight, y, height, shortBottomFromScreen)) {
        lastShortBottomRef.current = shortBottomFromScreen;
      }
    });
  }, []);

  const handlePress = useCallback(() => {
    requestAnimationFrame(() => {
      containerRef.current?.measureInWindow((_x, y, _width, height) => {
        const screenHeight = Dimensions.get('window').height;
        const resolved = resolveShortBottom(
          screenHeight,
          y,
          height,
          lastShortBottomRef.current,
          bottom + FALLBACK_ESTIMATE
        );
        const shortBottomFromScreen = screenHeight - (y + height);
        if (isValidMeasure(screenHeight, y, height, shortBottomFromScreen)) {
          lastShortBottomRef.current = shortBottomFromScreen;
        }
        onPress(resolved);
      });
    });
  }, [onPress, bottom]);

  const fillOverlay = shouldApplyReactBlurOverlay() ? palette.fill : undefined;
  const badgeLabel =
    recordInboxUnreadCount > 99 ? '99+' : String(recordInboxUnreadCount);

  return (
    <Pressable
      ref={containerRef}
      collapsable={false}
      style={[styles.quickInput, { bottom }]}
      onLayout={handleLayout}
      onPress={() => {
        void logEvent('component', {
          screen_name: '/home',
          target: 'dim',
        });
        handlePress();
      }}
      accessibilityRole="button"
      accessibilityLabel={
        recordInboxUnreadCount > 0
          ? `기록 간편입력, 미처리 기록 ${recordInboxUnreadCount}건`
          : '기록 간편입력'
      }
    >
      <GlassSurface
        intensity={BlurRuntime.quickInputShortIntensity}
        tint="light"
        borderRadius={QUICK_INPUT_HEIGHT / 2}
        style={styles.quickInputBlur}
        overlayColor={fillOverlay}
        androidFallbackBackground={BlurRuntime.quickInputShortAndroidFallback}
      >
        <View style={styles.quickInputContent} pointerEvents="box-none">
          <View style={styles.quickInputLeft}>
            <QuickInputStar size={20} starScale={starScale} starRotate={starRotate} />
            <Text style={[styles.quickInputText, { color: palette.textNeutral }]}>기록 간편입력</Text>
            {recordInboxUnreadCount > 0 ? (
              <View style={styles.actionBadge} accessibilityElementsHidden>
                <Text style={styles.actionBadgeLabel}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
          {recordInboxUnreadCount === 0 ? (
            <View style={styles.quickInputArrow}>
              <Icon name="arrowRight" variant="line" size={16} color={palette.textAssistive} />
            </View>
          ) : null}
        </View>
      </GlassSurface>
      {width > 0 ? <RotatingGradientBorder width={width} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  quickInput: {
    position: 'absolute',
    height: QUICK_INPUT_HEIGHT,
    borderRadius: QUICK_INPUT_HEIGHT / 2,
    alignSelf: 'center',
    overflow: 'hidden',
    zIndex: 10,
    backgroundColor: 'transparent',
  },
  quickInputBlur: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: QUICK_INPUT_HEIGHT / 2,
    overflow: 'hidden',
  },
  quickInputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    height: '100%',
  },
  quickInputLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickInputText: {
    ...typographyLayout.uiLineBody02Medium,
  },
  /** 기록 수신함 칩 actionBadge와 동일 */
  actionBadge: {
    minHeight: 18,
    borderRadius: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: atomicColors.red[500],
  },
  actionBadgeLabel: {
    color: atomicColors.common[0],
    fontFamily: 'Pretendard-Bold',
    fontSize: 12,
    lineHeight: 18,
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  quickInputArrow: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
