/**
 * SegmentControls Component
 *
 * Segmented control matching Figma `segmentControls` component:
 * - style = line
 * - supports active / disabled states
 *
 * Usage:
 *  - Single-select segments (e.g., 결제 수단: 신용카드 / 체크카드 / 현금)
 *  - Controlled component: parent owns `value` and `onValueChange`
 */

import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { TextStyle, ViewStyle } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface SegmentOption {
  label: string;
  value: string;
  /**
   * Optional per-option disabled state
   * - When true, the option is visually disabled and not selectable
   */
  disabled?: boolean;
}

export interface SegmentControlsProps {
  /**
   * Segment options
   */
  options: SegmentOption[];

  /**
   * Selected segment value (controlled)
   */
  value: string;

  /**
   * Change handler
   */
  onValueChange?: (value: string) => void;

  /**
   * Disable entire control
   */
  disabled?: boolean;

  /**
   * Callback when a disabled segment (or control) is pressed
   * - Useful for showing "변경할 수 없습니다. 새로 생성해 주세요." toast on edit screens
   */
  onPressDisabled?: () => void;

  /**
   * Container style override
   */
  style?: ViewStyle;
}

export function SegmentControls({
  options,
  value,
  onValueChange,
  disabled = false,
  onPressDisabled,
  style,
}: SegmentControlsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  // Base styles derived from theme (공통 스타일은 한 번만 계산)
  const baseSegmentStyle: ViewStyle = {
    ...styles.segment,
    backgroundColor: colors.staticWhite,
  };

  const baseTextStyle: TextStyle = {
    ...(Typography.body2.r.regular as TextStyle),
    textAlign: 'center',
    color: colors.textAssistive,
  };

  const activeTextStyle: TextStyle = {
    ...(Typography.body2.r.bold as TextStyle),
    color: colors.primaryHeavy,
  };

  const disabledTextStyle: TextStyle = {
    color: colors.textDisabled,
  };

  const handlePress = (segmentValue: string, segmentDisabled: boolean | undefined) => {
    if (disabled || segmentDisabled) {
      onPressDisabled?.();
      return;
    }

    if (segmentValue !== value) {
      onValueChange?.(segmentValue);
    }
  };

  const isAllDisabled = disabled || options.every((option) => option.disabled);

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.segmentGroup,
          {
            borderColor: colors.border,
          },
        ]}
      >
        {options.map((option, index) => {
          const isActive = value === option.value;
          const isOptionDisabled = disabled || option.disabled;

          const isLast = index === options.length - 1;
          const isFirst = index === 0;

          // Border rules:
          // - Active: 상하좌우 1
          // - Inactive:
          //   1) 첫 번째 세그먼트: 상/하/좌 (1)
          //   2) 중간 세그먼트: 우측만 (1)
          //   3) 마지막 세그먼트: 상/하/우 (1)
          const borderStyle: ViewStyle = isActive
            ? (
                disabled
                  ? {
                      // 전체 disabled 상태에서 선택된 세그먼트: 두께 2, Line/Normal
                      borderWidth: 2,
                      borderColor: colors.border,
                    }
                  : {
                      // 활성 상태에서 선택된 세그먼트: 두께 1, Primary/Heavy
                      borderWidth: 1,
                      borderColor: isOptionDisabled ? colors.border : colors.primaryHeavy,
                    }
              )
            : (() => {
                if (isFirst) {
                  // 첫 번째 세그먼트: 상/하/좌/우
                  return {
                    borderTopWidth: 1,
                    borderBottomWidth: 1,
                    borderLeftWidth: 1,
                    borderRightWidth: 1,
                    borderColor: colors.border,
                  };
                }

                // 중간 + 마지막 세그먼트: 상/하/우
                return {
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderRightWidth: 1,
                  borderColor: colors.border,
                };
              })();

          // Background rules:
          // - 전체 disabled 상태:
          //   - 선택된 세그먼트: Disabled 배경
          //   - 선택되지 않은 세그먼트: Fill/Normal
          // - 활성 상태:
          //   - 선택된 세그먼트: Blue50
          //   - 개별 disabled 옵션: Disabled 배경
          const backgroundStyle: ViewStyle | null = disabled
            ? ({
                backgroundColor: isActive ? colors.fillDisabled : colors.fill,
              } as ViewStyle)
            : isOptionDisabled
            ? ({ backgroundColor: colors.fillDisabled } as ViewStyle)
            : isActive
            ? ({ backgroundColor: AtomicColors.blue[50] } as ViewStyle)
            : null;

          const segmentBorderRadiusStyle: ViewStyle = {
            borderTopLeftRadius: isFirst ? styles.segment.borderRadius : 0,
            borderBottomLeftRadius: isFirst ? styles.segment.borderRadius : 0,
            borderTopRightRadius: isLast ? styles.segment.borderRadius : 0,
            borderBottomRightRadius: isLast ? styles.segment.borderRadius : 0,
          };

          return (
            <Pressable
              key={option.value}
              style={[
                baseSegmentStyle,
                segmentBorderRadiusStyle,
                borderStyle,
                backgroundStyle ?? undefined,
              ]}
              onPress={() => handlePress(option.value, option.disabled)}
              accessibilityRole="button"
              accessibilityState={{
                disabled: isOptionDisabled,
                selected: isActive,
              }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  baseTextStyle,
                  isActive ? activeTextStyle : undefined,
                  isOptionDisabled ? disabledTextStyle : undefined,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isAllDisabled && (
        <View
          // Invisible overlay purely for semantics (prevents accidental pointer events leakage)
          pointerEvents="none"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  segmentGroup: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingHorizontal: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0,
    borderRadius: 12,
  },
});


