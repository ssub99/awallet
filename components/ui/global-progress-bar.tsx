import { useLoading } from '@/contexts/loading-context';
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';

export const GlobalProgressBar: React.FC = () => {
  const { isLoading } = useLoading();

  if (!isLoading) {
    return null;
  }

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay} pointerEvents="auto">
        <View style={styles.indicatorContainer}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorContainer: {
    transform: [{ scale: 1.33 }], // 1.33배 확대 (기본 large는 약 24px, 1.33배하면 32px)
  },
});
