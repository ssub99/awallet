/**
 * 루트 게이트 — 온보딩은 네비 스택에 넣지 않는다. (구조 유지)
 *
 * 「시작하기」 순서:
 * 1) 온보딩 페이드아웃
 * 2) 이후 홈 Stack 마운트 → 글로벌 인디케이터 + 홈 렌더
 */

import { OnboardingScreen } from '@/components/onboarding/onboarding-screen';
import {
  NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS,
  NOTICE_IMAGE_VIEWER_ROUTE_NAME,
} from '@/constants/notice-image-viewer-navigation-options';
import { ONBOARDING_TO_HOME_FADE_MS } from '@/constants/onboarding-motion';
import {
  ROOT_STACK_MODAL_ROUTE_NAME,
  ROOT_STACK_ROUTE_NAMES,
} from '@/constants/root-stack-routes';
import { ROOT_STACK_SCREEN_OPTIONS } from '@/constants/sub-stack-screen-options';
import { colors } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type GatePhase = 'onboarding' | 'warming' | 'fading' | 'main';

const screenBackground = colors.light.background;

function rootStackScreenOptions(name: (typeof ROOT_STACK_ROUTE_NAMES)[number]) {
  if (name === NOTICE_IMAGE_VIEWER_ROUTE_NAME) {
    return NOTICE_IMAGE_VIEWER_NAVIGATION_OPTIONS;
  }
  return undefined;
}

function AppStack() {
  return (
    <Stack screenOptions={ROOT_STACK_SCREEN_OPTIONS}>
      {ROOT_STACK_ROUTE_NAMES.map((name) => (
        <Stack.Screen key={name} name={name} options={rootStackScreenOptions(name)} />
      ))}
      <Stack.Screen
        name={ROOT_STACK_MODAL_ROUTE_NAME}
        options={{ presentation: 'modal', title: 'Modal' }}
      />
    </Stack>
  );
}

export type RootAppNavigationProps = {
  initialNeedsOnboarding: boolean;
  onMainAppActive: () => void;
};

export function RootAppNavigation({
  initialNeedsOnboarding,
  onMainAppActive,
}: RootAppNavigationProps) {
  const { setLoading } = useLoading();
  const [phase, setPhase] = useState<GatePhase>(
    initialNeedsOnboarding ? 'onboarding' : 'main',
  );
  const onboardingOpacity = useRef(
    new Animated.Value(initialNeedsOnboarding ? 1 : 0),
  ).current;
  const mainActiveSentRef = useRef(!initialNeedsOnboarding);
  const fadeAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (!initialNeedsOnboarding) {
      onMainAppActive();
    }
  }, [initialNeedsOnboarding, onMainAppActive]);

  const activateMain = useCallback(() => {
    if (mainActiveSentRef.current) return;
    mainActiveSentRef.current = true;
    onMainAppActive();
  }, [onMainAppActive]);

  const handleReadyToPrewarmMain = useCallback(() => {
    setPhase((prev) => (prev === 'onboarding' ? 'warming' : prev));
  }, []);

  // warming: 홈/AppData 올리지 않음 — 온보딩 스와이프 중 JS·렌더 경합 방지

  const handleOnboardingFinished = useCallback(() => {
    activateMain();
    setPhase((prev) => (prev === 'fading' || prev === 'main' ? prev : 'fading'));
  }, [activateMain]);

  useEffect(() => {
    if (phase !== 'fading') return undefined;

    let cancelled = false;
    onboardingOpacity.setValue(1);

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      fadeAnimRef.current?.stop();
      const anim = Animated.timing(onboardingOpacity, {
        toValue: 0,
        duration: ONBOARDING_TO_HOME_FADE_MS,
        useNativeDriver: true,
      });
      fadeAnimRef.current = anim;
      anim.start(({ finished }) => {
        if (cancelled || !finished) return;
        onboardingOpacity.setValue(0);
        // 페이드 끝난 뒤에야 홈 마운트 + 인디케이터
        setLoading(true);
        setPhase('main');
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      fadeAnimRef.current?.stop();
      fadeAnimRef.current = null;
    };
  }, [onboardingOpacity, phase, setLoading]);

  const showOnboarding = phase === 'onboarding' || phase === 'warming' || phase === 'fading';
  const showStack = phase === 'main';

  return (
    <View style={[styles.fill, styles.screenSurface]}>
      {showStack ? (
        <View style={styles.fill}>
          <AppStack />
        </View>
      ) : null}

      {showOnboarding ? (
        <Animated.View
          collapsable={false}
          style={[
            showStack ? styles.overlay : styles.fill,
            styles.screenSurface,
            { opacity: onboardingOpacity },
          ]}
          pointerEvents={phase === 'fading' ? 'none' : 'auto'}
        >
          <OnboardingScreen
            onFinished={handleOnboardingFinished}
            onReadyToPrewarmMain={handleReadyToPrewarmMain}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  screenSurface: {
    backgroundColor: screenBackground,
  },
});
