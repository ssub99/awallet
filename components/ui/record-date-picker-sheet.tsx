import { BasicCalendarDaySelect } from '@/components/ui/calendar-day-basic';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type RecordDatePickerSheetProps = {
  visible: boolean;
  title: string;
  selectedDate: string | null | undefined;
  onSelectedDateChange: (isoDate: string) => void;
  onClose: () => void;
  /** ISO `YYYY-MM-DD` */
  onConfirm: (isoDate: string) => void;
  monthStartDay: number;
  embedded?: boolean;
};

function RecordDatePickerSheetComponent({
  visible,
  title,
  selectedDate,
  onSelectedDateChange,
  onClose,
  onConfirm,
  monthStartDay,
  embedded = false,
}: RecordDatePickerSheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const handleConfirmPress = useCallback(() => {
    if (selectedDate) {
      onConfirm(selectedDate);
    }
  }, [onConfirm, selectedDate]);

  return (
    <ModalBottomsheet
      visible={visible}
      title={title}
      onClose={onClose}
      closeOnBackdrop
      embedded={embedded}
      contentStyle={styles.sheetContent}
    >
      <BasicCalendarDaySelect
        selectedDate={selectedDate ?? undefined}
        onDayPress={onSelectedDateChange}
        monthStartDay={monthStartDay}
      />
      <View style={styles.buttonArea}>
        <Pressable
          style={[styles.confirmButton, { backgroundColor: colors.primary }]}
          onPress={handleConfirmPress}
          accessibilityRole="button"
          accessibilityLabel="확인"
        >
          <Text style={[styles.confirmButtonText, { color: colors.staticWhite }]}>확인</Text>
        </Pressable>
      </View>
    </ModalBottomsheet>
  );
}

export const RecordDatePickerSheet = memo(RecordDatePickerSheetComponent);

const styles = StyleSheet.create({
  sheetContent: {
    padding: 0,
  },
  buttonArea: {
    padding: 16,
  },
  confirmButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    ...Typography.body1.l.medium,
  },
});
