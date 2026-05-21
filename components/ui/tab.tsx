/**
 * Tab Component
 * 
 * A horizontal tab navigation component matching Figma design system.
 * Supports multiple tabs with active indicator.
 */

import { Colors, Typography } from '@/constants/theme';
import { compactSingleLineTextStyle } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';

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
  
  /**
   * Enable horizontal scrolling for many tabs
   */
  scrollable?: boolean;
}

/**
 * Tab Component
 */
export function Tab({
  options,
  value,
  onValueChange,
  style,
  scrollable = false,
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
        const tabItemStyle = scrollable ? styles.scrollableTabItem : styles.tabItem;
        const tabContentStyle = scrollable ? styles.scrollableTabContent : styles.tabContent;
        
        return (
          <Pressable
            key={option.value}
            onPress={() => handleTabPress(option.value)}
            style={tabItemStyle}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={option.label}
          >
            <View style={tabContentStyle}>
              <Text
                style={[
                  isActive ? styles.tabTextActive : styles.tabTextDefault,
                  {
                    color: isActive ? colors.staticBlack : colors.textAssistive,
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
        {scrollable ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollableTabsContainer}
            style={styles.scrollView}
          >
            {renderTabs()}
          </ScrollView>
        ) : (
          <View style={styles.tabsContainer}>
            {renderTabs()}
          </View>
        )}
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
  scrollView: {
    height: 56,
  },
  scrollableTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    flexGrow: 0,
  },
  tabItem: {
    flex: 1,
  },
  scrollableTabItem: {
    height: 56,
  },
  // Common content styles
  tabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 8,
  },
  scrollableTabContent: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    paddingHorizontal: 8,
  },
  tabTextActive: {
    ...compactSingleLineTextStyle(Typography.body1.l.bold),
    textAlign: 'center',
  },
  tabTextDefault: {
    ...compactSingleLineTextStyle(Typography.body1.l.medium),
    textAlign: 'center',
  },
  indicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  divider: {
    height: 1,
    width: '100%',
  },
});

