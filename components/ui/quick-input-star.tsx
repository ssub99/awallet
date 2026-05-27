import { Icon } from '@/components/ui/icon';
import { colors, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Animated, StyleSheet, View } from 'react-native';
import { Circle, Defs, LinearGradient, Stop, Svg } from 'react-native-svg';

export interface QuickInputStarProps {
  /**
   * 원형 배경의 지름 (px)
   * - short 버전: 20
   * - long 버전: 24
   */
  size?: number;

  /**
   * 별 아이콘 스케일 애니메이션 값
   * - 제공되지 않으면 정적인 아이콘으로 렌더링
   */
  starScale?: Animated.Value;

  /**
   * 별 아이콘 회전 애니메이션 값
   * - 제공되지 않으면 회전 없이 렌더링
   */
  starRotate?: Animated.Value;
}

/**
 * Quick Input 공통 Star 아이콘 컴포넌트
 * - 그라데이션 원형 배경 + 중앙 Star 아이콘
 * - Animated.Value를 주입받으면 short/long 어디서든 동일 애니메이션 사용 가능
 */
export function QuickInputStar({ size = 20, starScale, starRotate }: QuickInputStarProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const WrapperComponent = starScale || starRotate ? Animated.View : View;

  const animatedStyle =
    starScale || starRotate
      ? {
          transform: [
            starScale ? { scale: starScale } : { scale: 1 },
            starRotate
              ? {
                  rotate: starRotate.interpolate({
                    inputRange: [0, 720],
                    outputRange: ['0deg', '720deg'],
                  }),
                }
              : { rotate: '0deg' },
          ],
        }
      : {};

  return (
    <View style={[styles.iconWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <LinearGradient
            id="starCircleGradient"
            x1={0}
            y1={0}
            x2={size}
            y2={size}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor="#8ca4dd" />
            <Stop offset="0.5625" stopColor="#3664ce" />
            <Stop offset="1" stopColor="#3664ce" />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#starCircleGradient)" />
      </Svg>
      <WrapperComponent style={[styles.iconInner, animatedStyle]}>
        <Icon name="star" variant="line" size={size === 20 ? 10 : 12} color={palette.staticWhite} />
      </WrapperComponent>
    </View>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

