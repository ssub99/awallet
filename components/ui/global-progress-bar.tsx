import { useLoading } from '@/contexts/loading-context';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

/** Root overlay (not RN Modal) — iOS present/pop crash with 기록 시트. */
export const GlobalProgressBar: React.FC = () => {
  const { isLoading } = useLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="auto">
      <View style={styles.indicatorContainer}>
        <ActivityIndicator size="small" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100020,
    elevation: 100020,
  },
  indicatorContainer: {},
});
