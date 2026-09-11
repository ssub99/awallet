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
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const { smsInboxUnreadCount } = useQuickInputContext();
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

  const fillOverlay = shouldApplyReactBlurOverlay() ? palette.fill : undefined;
  const badgeLabel =
    smsInboxUnreadCount > 99 ? '99+' : String(smsInboxUnreadCount);

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
        smsInboxUnreadCount > 0
          ? `기록 간편입력, 미처리 문자 ${smsInboxUnreadCount}건`
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
            {smsInboxUnreadCount > 0 ? (
              <View style={styles.actionBadge} accessibilityElementsHidden>
                <Text style={styles.actionBadgeLabel}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
          {smsInboxUnreadCount === 0 ? (
            <View style={styles.quickInputArrow}>
              <Icon name="arrowRight" variant="line" size={16} color={palette.textAssistive} />
            </View>
          ) : null}
        </View>
      </GlassSurface>
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
  /** 문자 수신함 칩 actionBadge와 동일 */
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
