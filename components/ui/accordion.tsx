/**
 * Accordion Component
 *
 * A simple accordion with a toggle header.
 */

import { Icon } from '@/components/ui/icon';
import { colors, type ColorPalette } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ReactNode, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

export interface AccordionProps {
  /**
   * Expanded state
   */
  expanded: boolean;

  /**
   * Toggle handler
   */
  onToggle?: (nextExpanded: boolean) => void;

  /**
   * Disabled state
   */
  disabled?: boolean;

  /**
   * Label when expanded
   */
  expandedLabel?: string;

  /**
   * Label when collapsed
   */
  collapsedLabel?: string;

  /**
   * Content to show when expanded
   */
  children?: ReactNode;

  /**
   * Container style
   */
  style?: ViewStyle;

  /**
   * Header style
   */
  headerStyle?: ViewStyle;

  /**
   * Content style
   */
  contentStyle?: ViewStyle;

  /**
   * Accessibility label for the toggle
   */
  accessibilityLabel?: string;
}

export function Accordion({
  expanded,
  onToggle,
  disabled = false,
  expandedLabel = '접기',
  collapsedLabel = '펼치기',
  children,
  style,
  headerStyle,
  contentStyle,
  accessibilityLabel,
}: AccordionProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const label = expanded ? expandedLabel : collapsedLabel;
  const iconName = expanded ? 'arrowUp' : 'arrowDown';

  const textStyle = useMemo(() => {
    if (disabled) {
      return typographyLayout.uiLineButton02Medium;
    }
    return expanded ? typographyLayout.uiLineButton02Regular : typographyLayout.uiLineButton02Medium;
  }, [disabled, expanded]);

  const handlePress = () => {
    if (disabled) return;
    onToggle?.(!expanded);
  };

  return (
    <View style={style}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded }}
        accessibilityLabel={accessibilityLabel ?? label}
        style={[
          styles.header,
          {
            backgroundColor: disabled ? palette.fillDisabled : palette.staticWhite,
            borderColor: palette.border,
          },
          headerStyle,
        ]}
      >
        <View style={styles.headerContent}>
          <Text
            style={[
              textStyle,
              { color: disabled ? palette.textAssistive : palette.text },
            ]}
          >
            {label}
          </Text>
          <Icon
            name={iconName}
            variant="line"
            size={16}
            color={disabled ? palette.textAssistive : palette.text}
          />
        </View>
      </Pressable>
      {expanded && children ? (
        <View style={contentStyle}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 41,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
