/**
 * RadioGroup Component
 * 
 * A container component for managing multiple radio buttons.
 * Ensures only one radio can be selected at a time.
 */

import { Radio } from '@/components/ui/radio';
import { StyleSheet, View, ViewStyle } from 'react-native';

export interface RadioOption {
  label: string;
  value: string;
}

export interface RadioGroupProps {
  /**
   * Radio options
   */
  options: RadioOption[];
  
  /**
   * Selected value
   */
  value?: string;
  
  /**
   * Change handler
   */
  onValueChange?: (value: string) => void;
  
  /**
   * Disabled state
   */
  disabled?: boolean;
  
  /**
   * Layout direction
   */
  direction?: 'vertical' | 'horizontal';
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * RadioGroup Component
 */
export function RadioGroup({
  options,
  value,
  onValueChange,
  disabled = false,
  direction = 'vertical',
  style,
}: RadioGroupProps) {
  return (
    <View
      style={[
        styles.container,
        direction === 'horizontal' ? styles.horizontal : styles.vertical,
        style,
      ]}
    >
      {options.map((option) => (
        <Radio
          key={option.value}
          checked={value === option.value}
          onPress={() => onValueChange?.(option.value)}
          label={option.label}
          disabled={disabled}
          style={direction === 'horizontal' ? styles.radioHorizontal : styles.radioVertical}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Base container
  },
  vertical: {
    flexDirection: 'column',
  },
  horizontal: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  radioVertical: {
    marginBottom: 16,
  },
  radioHorizontal: {
    marginRight: 24,
    marginBottom: 12,
  },
});

