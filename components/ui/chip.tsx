/**
 * Chip Component
 * 
 * A chip component for labels, categories, and filters.
 * Supports active/default states with proper styling based on Figma design.
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

export interface ChipProps {
  /**
   * Chip label text
   */
  label: string;
  
  /**
   * Active state (selected)
   */
  active?: boolean;
  
  /**
   * Press handler
   */
  onPress?: () => void;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Chip Component
 */
export function Chip({
  label,
  active = false,
  onPress,
  style,
}: ChipProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  // Colors based on state (matching Figma design)
  const backgroundColor = active ? '#3664ce' : colors.staticWhite;
  const textColor = active ? colors.staticWhite : '#616161';
  const borderColor = active ? '#3664ce' : 'rgba(144, 146, 158, 0.16)';

  return (
    <Pressable
      onPress={handlePress}
      style={[
        styles.container,
        {
          backgroundColor,
          borderColor,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        style={[
          active ? styles.textActive : styles.textDefault,
          { color: textColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
    borderWidth: 1,
    alignSelf: 'flex-start',
    minHeight: 37, // Figma design height
  },
  textActive: {
    fontFamily: 'Pretendard',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  textDefault: {
    fontFamily: 'Pretendard',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    textAlign: 'center',
  },
});

