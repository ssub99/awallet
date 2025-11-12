import { Tabs } from 'expo-router';
import React from 'react';

import { TabBar } from '@/components/navigation/tab-bar';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CreateSheetProvider } from '@/contexts/create-sheet-context';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <CreateSheetProvider>
      <Tabs
        initialRouteName="home"
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
        }}>
        {/* Main App Screens */}
        <Tabs.Screen
          name="home"
          options={{
            title: '홈',
            tabBarIcon: ({ focused }) => (
              <Icon name="home" variant={focused ? 'solid' : 'line'} size={28} color={colors.staticBlack} />
            ),
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            title: '만들기',
            tabBarIcon: () => (
              <Icon name="addTask" variant="line" size={28} color={colors.staticBlack} />
            ),
          }}
        />
        <Tabs.Screen
          name="mypage"
          options={{
            title: '마이페이지',
            tabBarIcon: ({ focused }) => (
              <Icon name="mypage" variant={focused ? 'solid' : 'line'} size={28} color={colors.staticBlack} />
            ),
          }}
        />
        
        {/* Hidden tabs - still accessible but not in bottom navigation */}
        <Tabs.Screen
          name="index"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="inputs"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="selectboxs"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="radios"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="tabs"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </CreateSheetProvider>
  );
}
