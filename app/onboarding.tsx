/**
 * 온보딩 — Figma onboarding.default
 * 루트 `unstable_settings.anchor = 'onboarding'` 으로 앱이 여기서 시작.
 * 불필요하면 홈으로 replace (탭을 먼저 띄우지 않음).
 */

import { OnboardingDeviceMock } from '@/components/onboarding/onboarding-device-mock';
import { OnboardingPageIndicator } from '@/components/onboarding/onboarding-page-indicator';
import { Button } from '@/components/ui/button';
import {
  ONBOARDING_CTA_NEXT,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from '@/constants/onboarding-steps';
import { colors, spacing, typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { releaseFirstScreenSplash } from '@/utils/first-screen-splash';
import {
  markOnboardingCompleted,
  shouldShowOnboarding,
} from '@/utils/onboarding-settings';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  // RN 신버전에서 InteractionManager 제거됨 — 두 프레임 뒤 첫 페인트 이후 hide
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      releaseFirstScreenSplash();
    });
  });
}

const FIGMA_WIDTH = 375;
const FIGMA_MOCK_WIDTH = 280;
/** Lottie 캔버스 375×783 — 베젤 inset 안쪽 화면이 동일 비율 */
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

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<OnboardingStep>>(null);
  const [index, setIndex] = useState(0);
  const [ready, setReady] = useState(false);

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
    let cancelled = false;
    void (async () => {
      const show = await shouldShowOnboarding();
      if (cancelled) {
        return;
      }
      if (!show) {
        router.replace('/home');
        // 홈 마운트 전에도 스플래시가 고착되지 않게 — 홈에서도 한 번 더 release
        releaseSplashAfterFirstPaint();
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    releaseSplashAfterFirstPaint();
  }, [ready]);

  const finish = useCallback(async () => {
    await markOnboardingCompleted();
    router.replace('/home');
  }, [router]);

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

  const renderItem: ListRenderItem<OnboardingStep> = useCallback(
    ({ item, index: itemIndex }) => (
      <View style={[styles.page, { width: windowWidth }]}>
        <View style={styles.mockSlot}>
          <OnboardingDeviceMock
            motion={item.motion}
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

  if (!ready) {
    return <View style={[styles.root, { backgroundColor: palette.background }]} />;
  }

  return (
    <View
      style={[styles.root, { backgroundColor: palette.background, paddingTop: insets.top }]}
      accessibilityLabel="온보딩"
    >
      <View style={[styles.dotsWrap, { paddingTop: FIGMA_DOTS_TOP * layoutScale }]}>
        <OnboardingPageIndicator count={ONBOARDING_STEPS.length} index={index} />
      </View>

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
        // 드롭쉐도우가 FlatList 클립에 사각 박스로 보이지 않게
        removeClippedSubviews={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={(_, i) => ({
          length: windowWidth,
          offset: windowWidth * i,
          index: i,
        })}
        style={styles.list}
        contentContainerStyle={styles.listContent}
      />

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
    // overflow hidden 금지 — 베젤 드롭쉐도우가 잘려 사각 배경처럼 보임
    // 하단 목업 크롭은 bottomChrome 불투명 레이어가 담당
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
