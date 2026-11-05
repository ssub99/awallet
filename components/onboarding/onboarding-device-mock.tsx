import type { OnboardingMotionSource } from '@/constants/onboarding-steps';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Image } from 'expo-image';
import LottieView from 'lottie-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

/** Figma Screen01 @ 280폭 기준 — 실제 렌더는 width 비율로 스케일 */
const FIGMA_MOCK_WIDTH = 280;
const BEZEL_RADIUS = 40;
const SCREEN_RADIUS = 32;
const BEZEL_INSET = spacing[200]; // 8
/** Figma Bezel fill ≈ #3B3B3B — 가장 가까운 토큰 neutral/800 */
const BEZEL_COLOR = atomicColors.neutral[800];

type OnboardingDeviceMockProps = {
  motion: OnboardingMotionSource;
  /** 스텝 전환 시 Lottie 재시작용 */
  motionKey: string;
  width: number;
  height: number;
  /** 현재 페이지일 때만 재생 — 비활성도 UI는 그대로 두어 스와이프 중 보이게 */
  active: boolean;
};

export function OnboardingDeviceMock({
  motion,
  motionKey,
  width,
  height,
  active,
}: OnboardingDeviceMockProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const lottieRef = useRef<LottieView>(null);
  const scale = width / FIGMA_MOCK_WIDTH;
  const bezelRadius = BEZEL_RADIUS * scale;
  const screenRadius = SCREEN_RADIUS * scale;
  const bezelInset = BEZEL_INSET * scale;
  const shadowOffsetY = 24 * scale;
  const shadowRadius = 48 * scale;

  useEffect(() => {
    if (motion.kind !== 'lottie') {
      return;
    }
    if (!active) {
      lottieRef.current?.pause();
      return;
    }
    const raf = requestAnimationFrame(() => {
      lottieRef.current?.reset();
      lottieRef.current?.play();
    });
    return () => {
      cancelAnimationFrame(raf);
      lottieRef.current?.pause();
    };
  }, [active, motion.kind, motionKey]);

  return (
    <View
      style={[
        styles.shadowHost,
        {
          width,
          height,
          shadowColor: palette.staticBlack,
          shadowOffset: { width: 0, height: shadowOffsetY },
          shadowRadius,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={{
          width,
          height,
          backgroundColor: BEZEL_COLOR,
          borderRadius: bezelRadius,
          padding: bezelInset,
        }}
      >
        <View
          style={[
            styles.screen,
            {
              backgroundColor: palette.staticWhite,
              borderRadius: screenRadius,
            },
          ]}
        >
          {motion.kind === 'lottie' ? (
            <LottieView
              ref={lottieRef}
              key={motionKey}
              source={motion.source}
              autoPlay={false}
              loop
              resizeMode="contain"
              style={styles.fill}
            />
          ) : null}
          {motion.kind === 'image' ? (
            <Image
              source={motion.source}
              style={styles.fill}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowHost: {
    shadowOpacity: 0.22,
    elevation: 10,
    backgroundColor: 'transparent',
  },
  screen: {
    flex: 1,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
