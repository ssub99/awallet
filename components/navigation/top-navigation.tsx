/**
 * Top Navigation Component
 * 
 * A flexible top navigation bar matching Figma design system.
 * Supports main/sub types with various configurations.
 */

import { DatePicker } from '@/components/ui/date-picker';
import { Icon, type IconName } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface TopNavigationProps {
  /**
   * Navigation type
   * - main: Large title with period selector
   * - sub: Small centered title with back button
   */
  type?: 'main' | 'sub';
  
  /**
   * Title text
   * - main: Used as single menu label when tabs not provided; or sub title
   * - sub: Title (center aligned, Bold 16)
   */
  title: string;
  
  /**
   * Main type only. Menu items as tabs (same structure for 1 or 2+).
   * When length is 1, pressing the menu does nothing.
   * When length >= 2, pressing switches tab and calls onTabChange.
   */
  tabs?: { id: string; label: string }[];
  
  /**
   * Main type only. Active tab id when using tabs. Defaults to first tab id.
   */
  activeTabId?: string;
  
  /**
   * Main type only. Called when user selects another tab (tabs.length >= 2).
   */
  onTabChange?: (id: string) => void;
  
  /**
   * Show date display
   */
  showDay?: boolean;
  
  /**
   * Date text (e.g., "2025/10" for main, "2025년 09월" for sub)
   */
  dateText?: string;
  
  /**
   * Show left icon (back button for sub type)
   */
  showLeftIcon?: boolean;
  
  /**
   * Left icon press handler
   */
  onLeftIconPress?: () => void;
  
  /**
   * Show right button (small button for sub type)
   */
  showRightButton?: boolean;
  
  /**
   * Right button text
   */
  rightButtonText?: string;
  
  /**
   * Right button press handler
   */
  onRightButtonPress?: () => void;

  /**
   * Show right icon button (sub type)
   */
  showRightIcon?: boolean;

  /**
   * Right icon name
   */
  rightIconName?: IconName;

  /**
   * Right icon press handler
   */
  onRightIconPress?: () => void;
  
  /**
   * Period type for main type (year/month toggle)
   */
  periodType?: 'year' | 'month';
  
  /**
   * Period type change handler
   */
  onPeriodChange?: (type: 'year' | 'month') => void;

  /**
   * 설정 시 년도/월 토글 탭에 `ui` 이벤트(`target: ym-switch`, `label`) 전송
   */
  periodToggleAnalyticsScreenName?: string;
  
  /**
   * Show dropdown arrow next to title/date
   */
  showDropdownArrow?: boolean;
  
  /**
   * Dropdown arrow press handler (for main type with day)
   * If monthOptions provided, opens month picker
   */
  onDropdownPress?: () => void;
  
  /**
   * Year options for picker (main type with day)
   */
  yearOptions?: { label: string; value: number }[];
  
  /**
   * Selected year value
   */
  selectedYear?: number;
  
  /**
   * Year change handler
   */
  onYearChange?: (year: number) => void;

  /**
   * Year + month apply in one callback (fewer home re-renders on confirm)
   */
  onYearMonthChange?: (year: number, month: number | undefined) => void;
  
  /**
   * Month options for picker (main type with day)
   */
  monthOptions?: { label: string; value: number }[];
  
  /**
   * Selected month value
   */
  selectedMonth?: number;
  
  /**
   * Month change handler
   */
  onMonthChange?: (month: number) => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Top Navigation Component
 */
export function TopNavigation({
  type = 'main',
  title,
  tabs: tabsProp,
  activeTabId,
  onTabChange,
  showDay = false,
  dateText,
  showLeftIcon = false,
  onLeftIconPress,
  showRightButton = false,
  rightButtonText = '확인',
  onRightButtonPress,
  showRightIcon = false,
  rightIconName = 'filter',
  onRightIconPress,
  periodType = 'month',
  onPeriodChange,
  periodToggleAnalyticsScreenName,
  showDropdownArrow = false,
  onDropdownPress,
  yearOptions,
  selectedYear,
  onYearChange,
  onYearMonthChange,
  monthOptions,
  selectedMonth,
  onMonthChange,
  style,
}: TopNavigationProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  // Main type: unified tab structure (1 or 2+ items)
  const effectiveTabs = tabsProp ?? [{ id: 'default', label: title }];
  const activeId = activeTabId ?? effectiveTabs[0]?.id ?? 'default';
  const isSingleTab = effectiveTabs.length <= 1;
  
  // Year/Month Picker state
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  // Animation values for Period Toggle
  const periodSlideX = useRef(new Animated.Value(periodType === 'year' ? 0 : 46)).current;

  const handleLeftIconPress = () => {
    if (onLeftIconPress) {
      onLeftIconPress();
    }
  };

  const handleRightButtonPress = () => {
    if (onRightButtonPress) {
      onRightButtonPress();
    }
  };

  const handleRightIconPress = () => {
    if (onRightIconPress) {
      onRightIconPress();
    }
  };

  const handlePeriodChange = (newType: 'year' | 'month') => {
    if (onPeriodChange && newType !== periodType) {
      onPeriodChange(newType);
    }
  };

  // Animate period toggle slide (switch-like animation)
  useEffect(() => {
    Animated.spring(periodSlideX, {
      toValue: periodType === 'year' ? 0 : 46, // 42px width + 4px gap
      useNativeDriver: true,
      tension: 100,
      friction: 10,
    }).start();
  }, [periodType, periodSlideX]);

  const handleDropdownPress = () => {
    if (yearOptions && yearOptions.length > 0) {
      setShowMonthPicker(true);
    } else if (onDropdownPress) {
      onDropdownPress();
    }
  };

  const handleMainTabPress = (id: string) => {
    if (isSingleTab) {
      // 메뉴 1개: 탭 텍스트 누름 → 아무 동작 없음 (드롭다운만 별도 처리)
      return;
    }
    if (id !== activeId) {
      onTabChange?.(id);
    }
  };

  const handleMainTabOrDropdownPress = (id: string) => {
    if (id === activeId && showDropdownArrow) {
      handleDropdownPress();
      return;
    }
    handleMainTabPress(id);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.staticWhite }, style]}>
      {/* Content */}
      <View style={styles.content}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {/* Sub Type: Back Icon */}
          {type === 'sub' && showLeftIcon && (
            <Pressable
              onPress={handleLeftIconPress}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="뒤로 가기"
            >
              <Icon name="arrowLeft" size={24} color={colors.text} />
            </Pressable>
          )}

          {/* Main Type: Tabs (1 or 2+), same structure. 1 tab + no dropdown → no press. */}
          {type === 'main' && (
            <View style={styles.mainTabsRow}>
              {effectiveTabs.map((tab) => {
                const isActive = tab.id === activeId;
                const displayLabel = showDay && dateText && isActive ? dateText : tab.label;
                const canPressDropdown = isActive && showDropdownArrow;
                const hasPress = !isSingleTab || canPressDropdown;
                const content = (
                  <>
                    <Text
                      style={[
                        styles.mainTitle,
                        { color: isActive ? colors.text : colors.textAssistive },
                      ]}
                    >
                      {displayLabel}
                    </Text>
                    {showDropdownArrow && isActive && (
                      <Icon name="arrowDown" variant="solid" size={24} color={colors.textAssistive} />
                    )}
                  </>
                );
                return hasPress ? (
                  <Pressable
                    key={tab.id}
                    onPress={() => handleMainTabOrDropdownPress(tab.id)}
                    style={styles.mainTitleContainer}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={displayLabel}
                  >
                    {content}
                  </Pressable>
                ) : (
                  <View key={tab.id} style={styles.mainTitleContainer} accessibilityLabel={displayLabel}>
                    {content}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Center Section (Sub Type Only) */}
        {type === 'sub' && !showDay && (
          <View style={styles.centerSection}>
            <Text style={[styles.subTitle, { color: colors.text }]}>
              {title}
            </Text>
          </View>
        )}

        {/* Center Section with Day (Sub Type Only) */}
        {type === 'sub' && showDay && dateText && (
          <Pressable
            onPress={showDropdownArrow ? handleDropdownPress : undefined}
            disabled={!showDropdownArrow}
            style={styles.centerDateContainer}
          >
            <Text style={[styles.subTitle, { color: colors.text }]}>
              {dateText}
            </Text>
            {showDropdownArrow && (
              <Icon name="arrowDown" variant="solid" size={24} color={colors.textAssistive} />
            )}
          </Pressable>
        )}

        {/* Right Section */}
        <View style={styles.rightSection}>
          {/* Main Type: Period Toggle with Switch Animation */}
          {type === 'main' && onPeriodChange && (
            <View style={[styles.periodToggle, { backgroundColor: colors.fill }]}>
              {/* Animated Background (Switch Effect) */}
              <Animated.View
                style={[
                  styles.periodBackground,
                  { 
                    backgroundColor: colors.staticWhite,
                    transform: [{ translateX: periodSlideX }]
                  },
                ]}
              />
              
              {/* Buttons */}
              <Pressable
                onPress={() => {
                  if (periodToggleAnalyticsScreenName) {
                    void logEvent('ui', {
                      screen_name: periodToggleAnalyticsScreenName,
                      target: 'ym-switch',
                      label: '년도',
                    });
                  }
                  handlePeriodChange('year');
                }}
                style={styles.periodButton}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: periodType === 'year' ? colors.text : colors.textAssistive },
                  ]}
                >
                  년도
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (periodToggleAnalyticsScreenName) {
                    void logEvent('ui', {
                      screen_name: periodToggleAnalyticsScreenName,
                      target: 'ym-switch',
                      label: '월',
                    });
                  }
                  handlePeriodChange('month');
                }}
                style={styles.periodButton}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: periodType === 'month' ? colors.text : colors.textAssistive },
                  ]}
                >
                  월
                </Text>
              </Pressable>
            </View>
          )}

          {/* Sub Type: Right Button */}
          {type === 'sub' && showRightButton && (
            <Pressable
              onPress={handleRightButtonPress}
              style={[styles.rightButton, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={rightButtonText}
            >
              <Text style={[styles.rightButtonText, { color: colors.staticWhite }]}>
                {rightButtonText}
              </Text>
            </Pressable>
          )}

          {type === 'sub' && showRightIcon && (
            <Pressable
              onPress={handleRightIconPress}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={`${rightIconName} 아이콘 버튼`}
            >
              <Icon name={rightIconName} size={24} color={colors.text} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Bottom Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Year/Month Picker */}
      {yearOptions && yearOptions.length > 0 && showMonthPicker ? (
        <DatePicker
          visible={showMonthPicker}
          onClose={() => setShowMonthPicker(false)}
          title={monthOptions && monthOptions.length > 0 ? '년/월 선택' : '년도 선택'}
          yearOptions={yearOptions}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          onYearMonthChange={onYearMonthChange}
          monthOptions={monthOptions}
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Background color set dynamically
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
    // Figma spec height 56: remove vertical padding to keep total height at 56
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mainTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mainTitle: {
    ...Typography.headline4.r.bold,
  },
  centerSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  centerDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subTitle: {
    ...Typography.body1.l.bold,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  periodToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
    position: 'relative',
  },
  periodBackground: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 42,
    height: 32,
    borderRadius: 12,
  },
  periodButton: {
    width: 42,
    height: 32,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  periodButtonActive: {
    // Removed - using animated background instead
  },
  periodText: {
    ...Typography.body2.r.bold,
  },
  rightButton: {
    paddingHorizontal: 16,
    height: 32,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightButtonText: {
    ...Typography.body2.r.medium,
  },
  divider: {
    height: 1,
    width: '100%',
  },
});

