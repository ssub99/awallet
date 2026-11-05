/**
 * 루트 게이트 — 온보딩은 네비 스택에 넣지 않는다.
 *
 * 레이아웃:
 * - 온보딩: 항상 flex:1 (absolute 전환 금지 — CTA 붕괴 방지)
 * - Stack: 온보딩과 겹칠 때만 absoluteFill, 단독(main)일 때는 flex:1
 *   (absolute만 남으면 부모 높이 0 → 시작하기 후 빈 화면)
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
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type GatePhase = 'onboarding' | 'warming' | 'fading' | 'main';

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
  const [phase, setPhase] = useState<GatePhase>(
    initialNeedsOnboarding ? 'onboarding' : 'main',
  );
  const homeOpacity = useRef(new Animated.Value(initialNeedsOnboarding ? 0 : 1)).current;
  const mainActiveSentRef = useRef(!initialNeedsOnboarding);

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
    setPhase((prev) => {
      if (prev !== 'onboarding') return prev;
      return 'warming';
    });
  }, []);

  useEffect(() => {
    if (phase !== 'warming') return;
    activateMain();
    homeOpacity.setValue(0);
  }, [activateMain, homeOpacity, phase]);

  const handleOnboardingFinished = useCallback(() => {
    activateMain();
    homeOpacity.setValue(0);
    setPhase((prev) => (prev === 'fading' || prev === 'main' ? prev : 'fading'));
  }, [activateMain, homeOpacity]);

  useEffect(() => {
    if (phase !== 'fading') return undefined;
    homeOpacity.setValue(0);
    const anim = Animated.timing(homeOpacity, {
      toValue: 1,
      duration: ONBOARDING_TO_HOME_FADE_MS,
      useNativeDriver: true,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      homeOpacity.setValue(1);
      setPhase('main');
    });
    return () => {
      anim.stop();
    };
  }, [homeOpacity, phase]);

  const showOnboarding = phase === 'onboarding' || phase === 'warming' || phase === 'fading';
  const showStack = phase === 'warming' || phase === 'fading' || phase === 'main';
  /** 온보딩과 겹칠 때만 absolute — main 단독은 flex:1 로 높이 유지 */
  const stackOverlapping = showOnboarding && showStack;

  return (
    <View style={styles.fill}>
      {showOnboarding ? (
        <View
          style={styles.fill}
          pointerEvents={phase === 'onboarding' || phase === 'warming' ? 'auto' : 'none'}
        >
          <OnboardingScreen
            onFinished={handleOnboardingFinished}
            onReadyToPrewarmMain={handleReadyToPrewarmMain}
          />
        </View>
      ) : null}

      {showStack ? (
        <Animated.View
          style={[stackOverlapping ? styles.stackLayer : styles.fill, { opacity: homeOpacity }]}
          pointerEvents={phase === 'main' || phase === 'fading' ? 'auto' : 'none'}
        >
          <AppStack />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  stackLayer: {
    ...StyleSheet.absoluteFillObject,
  },
});
