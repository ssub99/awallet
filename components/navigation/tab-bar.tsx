/**
 * Tab Bar — Figma `tabBar` COMPONENT_SET (홈 · 챌린지 · 리포트 · 설정)
 */

import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { tabReselectEvent, type TabReselectName } from '@/utils/tab-reselect-event';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function isReselectTab(name: string): name is TabReselectName {
  return name === 'home' || name === 'challenge' || name === 'report';
}

export function TabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const insets = useSafeAreaInsets();

  const allowedRoutes = __DEV__
    ? ['home', 'challenge', 'report', 'mypage', 'components', 'icons']
    : ['home', 'challenge', 'report', 'mypage'];

  const visibleRoutes = state.routes.filter((route) => allowedRoutes.includes(route.name));

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: palette.staticWhite,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <View style={[styles.divider, { backgroundColor: palette.border }]} />

      <View style={styles.tabsContainer}>
        {visibleRoutes.map((route) => {
          const index = state.routes.indexOf(route);
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            if (isFocused && isReselectTab(route.name)) {
              tabReselectEvent.emit(route.name);
              return;
            }

            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          const onLongPress = () => {
            emitter.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          const iconElement = options.tabBarIcon?.({
            focused: isFocused,
            color: palette.staticBlack,
            size: 24,
          });

          const label =
            typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : typeof options.title === 'string'
                ? options.title
                : route.name;

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabItem}
            >
              <View style={styles.iconContainer}>{iconElement}</View>
              <Text
                style={[
                  isFocused ? styles.labelActive : styles.labelDefault,
                  { color: palette.text },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  divider: {
    height: 1,
    width: '100%',
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 64,
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelActive: {
    ...typography.detail.bold,
    textAlign: 'center',
  },
  labelDefault: {
    ...typography.detail.regular,
    textAlign: 'center',
  },
});
