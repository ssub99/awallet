import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';

import { TabBar } from '@/components/navigation/tab-bar';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CreateSheetProvider } from '@/contexts/create-sheet-context';
import { QuickInputProvider } from '@/contexts/quick-input-context';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <QuickInputProvider>
      <CreateSheetProvider>
        <View style={styles.wrapper}>
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
          name="challenge"
          options={{
            title: '챌린지',
            tabBarIcon: ({ focused }) => (
              <Icon name="challenge" variant={focused ? 'solid' : 'line'} size={28} color={colors.staticBlack} />
            ),
          }}
        />
        <Tabs.Screen
          name="mypage"
          options={{
            title: '설정',
            tabBarIcon: ({ focused }) => (
              <Icon name="setting" variant={focused ? 'solid' : 'line'} size={28} color={colors.staticBlack} />
            ),
          }}
        />
        
        {/* Hidden tabs - still accessible but not in bottom navigation */}
        <Tabs.Screen
          name="create"
          options={{
            href: null,
          }}
        />
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
