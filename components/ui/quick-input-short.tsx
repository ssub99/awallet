import { BlurView } from 'expo-blur';
import { Colors, Typography } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import type { ComponentRef } from 'react';
import { useCallback, useRef } from 'react';
import { Animated, Dimensions, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { QuickInputStar } from '@/components/ui/quick-input-star';

const QUICK_INPUT_HEIGHT = 48;
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
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const containerRef = useRef<ComponentRef<typeof Pressable>>(null);
  const lastShortBottomRef = useRef<number | null>(null);

  const handleLayout = useCallback((_e: LayoutChangeEvent) => {
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

  return (
    <Pressable
      ref={containerRef}
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
      accessibilityLabel="간편입력"
    >
      <BlurView intensity={48} tint="light" style={styles.quickInputBlur}>
        <View
          pointerEvents="none"
          style={[styles.quickInputTint, { backgroundColor: colors.fill }]}
        />
        <View style={styles.quickInputContent} pointerEvents="box-none">
          <View style={styles.quickInputLeft}>
            {/* 소비 에이전트 카드와 동일한 그라데이션 circle + star 애니메이션 */}
            <QuickInputStar size={20} starScale={starScale} starRotate={starRotate} />
            <Text style={[styles.quickInputText, { color: colors.textNeutral }]}>간편입력</Text>
          </View>
          <View style={styles.quickInputArrow}>
            <Icon name="arrowRight" variant="line" size={16} color={colors.textAssistive} />
          </View>
        </View>
      </BlurView>
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
  },
  quickInputBlur: {
    flex: 1,
    width: '100%',
    height: '100%',
    borderRadius: QUICK_INPUT_HEIGHT / 2,
    overflow: 'hidden',
  },
  quickInputTint: {
    ...StyleSheet.absoluteFillObject,
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
    ...Typography.body2.r.medium,
  },
  quickInputArrow: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

