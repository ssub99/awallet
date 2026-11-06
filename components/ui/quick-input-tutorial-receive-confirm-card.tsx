/**
 * 간편입력 · 기록 수신 체험 — 안내 카드
 * Figma: home.month.quickInputEntry.tutorialReceiveConfirm / tutorialReceiveConfirmCard
 *
 * @(16, 48) 343×72 · notification 아이콘 + 제목/본문 + chevron
 * Drop shadow: y 8 / blur 32 / #000 @ 25% (NoticeCard와 동일 시안)
 * 제스처: 위로 스와이프하면 퇴장 (NoticeCard와 동일)
 */

import { Icon } from '@/components/ui/icon';
import { colors } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCallback, useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FIGMA_STATUS_BAR = 44;
const FIGMA_CARD = { left: 16, top: 48, height: 72 } as const;
const CARD_RADIUS = 20;
const CARD_PAD_H = 16;
const CARD_PAD_V = 12;
const ICON_WRAP = 48;
const ICON_SIZE = 24;
/** Figma icon wrap — DS 미등록 (#FFFAEA). Neutral/50(#FAFAFA)과 다름 */
const ICON_WRAP_BG = '#FFFAEA';

/** Figma DROP_SHADOW: offset.y 8, radius 32, #000 @ 0.25 — NoticeCard와 동일 매핑 */
const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  android: {
    elevation: 12,
  },
  default: {},
});

const ENTER_SLIDE_OFFSET = 16;
const ENTER_DURATION_MS = 180;
const ENTER_EASING = Easing.inOut(Easing.cubic);
const DISMISS_DURATION_MS = 220;
const SNAP_BACK_DURATION_MS = 200;
/** 그림자까지 화면 밖으로 밀어내는 여유 */
const SHADOW_OUTSET = 40;
const SWIPE_DISMISS_DISTANCE = 24;
const SWIPE_DISMISS_VELOCITY = 500;

export type QuickInputTutorialReceiveConfirmCardProps = {
  count?: number;
  onPress?: () => void;
  onDismiss?: () => void;
};

export function QuickInputTutorialReceiveConfirmCard({
  count = 1,
  onPress,
  onDismiss,
}: QuickInputTutorialReceiveConfirmCardProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const topOffset = insets.top;
  const hiddenY = -(
    topOffset +
    (FIGMA_CARD.top - FIGMA_STATUS_BAR) +
    FIGMA_CARD.height +
    SHADOW_OUTSET
  );

  const translateY = useSharedValue(-ENTER_SLIDE_OFFSET);
  const opacity = useSharedValue(0);
  const dragStartY = useSharedValue(0);
  const dismissing = useSharedValue(false);

  const handleDismiss = useCallback(() => {
    onDismiss?.();
  }, [onDismiss]);

  const handlePress = useCallback(() => {
    onPress?.();
  }, [onPress]);

  useEffect(() => {
    dismissing.value = false;
    translateY.value = -ENTER_SLIDE_OFFSET;
    opacity.value = 0;
    translateY.value = withTiming(0, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    opacity.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
  }, [dismissing, opacity, translateY]);

  const dismissUp = useCallback(() => {
    'worklet';
    if (dismissing.value) return;
    dismissing.value = true;
    translateY.value = withTiming(
      hiddenY,
      { duration: DISMISS_DURATION_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(handleDismiss)();
        }
      },
    );
    opacity.value = withTiming(0, {
      duration: DISMISS_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [dismissing, handleDismiss, hiddenY, opacity, translateY]);

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-24, 24])
    .onBegin(() => {
      dragStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (dismissing.value) return;
      // 위로만 드래그 (NoticeCard와 동일)
      translateY.value = Math.min(0, dragStartY.value + event.translationY);
    })
    .onEnd((event) => {
      if (dismissing.value) return;
      if (
        event.translationY < -SWIPE_DISMISS_DISTANCE ||
        event.velocityY < -SWIPE_DISMISS_VELOCITY
      ) {
        dismissUp();
        return;
      }
      translateY.value = withTiming(0, {
        duration: SNAP_BACK_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
    });

  const tap = Gesture.Tap().onEnd(() => {
    if (dismissing.value) return;
    runOnJS(handlePress)();
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          styles.card,
          CARD_SHADOW,
          animatedStyle,
          {
            top: topOffset + (FIGMA_CARD.top - FIGMA_STATUS_BAR),
            left: FIGMA_CARD.left,
            right: FIGMA_CARD.left,
            backgroundColor: palette.staticWhite,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`기록 수신 안내, ${count}건의 기록을 수신하였습니다.`}
        accessibilityHint="위로 밀면 닫힙니다"
      >
        <View style={styles.press}>
          <View style={styles.leading}>
            <View style={[styles.iconWrap, { backgroundColor: ICON_WRAP_BG }]}>
              <Icon name="notification" variant="solid" size={ICON_SIZE} />
            </View>
            <View style={styles.textStack}>
              <Text
                style={[
                  typographyLayout.uiLineBody02Bold,
                  styles.title,
                  { color: palette.text },
                ]}
                numberOfLines={1}
              >
                기록 수신 안내
              </Text>
              <Text
                style={[
                  typographyLayout.uiLineBody02Regular,
                  styles.subtitle,
                  { color: palette.textNeutral },
                ]}
                numberOfLines={1}
              >
                {`${count}건의 기록을 수신하였습니다.`}
              </Text>
            </View>
          </View>
          <Icon
            name="arrowRight"
            variant="line"
            size={ICON_SIZE}
            color={palette.staticBlack}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    height: FIGMA_CARD.height,
    borderRadius: CARD_RADIUS,
    zIndex: 4,
    // iOS shadow 효율 — 불투명 배경을 그림자 뷰에 고정
    backgroundColor: colors.light.staticWhite,
  },
  press: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PAD_H,
    paddingVertical: CARD_PAD_V,
    gap: 23,
  },
  leading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  iconWrap: {
    width: ICON_WRAP,
    height: ICON_WRAP,
    borderRadius: ICON_WRAP / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textStack: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    includeFontPadding: false,
  },
  subtitle: {
    includeFontPadding: false,
  },
});
