/**
 * global.emptyState.whenListHasNoItems
 * 목록·내역 없음 — info(line) 아이콘 + 안내 문구, 세로 중앙.
 */

import { Icon } from '@/components/ui/icon';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

const CONTENT_WIDTH = 242;
const ITEM_SPACING = 12;

export interface ListEmptyPlaceholderProps {
  message: string;
  /** 본문 영역 optical center 보정 (예: 상단 고정 카드 높이 절반) */
  verticalOffset?: number;
  style?: ViewStyle;
}

export function ListEmptyPlaceholder({
  message,
  verticalOffset = 0,
  style,
}: ListEmptyPlaceholderProps) {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <View
        style={[
          styles.content,
          verticalOffset !== 0 ? { transform: [{ translateY: verticalOffset }] } : null,
        ]}
      >
        <Icon name="info" variant="line" size={24} color={colors.textAssistive} />
        <Text style={[styles.message, { color: colors.textAssistive }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: CONTENT_WIDTH,
    alignItems: 'center',
    gap: ITEM_SPACING,
  },
  message: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
