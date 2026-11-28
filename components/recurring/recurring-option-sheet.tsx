/** 반복/할부 설정 바텀시트 (복사 화면) — 확인 시에만 옵션을 반영한다 */

import { Accordion } from '@/components/ui/accordion';
import { Chip } from '@/components/ui/chip';
import { ModalBottomsheet } from '@/components/ui/modal-bottomsheet';
import { Radio } from '@/components/ui/radio';
import { SectionTitle } from '@/components/ui/section-title';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { typography, type ColorPalette } from '@/constants/theme';
import { useToast } from '@/contexts/toast-context';
import { shouldIgnoreWeekendOptionForRecurringType } from '@/utils/expense-calculations';
import type { WeekendOption } from '@/utils/recurring-record-series';
import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface RepeatOptions {
  isRecurring: boolean;
  isInstallment: boolean;
  recurringType: string;
  totalMonths: number;
  weekendOption: WeekendOption;
}

const RECURRING_PERIODS = ['매일', '매주', '매월', '2주', '3주', '4주', '2개월 마다', '3개월 마다', '4개월 마다', '5개월 마다', '6개월 마다', '주중', '주말'];
const INSTALLMENT_MONTHS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** 월 단위 반복의 개월 수 */
const RECURRING_TYPE_MONTHS: Record<string, number> = {
  매월: 1,
  '2개월 마다': 2,
  '3개월 마다': 3,
  '4개월 마다': 4,
  '5개월 마다': 5,
  '6개월 마다': 6,
};
const WEEKEND_OPTIONS: { value: WeekendOption; label: string }[] = [
  { value: 'weekend', label: '관계없이 주말 기록' },
  { value: 'friday', label: '금주 금요일 기록' },
  { value: 'monday', label: '차주 월요일 기록' },
];

interface RecurringOptionSheetProps {
  visible: boolean;
  value: RepeatOptions;
  palette: ColorPalette;
  onClose: () => void;
  onConfirm: (value: RepeatOptions) => void;
}

export function RecurringOptionSheet({ visible, value, palette, onClose, onConfirm }: RecurringOptionSheetProps) {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(value);
  const [isExpanded, setIsExpanded] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // 열 때마다 확정된 값에서 다시 시작한다
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDraft(value);
  }

  const isOff = !draft.isRecurring && !draft.isInstallment;
  const ignoresWeekend =
    draft.isRecurring && shouldIgnoreWeekendOptionForRecurringType(draft.recurringType);

  const selectWeekend = (weekendOption: WeekendOption) => {
    if (isOff) return;
    if (ignoresWeekend) {
      showToast('해당 단위는 주말 옵션을 적용할 수 없습니다.');
      return;
    }
    setDraft((prev) => ({ ...prev, weekendOption }));
  };

  return (
    <ModalBottomsheet
      visible={visible}
      title="반복/할부 설정"
      onClose={onClose}
      onConfirm={() => onConfirm(ignoresWeekend ? { ...draft, weekendOption: 'weekend' } : draft)}
      confirmText="확인"
      closeOnBackdrop
      style={{ height: Dimensions.get('window').height * 0.8 }}
      contentStyle={{ padding: 0 }}
      noPaddingBottom
      resizable
    >
      <ScrollView
        style={[styles.recurringInstallmentSheetInner, { backgroundColor: palette.fill }]}
        contentContainerStyle={styles.recurringInstallmentSheetScrollContent}
        showsVerticalScrollIndicator
        bounces={false}
        overScrollMode="never"
      >
        <View style={styles.sheetSection}>
          <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>소비 형태</SectionTitle>
          <View style={[styles.card, { backgroundColor: palette.staticWhite }]}>
            <View style={styles.recurringSection}>
              <View style={styles.recurringTitleRow}>
                <UiLineText style={[styles.switchLabel, { color: palette.text }]}>정기 지출 여부</UiLineText>
                <Switch
                  value={draft.isRecurring}
                  onValueChange={(isRecurring) =>
                    setDraft((prev) =>
                      isRecurring
                        ? { ...prev, isRecurring, isInstallment: false, recurringType: '매일' }
                        : { ...prev, isRecurring },
                    )
                  }
                />
              </View>
              <Text style={[styles.recurringCaption, { color: palette.textAssistive }]}>
                현재 월 기준 매달 같은 날에 자동 기록합니다.
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: palette.border }]} />

            <View style={styles.recurringSection}>
              <View style={styles.recurringTitleRow}>
                <UiLineText style={[styles.switchLabel, { color: palette.text }]}>할부 여부</UiLineText>
                <Switch
                  value={draft.isInstallment}
                  onValueChange={(isInstallment) =>
                    setDraft((prev) =>
                      isInstallment
                        ? {
                            ...prev,
                            isInstallment,
                            isRecurring: false,
                            totalMonths: Math.max(2, prev.totalMonths),
                          }
                        : { ...prev, isInstallment },
                    )
                  }
                />
              </View>
              <Text style={[styles.recurringCaption, { color: palette.textAssistive }]}>
                할부 기간동안 해당 소비금액을 자동 기록합니다.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sheetSection}>
          <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
            {draft.isInstallment ? '할부 기간' : '반복 기간'}
          </SectionTitle>
          <View style={styles.chipContainer}>
            {draft.isInstallment
              ? (isExpanded ? INSTALLMENT_MONTHS : INSTALLMENT_MONTHS.slice(0, 6)).map((months) => (
                  <Chip
                    key={months}
                    type="option"
                    label={`${months}개월`}
                    active={draft.totalMonths === months}
                    onPress={() => setDraft((prev) => ({ ...prev, totalMonths: months }))}
                    style={styles.periodChip}
                  />
                ))
              : (isExpanded ? RECURRING_PERIODS : RECURRING_PERIODS.slice(0, 6)).map((label) => (
                  <Chip
                    key={label}
                    type="option"
                    label={label}
                    active={draft.recurringType === label}
                    disabled={isOff}
                    onPress={() => {
                      if (isOff) return;
                      setDraft((prev) => ({
                        ...prev,
                        recurringType: label,
                        totalMonths: RECURRING_TYPE_MONTHS[label] ?? prev.totalMonths,
                        weekendOption: shouldIgnoreWeekendOptionForRecurringType(label)
                          ? 'weekend'
                          : prev.weekendOption,
                      }));
                    }}
                    style={styles.periodChip}
                  />
                ))}
          </View>
          <Accordion expanded={isExpanded} onToggle={setIsExpanded} disabled={isOff} />
        </View>

        <View style={styles.sheetSection}>
          <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
            기록일이 주말인 경우
          </SectionTitle>
          <View style={[styles.card, { backgroundColor: palette.staticWhite }]}>
            {WEEKEND_OPTIONS.map((option, index) => (
              <View key={option.value}>
                {index > 0 ? <View style={[styles.divider, { backgroundColor: palette.border }]} /> : null}
                <Pressable style={styles.radioRow} onPress={() => selectWeekend(option.value)} disabled={isOff}>
                  <UiLineText style={[styles.weekendOptionText, { color: palette.text }]}>
                    {option.label}
                  </UiLineText>
                  <Radio
                    checked={draft.weekendOption === option.value}
                    onPress={() => selectWeekend(option.value)}
                    label={false}
                    disabled={isOff || ignoresWeekend}
                  />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={{ height: insets.bottom }} />
    </ModalBottomsheet>
  );
}

const styles = StyleSheet.create({
  recurringInstallmentSheetInner: {
    flex: 1,
    minHeight: 0,
    backgroundColor: 'transparent',
  },
  recurringInstallmentSheetScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32, // 하단 여백 32 (스크롤 가능한 영역 내에서 보이도록)
    gap: 24,
  },
  sheetSection: {
    gap: 8,
  },
  sectionTitle: {},
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  recurringSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  recurringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  switchLabel: {},
  recurringCaption: {
    ...typography.body02.regular,
    marginTop: 0,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  periodChip: {
    marginBottom: 0,
    width: '31.5%', // 3열로 균일하게 배치 (100% - 16*2 padding - 8*2 gap) / 3 ≈ 31.5%
    height: 40, // Chip 높이 40으로 고정
  },
  radioRow: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weekendOptionText: {},
});
