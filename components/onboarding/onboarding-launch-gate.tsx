/**
 * 온보딩이 필요하면:
 * 1) 첫 페인트부터 불투명 커버로 (tabs)/home 을 가림
 * 2) useLayoutEffect 로 즉시 /onboarding replace
 * 3) onboarding 세그먼트 확정 후에만 커버·스플래시 해제
 *
 * post-mount replace만으로는 홈이 한 프레임이라도 보이는 문제가 있어 커버를 씀.
 */

import { colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { shouldShowOnboarding } from '@/utils/onboarding-settings';
import { useRouter, useSegments } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

type OnboardingLaunchGateProps = {
  /** prepare()에서 미리 판정한 값. null이면 마운트 시 재확인 */
  needsOnboarding: boolean | null;
  onSettled: () => void;
};

export function OnboardingLaunchGate({
  needsOnboarding: needsOnboardingProp,
  onSettled,
}: OnboardingLaunchGateProps) {
  const router = useRouter();
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(needsOnboardingProp);
  const settledRef = useRef(false);
  const replaceRequestedRef = useRef(false);

  const settle = () => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    onSettledRef.current();
  };

  // prop이 나중에 채워지는 경우 동기화
  useEffect(() => {
    if (needsOnboardingProp != null) {
      setNeedsOnboarding(needsOnboardingProp);
    }
  }, [needsOnboardingProp]);

  // prop 없이 마운트된 경우(안전망)
  useEffect(() => {
    if (needsOnboardingProp != null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const show = await shouldShowOnboarding();
      if (!cancelled) {
        setNeedsOnboarding(show);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsOnboardingProp]);

  useLayoutEffect(() => {
    if (needsOnboarding == null) {
      return;
    }
    if (!needsOnboarding) {
      settle();
      return;
    }
    if (segments[0] === 'onboarding') {
      settle();
      return;
    }
    if (replaceRequestedRef.current) {
      return;
    }
    replaceRequestedRef.current = true;
    router.replace('/onboarding');
  }, [needsOnboarding, router, segments]);

  useEffect(() => {
    if (needsOnboarding === false) {
      settle();
      return;
    }
    if (segments[0] === 'onboarding') {
      settle();
    }
  }, [needsOnboarding, segments]);

  // 실패 대비
  useEffect(() => {
    const timer = setTimeout(() => settle(), 3000);
    return () => clearTimeout(timer);
  }, []);

  const covering = needsOnboarding !== false && segments[0] !== 'onboarding';

  if (!covering) {
    return null;
  }

  return (
    <View
      pointerEvents="auto"
      style={[styles.cover, { backgroundColor: palette.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100000,
    elevation: 100000,
  },
});
