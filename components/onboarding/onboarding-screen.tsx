/**
 * 온보딩 UI — 네비 스택 밖(루트 게이트)에서만 마운트.
 * 카피·목업을 페이지 안에 두어 스와이프 중 setState 레이아웃 경합을 줄인다.
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
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

/** FlatList data 참조 고정 — 매 렌더 새 배열 만들지 않음 */
const ONBOARDING_STEPS_DATA: OnboardingStep[] = [...ONBOARDING_STEPS];

function mockSizeForWidth(width: number): { width: number; height: number } {
  const scale = width / FIGMA_MOCK_WIDTH;
  const inset = FIGMA_BEZEL_INSET * scale;
  const innerW = width - inset * 2;
  const height = innerW * FIGMA_LOTTIE_ASPECT + inset * 2;
  return { width, height };
}

type StepPageProps = {
  step: OnboardingStep;
  pageWidth: number;
  mockWidth: number;
  mockHeight: number;
  active: boolean;
  titleColor: string;
  bodyColor: string;
};

const OnboardingStepPage = memo(function OnboardingStepPage({
  step,
  pageWidth,
  mockWidth,
  mockHeight,
  active,
  titleColor,
  bodyColor,
}: StepPageProps) {
  const motion = useMemo(() => getOnboardingMotion(step.id), [step.id]);

  return (
    <View style={[styles.page, { width: pageWidth }]}>
      <View style={styles.copyBlock}>
        <Text
          style={[typography.headline04.bold, styles.title, { color: titleColor }]}
          accessibilityRole="header"
        >
          {step.title}
        </Text>
        <Text style={[typography.body01.regular, styles.body, { color: bodyColor }]}>
          {step.body}
        </Text>
      </View>
      <View style={styles.mockSlot}>
        <OnboardingDeviceMock
          motion={motion}
          motionKey={step.id}
          width={mockWidth}
          height={mockHeight}
          active={active}
        />
      </View>
    </View>
  );
});

export type OnboardingScreenProps = {
  onFinished: () => void;
  /** 컨텐츠 페이드 후 — AppData 등 가벼운 워밍만 (홈 UI 마운트 아님) */
  onReadyToPrewarmMain?: () => void;
};

export function OnboardingScreen({ onFinished, onReadyToPrewarmMain }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<OnboardingStep>>(null);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const finishingRef = useRef(false);
  const prewarmSentRef = useRef(false);
  const scrollingRef = useRef(false);

  const { width: windowWidth } = useWindowDimensions();
  const layoutScale = windowWidth / FIGMA_WIDTH;
  const availableMockWidth = Math.max(0, windowWidth - PAGE_PAD_H * 2);
  const scaledMockWidth = Math.min(
    availableMockWidth,
    Math.round(FIGMA_MOCK_WIDTH * layoutScale),
  );
  const { width: mockWidth, height: mockHeight } = mockSizeForWidth(scaledMockWidth);

  const step = ONBOARDING_STEPS_DATA[index] ?? ONBOARDING_STEPS_DATA[0];

  useEffect(() => {
    // Lottie JSON 선행 로드 — 스와이프 중 require 방지
    for (const s of ONBOARDING_STEPS_DATA) {
      getOnboardingMotion(s.id);
    }
  }, []);

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

  const commitIndex = useCallback((next: number) => {
    if (next < 0 || next >= ONBOARDING_STEPS_DATA.length) return;
    if (indexRef.current === next) return;
    indexRef.current = next;
    setIndex(next);
  }, []);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await markOnboardingCompleted();
    onFinished();
  }, [onFinished]);

  const goNext = useCallback(() => {
    if (indexRef.current >= ONBOARDING_STEPS_DATA.length - 1) {
      void finish();
      return;
    }
    if (scrollingRef.current) return;
    const next = indexRef.current + 1;
    scrollingRef.current = true;
    listRef.current?.scrollToIndex({ index: next, animated: true });
    // 인덱스는 스크롤 종료 시 반영 — 스크롤 중 전 페이지 remount 방지
  }, [finish]);

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollingRef.current = false;
      const x = event.nativeEvent.contentOffset.x;
      const next = Math.round(x / windowWidth);
      commitIndex(next);
    },
    [commitIndex, windowWidth],
  );

  const onScrollBeginDrag = useCallback(() => {
    scrollingRef.current = true;
  }, []);

  const renderItem: ListRenderItem<OnboardingStep> = useCallback(
    ({ item, index: itemIndex }) => (
      <OnboardingStepPage
        step={item}
        pageWidth={windowWidth}
        mockWidth={mockWidth}
        mockHeight={mockHeight}
        active={itemIndex === index}
        titleColor={palette.text}
        bodyColor={palette.textNeutral}
      />
    ),
    [index, mockHeight, mockWidth, palette.text, palette.textNeutral, windowWidth],
  );

  const ctaLabel = step?.ctaLabel ?? ONBOARDING_CTA_NEXT;

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}
      accessibilityLabel="온보딩"
    >
      <View style={[styles.dotsWrap, { paddingTop: FIGMA_DOTS_TOP * layoutScale }]}>
        <OnboardingPageIndicator count={ONBOARDING_STEPS_DATA.length} index={index} />
      </View>

      <Animated.View style={[styles.contentArea, { opacity: contentOpacity }]}>
        <FlatList
          ref={listRef}
          data={ONBOARDING_STEPS_DATA}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={index}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          decelerationRate="fast"
          removeClippedSubviews={false}
          initialNumToRender={ONBOARDING_STEPS_DATA.length}
          maxToRenderPerBatch={ONBOARDING_STEPS_DATA.length}
          windowSize={ONBOARDING_STEPS_DATA.length}
          onScrollBeginDrag={onScrollBeginDrag}
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
