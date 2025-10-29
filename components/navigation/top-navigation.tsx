/**
 * Top Navigation Component
 * 
 * A flexible top navigation bar matching Figma design system.
 * Supports main/sub types with various configurations.
 */

import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
   * - main: Menu name (left aligned, Bold 21)
   * - sub: Title (center aligned, Bold 16)
   */
  title: string;
  
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
   * Period type for main type (year/month toggle)
   */
  periodType?: 'year' | 'month';
  
  /**
   * Period type change handler
   */
  onPeriodChange?: (type: 'year' | 'month') => void;
  
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
  showDay = false,
  dateText,
  showLeftIcon = false,
  onLeftIconPress,
  showRightButton = false,
  rightButtonText = '확인',
  onRightButtonPress,
  periodType = 'month',
  onPeriodChange,
  showDropdownArrow = false,
  onDropdownPress,
  yearOptions,
  selectedYear,
  onYearChange,
  monthOptions,
  selectedMonth,
  onMonthChange,
  style,
}: TopNavigationProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
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
    // 년도만 선택하거나 년도/월 선택
    if (yearOptions && yearOptions.length > 0) {
      setShowMonthPicker(true);
    } else if (onDropdownPress) {
      onDropdownPress();
    }
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

          {/* Main Type: Title/Date with dropdown arrow */}
          {type === 'main' && (
            <Pressable
              onPress={showDropdownArrow ? handleDropdownPress : undefined}
              disabled={!showDropdownArrow}
              style={styles.mainTitleContainer}
            >
              <Text style={[styles.mainTitle, { color: colors.text }]}>
                {showDay && dateText ? dateText : title}
              </Text>
              {showDropdownArrow && (
                <Icon name="arrowDown" variant="solid" size={24} color={colors.textAssistive} />
              )}
            </Pressable>
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
                onPress={() => handlePeriodChange('year')}
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
                onPress={() => handlePeriodChange('month')}
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
        </View>
      </View>

      {/* Bottom Divider */}
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {/* Year/Month Picker */}
      {yearOptions && yearOptions.length > 0 && (
        <DatePicker
          visible={showMonthPicker}
          onClose={() => setShowMonthPicker(false)}
          title={monthOptions && monthOptions.length > 0 ? '년/월 선택' : '년도 선택'}
          yearOptions={yearOptions}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          monthOptions={monthOptions}
          selectedMonth={selectedMonth}
          onMonthChange={onMonthChange}
        />
      )}
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
    paddingVertical: 12, // Add vertical padding for better alignment
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 21,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 31.5,
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
    fontSize: 16,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 24,
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
    fontSize: 14,
    fontFamily: 'Pretendard',
    fontWeight: '700',
    lineHeight: 21,
  },
  rightButton: {
    paddingHorizontal: 16,
    height: 32,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightButtonText: {
    fontSize: 14,
    fontFamily: 'Pretendard',
    fontWeight: '500',
    lineHeight: 21,
  },
  divider: {
    height: 1,
    width: '100%',
  },
});

