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
          <ActivityIndicator size="small" />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorContainer: {
  },
});
