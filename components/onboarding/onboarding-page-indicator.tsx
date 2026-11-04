import { colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

const DOT = 8;
const ACTIVE_WIDTH = 16;
const GAP = 8;

type OnboardingPageIndicatorProps = {
  count: number;
  index: number;
};

export function OnboardingPageIndicator({ count, index }: OnboardingPageIndicatorProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const dots = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  return (
    <View
      style={styles.row}
      accessibilityRole="adjustable"
      accessibilityLabel={`온보딩 ${index + 1} / ${count}`}
    >
      {dots.map((i) => {
        const active = i === index;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              active ? styles.dotActive : styles.dotIdle,
              {
                backgroundColor: active ? palette.primary : palette.textDisabled,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: GAP,
    height: DOT,
  },
  dot: {
    height: DOT,
    borderRadius: 12,
  },
  dotActive: {
    width: ACTIVE_WIDTH,
  },
  dotIdle: {
    width: DOT,
  },
});
