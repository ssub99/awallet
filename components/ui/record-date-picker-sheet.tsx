import { BasicCalendarDaySelect } from '@/components/ui/calendar-day-basic';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { colors, typography, type ColorPalette } from '@/constants/theme';
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
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

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
          style={[styles.confirmButton, { backgroundColor: palette.primary }]}
          onPress={handleConfirmPress}
          accessibilityRole="button"
          accessibilityLabel="확인"
        >
          <Text style={[styles.confirmButtonText, { color: palette.staticWhite }]}>확인</Text>
        </Pressable>
      </View>
    </ModalBottomsheet>
  );
}

function recordDatePickerSheetPropsAreEqual(
  prev: RecordDatePickerSheetProps,
  next: RecordDatePickerSheetProps,
): boolean {
  return (
    prev.visible === next.visible &&
    prev.title === next.title &&
    prev.selectedDate === next.selectedDate &&
    prev.monthStartDay === next.monthStartDay &&
    prev.embedded === next.embedded &&
    prev.onSelectedDateChange === next.onSelectedDateChange &&
    prev.onClose === next.onClose &&
    prev.onConfirm === next.onConfirm
  );
}

export const RecordDatePickerSheet = memo(
  RecordDatePickerSheetComponent,
  recordDatePickerSheetPropsAreEqual,
);

/** 조건부 마운트 시 부모 리렌더로 시트·캘린더가 불필요하게 갱신되는 것을 줄입니다. */
export type RecordDatePickerHostProps = Omit<RecordDatePickerSheetProps, 'visible'> & {
  open: boolean;
};

function RecordDatePickerHostComponent({
  open,
  ...sheetProps
}: RecordDatePickerHostProps) {
  if (!open) {
    return null;
  }
  return <RecordDatePickerSheet visible {...sheetProps} />;
}

export const RecordDatePickerHost = memo(
  RecordDatePickerHostComponent,
  (prev, next) => prev.open === next.open && recordDatePickerSheetPropsAreEqual(
    { ...prev, visible: true },
    { ...next, visible: true },
  ),
);

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
    ...typography.body1.l.medium,
  },
});
