/**
 * 간편입력 · 기록 수신 체험 완료 카드
 * Figma: home.month.quickInputEntry.tutorialReceiveComplete / Frame 1000004481
 *
 * @(16, 474) 343×322 · complete 아이콘 + 제목/본문 + 「소비 기록 시작하기」
 * 하단: 기록 수신함 페이저와 동일 — homeIndicator(safeBottom) 기준 앵커
 * CTA: 완료 카드·추가 딤만 닫고 간편입력 유지
 */

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { colors, spacing, typography } from '@/constants/theme';
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
/** complete 아이콘 80 기준 — 하단 여백 32 확보 (구 106·348 → 26 축소) */
const FIGMA_CARD = { left: 16, top: 474, height: 322 } as const;
/** Figma 812 기준 카드 하단~스크린 하단 (474+322=796 → 16) */
const FIGMA_CARD_BOTTOM_GAP = FIGMA_SCREEN_HEIGHT - (FIGMA_CARD.top + FIGMA_CARD.height);
const CARD_RADIUS = 16;
const ICON_SIZE = 80;
const BUTTON_WIDTH = 160;

const ENTER_SLIDE_OFFSET = 16;
const ENTER_DURATION_MS = 180;
const ENTER_EASING = Easing.inOut(Easing.cubic);

export type QuickInputTutorialReceiveCompleteCardProps = {
  onStartPress: () => void;
};

export function QuickInputTutorialReceiveCompleteCard({
  onStartPress,
}: QuickInputTutorialReceiveCompleteCardProps) {
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
      accessibilityLabel="기록 수신 체험하기 완료"
    >
      <Icon name="complete" variant="solid" size={ICON_SIZE} style={styles.icon} />
      <Text
        style={[typography.headline04.bold, styles.title, { color: palette.text }]}
        accessibilityRole="header"
      >
        기록 수신 체험하기 완료
      </Text>
      <Text
        style={[typography.body02.regular, styles.subtitle, { color: palette.text }]}
      >
        {'기록 수신을 설정하고\n간편하게 소비 관리를 시작해 보세요!'}
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
    paddingTop: spacing[800],
    paddingBottom: spacing[800],
    paddingHorizontal: spacing[400],
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
