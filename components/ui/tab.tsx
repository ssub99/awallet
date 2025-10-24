/**
 * Tab Component
 * 
 * A horizontal tab navigation component matching Figma design system.
 * Supports multiple tabs with active indicator.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface TabOption {
  label: string;
  value: string;
}

export interface TabProps {
  /**
   * Tab options
   */
  options: TabOption[];
  
  /**
   * Selected tab value
   */
  value: string;
  
  /**
   * Change handler
   */
  onValueChange?: (value: string) => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Tab Component
 */
export function Tab({
  options,
  value,
  onValueChange,
  style,
}: TabProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const handleTabPress = (tabValue: string) => {
    if (tabValue !== value) {
      onValueChange?.(tabValue);
    }
  };

  const renderTabs = () => (
    <>
      {options.map((option) => {
        const isActive = value === option.value;
        
        return (
          <Pressable
            key={option.value}
            onPress={() => handleTabPress(option.value)}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
          >
            <View style={styles.tabContent}>
              <Text
                style={[
                  styles.tabText,
                  {
                    color: isActive ? colors.staticBlack : colors.textAssistive,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {option.label}
              </Text>
              
              {/* Active Indicator */}
              {isActive && (
                <View
                  style={[
                    styles.indicator,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </View>
          </Pressable>
        );
      })}
    </>
  );

  return (
    <View style={[styles.container, style]}>
      {/* Tab Menu with horizontal padding */}
      <View style={styles.menuWrapper}>
        <View style={styles.tabsContainer}>
          {renderTabs()}
        </View>
      </View>
      
      {/* Bottom Divider - Full Width */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  menuWrapper: {
    paddingHorizontal: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    height: 56,
  },
  tabItem: {
    flex: 1, // Equal width distribution
  },
  tabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 8, // Text padding (8px)
  },
  tabText: {
    fontSize: 16,
    fontFamily: 'Pretendard',
    lineHeight: 24,
    textAlign: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    // Full width - ignores text padding
  },
  divider: {
    height: 1,
    width: '100%',
  },
});

