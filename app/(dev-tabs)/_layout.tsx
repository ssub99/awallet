import { Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '@/components/navigation/tab-bar';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DevTabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Tabs
      initialRouteName="components"
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
      }}>
      {/* Development/Test Screens */}
      <Tabs.Screen
        name="components"
        options={{
          title: 'Components',
          tabBarIcon: ({ color }) => <Icon name="search" variant="line" size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="icons"
        options={{
          title: 'Icons',
          tabBarIcon: ({ color }) => <Icon name="info" variant="line" size={28} color={color} />,
        }}
      />
    </Tabs>
  );
}

