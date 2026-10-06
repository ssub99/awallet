/**
 * Notice unread count badge — settings row (Figma Frame 281).
 */

import { atomicColors } from '@/constants/atomic-colors';
import { typographyLayout } from '@/constants/typography';
import { Text, View, StyleSheet } from 'react-native';

interface NoticeUnreadBadgeProps {
  count: number;
}

const BADGE_SIZE = 20;

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
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    backgroundColor: atomicColors.red[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeSingle: {
    width: BADGE_SIZE,
  },
  badgeWide: {
    minWidth: BADGE_SIZE,
    paddingHorizontal: 4,
  },
  // 토큰 lineHeight가 뱃지 높이보다 크면 iOS에서 글자가 아래로 밀린다.
  badgeText: {
    ...typographyLayout.uiLineBody02Bold,
    lineHeight: BADGE_SIZE,
    color: atomicColors.common[0],
    textAlign: 'center',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
});
