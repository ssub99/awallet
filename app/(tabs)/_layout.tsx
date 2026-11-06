import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppTabs } from '@/components/navigation/app-tabs';
import { CreateSheetProvider } from '@/contexts/create-sheet-context';
import { QuickInputProvider } from '@/contexts/quick-input-context';

export const unstable_settings = {
  anchor: 'home',
};

export default function TabLayout() {
  return (
    <QuickInputProvider>
      <CreateSheetProvider>
        <View style={styles.wrapper}>
          <AppTabs />
        </View>
      </CreateSheetProvider>
    </QuickInputProvider>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
});
