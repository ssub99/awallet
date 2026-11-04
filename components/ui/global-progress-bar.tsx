import { colors, spacing } from '@/constants/theme';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/** Root overlay (not RN Modal) — iOS present/pop crash with 기록 시트. */
export const GlobalProgressBar: React.FC = () => {
  const { isLoading } = useLoading();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];

  if (!isLoading) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View
        style={[
          styles.indicatorContainer,
          { backgroundColor: palette.overlayDim },
        ]}
      >
        <ActivityIndicator size="small" color={palette.staticWhite} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100020,
    elevation: 100020,
  },
  indicatorContainer: {
    width: spacing[900],
    height: spacing[900],
    borderRadius: spacing[900] / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
