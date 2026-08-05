/**
 * Notice unread count badge — settings row (Figma Frame 281).
 */

import { atomicColors } from '@/constants/atomic-colors';
import { typography } from '@/constants/typography';
import { Text, View, StyleSheet } from 'react-native';

interface NoticeUnreadBadgeProps {
  count: number;
}

export function NoticeUnreadBadge({ count }: NoticeUnreadBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 99 ? '99+' : String(count);
  const isSingleDigit = label.length === 1;

  return (
    <View
      style={[
        styles.badge,
        isSingleDigit ? styles.badgeSingle : styles.badgeWide,
      ]}
      accessibilityLabel={`읽지 않은 공지 ${count}개`}
      accessibilityRole="text"
    >
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minHeight: 16,
    borderRadius: 12,
    backgroundColor: atomicColors.red[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSingle: {
    width: 16,
    height: 16,
  },
  badgeWide: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.detail.bold,
    color: atomicColors.common[0],
    textAlign: 'center',
    includeFontPadding: false,
  },
});
