/**
 * Tab Bar Component
 * 
 * Bottom navigation bar matching Figma design system.
 * Used as the main navigation for the app.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createSheetEvent } from '@/utils/create-sheet-event';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Tab Bar matching Figma design
 */
export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const insets = useSafeAreaInsets();
  
  // Track last tap time for double tap detection
  const lastTapTime = useRef<Record<string, number>>({});
  const DOUBLE_TAP_DELAY = 500; // ms

  // Only show specific routes
  // Production: home, challenge, mypage
  // Development: home, challenge, mypage, components, icons
  const allowedRoutes = __DEV__ 
    ? ['home', 'challenge', 'mypage', 'components', 'icons']
    : ['home', 'challenge', 'mypage'];
  
  const visibleRoutes = state.routes.filter((route) => {
    return allowedRoutes.includes(route.name);
  });

  return (
    <View 
      style={[
        styles.container, 
        { 
          backgroundColor: colors.staticWhite,
          paddingBottom: insets.bottom, // Auto adjusts for home indicator (34pt on iPhone X+, 0pt otherwise)
        }
      ]}
    >
      {/* Top Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Tab Items */}
      <View style={styles.tabsContainer}>
        {visibleRoutes.map((route) => {
          const index = state.routes.indexOf(route);
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const onPress = () => {
            // Special handling for 'create' tab - trigger bottom sheet instead of navigation
            if (route.name === 'create') {
              createSheetEvent.emit();
              return; // Don't navigate
            }
            
            const now = Date.now();
            const lastTap = lastTapTime.current[route.name] || 0;
            const timeSinceLastTap = now - lastTap;
            
            // Check for double tap on already focused tab
            if (isFocused && timeSinceLastTap < DOUBLE_TAP_DELAY) {
              // Double tap detected on focused tab
              navigation.emit({
                type: 'tabDoubleTap' as any,
                target: route.key,
                data: { routeName: route.name },
              });
              lastTapTime.current[route.name] = 0; // Reset to prevent triple tap
            } else {
              // Regular tap
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
              
              lastTapTime.current[route.name] = now;
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          // Get icon (28px as defined in _layout.tsx)
          const iconElement = options.tabBarIcon?.({
            focused: isFocused,
            color: isFocused ? colors.text : colors.textAssistive,
            size: 28,
          });

          // Get label (ensure it's a string)
          const label = typeof options.tabBarLabel === 'string'
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
              {/* Icon */}
              <View style={styles.iconContainer}>
                {iconElement}
              </View>

              {/* Label */}
              <Text
                style={[
                  styles.label,
                  {
                    color: isFocused ? colors.text : colors.textAssistive,
                    fontWeight: isFocused ? '700' : '400',
                  },
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
  container: {
    // Height auto-adjusts with safe area insets
  },
  divider: {
    height: 1,
    width: '100%',
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 64, // Tab content height
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  iconContainer: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontFamily: 'Pretendard',
    lineHeight: 18,
    textAlign: 'center',
  },
});

