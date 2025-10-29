import { useLoading } from '@/contexts/loading-context';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export const GlobalProgressBar: React.FC = () => {
  const { isLoading } = useLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <View style={styles.overlay}>
      <View style={styles.indicatorContainer}>
        <ActivityIndicator 
          size="large" 
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  indicatorContainer: {
    transform: [{ scale: 1.33 }], // 1.33배 확대 (기본 large는 약 24px, 1.33배하면 32px)
  },
});
