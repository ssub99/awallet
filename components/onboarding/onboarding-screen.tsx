/**
 * 온보딩 UI — 네비 스택 밖(루트 게이트)에서만 마운트.
 */

import { OnboardingDeviceMock } from '@/components/onboarding/onboarding-device-mock';
import { OnboardingPageIndicator } from '@/components/onboarding/onboarding-page-indicator';
import { Button } from '@/components/ui/button';
import {
  ONBOARDING_CONTENT_FADE_MS,
  ONBOARDING_STACK_PREWARM_DELAY_MS,
} from '@/constants/onboarding-motion';
import {
  ONBOARDING_CTA_NEXT,
  ONBOARDING_STEPS,
  getOnboardingMotion,
  type OnboardingStep,
} from '@/constants/onboarding-steps';
import { colors, spacing, typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { releaseFirstScreenSplash } from '@/utils/first-screen-splash';
import { markOnboardingCompleted } from '@/utils/onboarding-settings';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function releaseSplashAfterFirstPaint(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      releaseFirstScreenSplash();
    });
  });
}

const FIGMA_WIDTH = 375;
const FIGMA_MOCK_WIDTH = 280;
const FIGMA_BEZEL_INSET = 8;
const FIGMA_LOTTIE_ASPECT = 783 / 375;
const FIGMA_DOTS_TOP = 76 - 44;
const CTA_PAD_H = spacing[400];
const CTA_PAD_V = spacing[400];
const PAGE_PAD_H = spacing[400];

function mockSizeForWidth(width: number): { width: number; height: number } {
  const scale = width / FIGMA_MOCK_WIDTH;
  const inset = FIGMA_BEZEL_INSET * scale;
  const innerW = width - inset * 2;
  const height = innerW * FIGMA_LOTTIE_ASPECT + inset * 2;
  return { width, height };
}

export type OnboardingScreenProps = {
  onFinished: () => void;
  /** 컨텐츠 페이드 후 — 홈 Stack 프리워밍 시작 */
  onReadyToPrewarmMain?: () => void;
};

export function OnboardingScreen({ onFinished, onReadyToPrewarmMain }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<OnboardingStep>>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const finishingRef = useRef(false);
  const prewarmSentRef = useRef(false);

  const { width: windowWidth } = useWindowDimensions();
  const layoutScale = windowWidth / FIGMA_WIDTH;
  const availableMockWidth = Math.max(0, windowWidth - PAGE_PAD_H * 2);
  const scaledMockWidth = Math.min(
    availableMockWidth,
    Math.round(FIGMA_MOCK_WIDTH * layoutScale),
  );
  const { width: mockWidth, height: mockHeight } = mockSizeForWidth(scaledMockWidth);

  const step = ONBOARDING_STEPS[index] ?? ONBOARDING_STEPS[0];

  useEffect(() => {
    releaseSplashAfterFirstPaint();
    contentOpacity.setValue(0);
    let prewarmTimer: ReturnType<typeof setTimeout> | null = null;
    const fade = Animated.timing(contentOpacity, {
      toValue: 1,
      duration: ONBOARDING_CONTENT_FADE_MS,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (!finished || prewarmSentRef.current) return;
      prewarmTimer = setTimeout(() => {
        if (prewarmSentRef.current) return;
        prewarmSentRef.current = true;
        onReadyToPrewarmMain?.();
      }, ONBOARDING_STACK_PREWARM_DELAY_MS);
    });
    return () => {
      fade.stop();
      if (prewarmTimer != null) clearTimeout(prewarmTimer);
    };
  }, [contentOpacity, onReadyToPrewarmMain]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await markOnboardingCompleted();
    onFinished();
  }, [onFinished]);

  const goNext = useCallback(() => {
    if (index >= ONBOARDING_STEPS.length - 1) {
      void finish();
      return;
    }
    const next = index + 1;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }, [finish, index]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = event.nativeEvent.contentOffset.x;
      const next = Math.round(x / windowWidth);
      if (next >= 0 && next < ONBOARDING_STEPS.length) {
        setIndex(next);
      }
    },
    [windowWidth],
  );

  // 스와이프 중에도 옆 페이지 목업이 보이도록 전 스텝 동일 레벨로 마운트 (3장뿐)
  useEffect(() => {
    for (const s of ONBOARDING_STEPS) {
      getOnboardingMotion(s.id);
    }
  }, []);

  const renderItem: ListRenderItem<OnboardingStep> = useCallback(
    ({ item, index: itemIndex }) => (
      <View style={[styles.page, { width: windowWidth }]}>
        <View style={styles.mockSlot}>
          <OnboardingDeviceMock
            motion={getOnboardingMotion(item.id)}
            motionKey={item.id}
            width={mockWidth}
            height={mockHeight}
            active={itemIndex === index}
          />
        </View>
      </View>
    ),
    [index, mockHeight, mockWidth, windowWidth],
  );

  const ctaLabel = step?.ctaLabel ?? ONBOARDING_CTA_NEXT;

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}
      accessibilityLabel="온보딩"
    >
      <View style={[styles.dotsWrap, { paddingTop: FIGMA_DOTS_TOP * layoutScale }]}>
        <OnboardingPageIndicator count={ONBOARDING_STEPS.length} index={index} />
      </View>

      <Animated.View style={[styles.contentArea, { opacity: contentOpacity }]}>
        <View style={styles.copyBlock}>
          <Text
            style={[typography.headline04.bold, styles.title, { color: palette.text }]}
            accessibilityRole="header"
          >
            {step.title}
          </Text>
          <Text style={[typography.body01.regular, styles.body, { color: palette.textNeutral }]}>
            {step.body}
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={[...ONBOARDING_STEPS]}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          removeClippedSubviews={false}
          initialNumToRender={ONBOARDING_STEPS.length}
          maxToRenderPerBatch={ONBOARDING_STEPS.length}
          windowSize={ONBOARDING_STEPS.length}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemLayout={(_, i) => ({
            length: windowWidth,
            offset: windowWidth * i,
            index: i,
          })}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      </Animated.View>

      <View
        style={[
          styles.bottomChrome,
          {
            backgroundColor: palette.staticWhite,
            paddingBottom: Math.max(insets.bottom, spacing[200]),
          },
        ]}
      >
        <View style={styles.ctaRow}>
          <Button
            variant="primary"
            type="solid"
            size="large"
            onPress={goNext}
            style={styles.cta}
            accessibilityLabel={ctaLabel}
          >
            {ctaLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dotsWrap: {
    alignItems: 'center',
    zIndex: 2,
  },
  contentArea: {
    flex: 1,
  },
  copyBlock: {
    alignItems: 'center',
    paddingHorizontal: PAGE_PAD_H,
    marginTop: spacing[400],
    zIndex: 2,
  },
  title: {
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: spacing[200],
    maxWidth: 280,
  },
  body: {
    textAlign: 'center',
    includeFontPadding: false,
    marginBottom: spacing[400],
    maxWidth: 240,
  },
  list: {
    flex: 1,
    overflow: 'visible',
  },
  listContent: {
    flexGrow: 1,
  },
  page: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: PAGE_PAD_H,
    overflow: 'visible',
  },
  mockSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    overflow: 'visible',
  },
  bottomChrome: {
    zIndex: 2,
    paddingTop: CTA_PAD_V,
    paddingHorizontal: CTA_PAD_H,
  },
  ctaRow: {
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'stretch',
  },
});
