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

import { atomicColors } from '@/constants/atomic-colors';
import { colors, type ColorPalette } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
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
   * Size variant
   * - large: height 48, borderRadius 12 (default)
   * - small: height 32, borderRadius 8
   */
  size?: 'large' | 'small';

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
  size = 'large',
  style,
}: SegmentControlsProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  // Size-based dimensions
  const sizeConfig = size === 'small' 
    ? { height: 32, borderRadius: 8 }
    : { height: 48, borderRadius: 12 };

  // Base styles derived from theme (공통 스타일은 한 번만 계산)
  const baseSegmentStyle: ViewStyle = {
    ...styles.segment,
    height: sizeConfig.height,
    borderRadius: sizeConfig.borderRadius,
    backgroundColor: palette.staticWhite,
  };

  // Size-based typography
  const baseTextStyle: TextStyle = {
    ...(size === 'small' ? typographyLayout.segmentSmallRegular : typographyLayout.segmentLargeRegular),
    textAlign: 'center',
    color: palette.textAssistive,
  };

  const activeTextStyle: TextStyle = {
    ...(size === 'small' ? typographyLayout.segmentSmallBold : typographyLayout.segmentLargeBold),
    color: palette.primaryHeavy,
  };

  const disabledTextStyle: TextStyle = {
    color: palette.textDisabled,
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
            borderRadius: sizeConfig.borderRadius,
            borderColor: palette.border,
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
                      borderColor: palette.border,
                    }
                  : {
                      // 활성 상태에서 선택된 세그먼트: 두께 1, Primary/Heavy
                      borderWidth: 1,
                      borderColor: isOptionDisabled ? palette.border : palette.primaryHeavy,
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
                    borderColor: palette.border,
                  };
                }

                // 중간 + 마지막 세그먼트: 상/하/우
                return {
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderRightWidth: 1,
                  borderColor: palette.border,
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
                backgroundColor: isActive ? palette.fillDisabled : palette.fill,
              } as ViewStyle)
            : isOptionDisabled
            ? ({ backgroundColor: palette.fillDisabled } as ViewStyle)
            : isActive
            ? ({ backgroundColor: atomicColors.blue[50] } as ViewStyle)
            : null;

          const segmentBorderRadiusStyle: ViewStyle = {
            borderTopLeftRadius: isFirst ? sizeConfig.borderRadius : 0,
            borderBottomLeftRadius: isFirst ? sizeConfig.borderRadius : 0,
            borderTopRightRadius: isLast ? sizeConfig.borderRadius : 0,
            borderBottomRightRadius: isLast ? sizeConfig.borderRadius : 0,
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


