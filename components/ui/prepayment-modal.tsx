import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ModalPopup } from '@/components/ui/modal-popup';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { ReactNode, useMemo } from 'react';

export interface PrepaymentModalProps {
  visible: boolean;
  title?: string;
  description?: string | ReactNode;
  categoryLabel: string; // e.g., "🍚 식비"
  amountText: string; // e.g., "20,000원"
  periodText: string; // e.g., "기간 : 2025.10.28"
  selectedDateLabel: string; // e.g., "2025.09.28"
  onOpenDatePicker: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  backdropInteractive?: boolean;
  extraOverlay?: ReactNode;
}

export function PrepaymentModal({
  visible,
  title = '할부 기록 선결제 반영 안내',
  // 설명 문구 (줄바꿈 1회)
  description = '선택하신 사항에 따라\n할부 기록 내역이 선결제 반영 됩니다.',
  categoryLabel,
  amountText,
  periodText,
  selectedDateLabel,
  onOpenDatePicker,
  onConfirm,
  onCancel,
  backdropInteractive = true,
  extraOverlay,
}: PrepaymentModalProps) {
  const scheme = useColorScheme();
  const palette = colors[scheme ?? 'light'] as ColorPalette;

  const descriptionNode = useMemo(() => {
    if (typeof description === 'string') {
      return (
        <Text style={[styles.desc, { color: palette.text }]} accessibilityRole="text">
          {description}
        </Text>
      );
    }
    return description;
  }, [description, palette.text]);

  return (
    <ModalPopup
      visible={visible}
      title={title}
      onConfirm={onConfirm}
      confirmText="확인"
      onCancel={onCancel}
      cancelText="취소"
      closeOnBackdrop={true}
      backdropInteractive={backdropInteractive}
      extraOverlay={extraOverlay}
    >
      <View style={styles.container}>
        <View style={[styles.centerBlock]}>
          {descriptionNode}
        </View>

        <View style={[styles.card, { backgroundColor: palette.fill }]}>
          <View style={styles.cardRow}>
            <Text style={[styles.cardTitle, { color: palette.text }]} accessibilityRole="text">
              {categoryLabel}
            </Text>
            <Text style={[styles.cardAmount, { color: palette.text }]} accessibilityRole="text">
              {amountText}
            </Text>
          </View>
          <View style={styles.cardRow}>
            <View style={styles.cardTitleSpacer} />
            <Text style={[styles.cardSub, { color: palette.textAssistive }]} accessibilityRole="text">
              {periodText}
            </Text>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: palette.text }]} accessibilityRole="text">
            선결제 처리 날짜
          </Text>
          <Pressable
            onPress={onOpenDatePicker}
            style={[styles.selectBox, { borderColor: palette.border, backgroundColor: palette.staticWhite }]}
            accessibilityRole="button"
            accessibilityLabel="선결제 처리 날짜 선택"
          >
            <View style={styles.selectContent}>
              <Icon name="calendarMonth" size={24} color={palette.text} />
              <Text style={[styles.selectText, { color: palette.text }]} accessibilityRole="text">
                {selectedDateLabel}
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </ModalPopup>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  centerBlock: {
    alignItems: 'center',
  },
  desc: {
    ...typography.body1.l.regular,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 24,
    marginBottom: 0,
  },
  cardTitle: {
    ...typography.body1.l.bold,
  },
  cardAmount: {
    ...typography.body1.l.bold,
  },
  cardSub: {
    ...typography.body2.r.regular,
  },
  cardTitleSpacer: {
    width: 48,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    ...typography.body1.l.bold,
  },
  selectBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  selectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectText: {
    ...typography.body1.l.regular,
  },
});

export default PrepaymentModal;


