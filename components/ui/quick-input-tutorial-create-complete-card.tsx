/**
 * 간편입력 · 간편 기록 생성 체험 완료 카드
 * Figma: home.month.quickInputEntry.tutorialCreateComplete / tutorialCreateCompleteCard
 *
 * @(16, 448) 343×348 · complete 아이콘 + 제목/본문 + 「소비 기록 시작하기」
 * 하단: 기록 수신함 페이저와 동일 — homeIndicator(safeBottom) 기준 앵커
 * CTA: 완료 카드·딤만 닫고 간편입력 유지 (수신 체험 완료와 동일)
 */

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { colors, typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

const FIGMA_SCREEN_HEIGHT = 812;
/** 시안 카드 top 448 (프레임 기준, statusBar 44 포함) */
const FIGMA_CARD = { left: 16, top: 448, height: 348 } as const;
/** Figma 812 기준 카드 하단~스크린 하단 (448+348=796 → 16) */
const FIGMA_CARD_BOTTOM_GAP = FIGMA_SCREEN_HEIGHT - (FIGMA_CARD.top + FIGMA_CARD.height);
const CARD_RADIUS = 16;
const ICON_SIZE = 106;
const BUTTON_WIDTH = 160;

const ENTER_SLIDE_OFFSET = 16;
const ENTER_DURATION_MS = 180;
const ENTER_EASING = Easing.inOut(Easing.cubic);

export type QuickInputTutorialCreateCompleteCardProps = {
  onStartPress: () => void;
};

export function QuickInputTutorialCreateCompleteCard({
  onStartPress,
}: QuickInputTutorialCreateCompleteCardProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Nested overlay에서 Android bottom inset이 0으로 올 수 있어 window metrics 폴백
  // (quick-input-record-inbox / ModalBottomsheetBottomInset과 동일)
  const safeBottom =
    insets.bottom > 0 ? insets.bottom : (initialWindowMetrics?.insets.bottom ?? 0);
  // iOS: 홈 인디케이터 구역을 확보. Android: 내비 inset 위 시안 gap 유지.
  const cardBottom =
    Platform.OS === 'android'
      ? (safeBottom > 0 ? safeBottom : 48) + FIGMA_CARD_BOTTOM_GAP
      : Math.max(safeBottom, FIGMA_CARD_BOTTOM_GAP);
  const cardTop = windowHeight - cardBottom - FIGMA_CARD.height;

  const translateY = useSharedValue(ENTER_SLIDE_OFFSET);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = ENTER_SLIDE_OFFSET;
    opacity.value = 0;
    translateY.value = withTiming(0, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    opacity.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
  }, [opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.card,
        animatedStyle,
        {
          top: cardTop,
          left: FIGMA_CARD.left,
          right: FIGMA_CARD.left,
          backgroundColor: palette.staticWhite,
        },
      ]}
      accessibilityRole="summary"
      accessibilityLabel="간편 기록 체험하기 완료"
    >
      <Icon name="complete" variant="solid" size={ICON_SIZE} style={styles.icon} />
      <Text
        style={[typography.headline04.bold, styles.title, { color: palette.text }]}
        accessibilityRole="header"
      >
        간편 기록 체험하기 완료
      </Text>
      <Text
        style={[typography.body02.regular, styles.subtitle, { color: palette.text }]}
      >
        {'한 문장으로 간편하게\n소비 관리를 시작해 보세요!'}
      </Text>
      <View style={styles.buttonWrap}>
        <Button
          variant="primary"
          type="solid"
          size="large"
          onPress={onStartPress}
          style={styles.button}
          accessibilityLabel="소비 기록 시작하기"
        >
          소비 기록 시작하기
        </Button>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    height: FIGMA_CARD.height,
    borderRadius: CARD_RADIUS,
    paddingTop: 32,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: 24,
  },
  buttonWrap: {
    alignItems: 'center',
  },
  button: {
    width: BUTTON_WIDTH,
  },
});
