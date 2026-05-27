/**
 * Tag Component
 * 
 * A tag component for status indicators and labels.
 * Supports normal/positive/negative states with proper styling based on Figma design.
 */

import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { singleRowCenteredTextStyle, typography } from '@/constants/typography';

export type TagStatus = 'normal' | 'positive' | 'negative';

export interface TagProps {
  /**
   * Tag label text
   */
  label: string;
  
  /**
   * Tag status variant
   */
  status?: TagStatus;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Tag Component
 */
export function Tag({
  label,
  status = 'normal',
  style,
}: TagProps) {

  // colors based on status (matching Figma design)
  const getStatusColors = (status: TagStatus) => {
    switch (status) {
      case 'positive':
        return {
          backgroundColor: '#ecf0f8',
          textColor: '#3664ce',
        };
      case 'negative':
        return {
          backgroundColor: '#fbe9e9',
          textColor: '#ef2a2a',
        };
      case 'normal':
      default:
        return {
          backgroundColor: '#f5f5f8',
          textColor: '#636470',
        };
    }
  };

  const { backgroundColor, textColor } = getStatusColors(status);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.text,
          { color: textColor },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    minHeight: 26, // Figma design height
  },
  text: {
    ...singleRowCenteredTextStyle(typography.detail.r.bold),
    textAlign: 'center',
  },
});