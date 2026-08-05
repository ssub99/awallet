/**
 * Recurring / Installment record management screen
 * Matches Figma: [Awallet]Mypage_repeat-setting
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { ListEmptyPlaceholder } from '@/components/ui/list-empty-placeholder';
import { ModalPopup } from '@/components/ui/modal-popup';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { rebuildCalendarDataFromStores } from '@/utils/rebuild-calendar-data';
import {
  deleteRecurringInstallmentGroup,
  hasAnyRecurringInstallmentGroups,
  listRecurringInstallmentGroups,
  type RecurringInstallmentGroupSummary,
} from '@/utils/recurring-record-management';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DELETE_SUCCESS_TOAST_MESSAGE = '반복 기록이 성공적으로 삭제 되었습니다.';
const GLOBAL_EMPTY_MESSAGE = '생성된 반복 기록이 존재하지 않습니다.';
const SWIPE_THRESHOLD = 50;
const YEAR_CARD_HEIGHT = 56;
const YEAR_CARD_MARGIN_BOTTOM = 16;
const EMPTY_STATE_VERTICAL_OFFSET = -((YEAR_CARD_HEIGHT + YEAR_CARD_MARGIN_BOTTOM) / 2);

function buildYearOptions(centerYear: number) {
  return Array.from({ length: 21 }, (_, index) => {
    const year = centerYear - 10 + index;
    return { label: `${year}년`, value: year };
  });
}

function RecurringGroupCard({
  item,
  colors,
  onDeletePress,
}: {
  item: RecurringInstallmentGroupSummary;
  colors: typeof themeColors.light;
  onDeletePress: (item: RecurringInstallmentGroupSummary) => void;
}) {
  const hasMemo = item.memo.trim().length > 0;

  return (
    <View style={styles.cardRow}>
      <Pressable
        style={[styles.deleteColumn, { backgroundColor: atomicColors.red[50] }]}
        onPress={() => onDeletePress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${item.categoryDisplay} 반복 기록 삭제`}
      >
        <Icon name="delete" variant="solid" size={24} color={colors.statusNegative} />
      </Pressable>

      <View style={[styles.infoCard, { backgroundColor: colors.background }]}>
        <View style={styles.infoHeader}>
          <UiLineText variant="body01Bold" style={[styles.categoryText, { color: colors.text }]} numberOfLines={1}>
            {item.categoryDisplay}
          </UiLineText>
          <UiLineText variant="body01Bold" style={[styles.amountText, { color: colors.text }]}>
            {item.amount.toLocaleString('ko-KR')}원
          </UiLineText>
        </View>

        {hasMemo ? (
          <Text style={[styles.memoText, { color: colors.textAssistive }]} numberOfLines={1}>
            {item.memo}
          </Text>
        ) : null}
        <View style={[styles.infoDivider, { backgroundColor: colors.border }]} />

        <View style={styles.infoBody}>
          <DetailRow label="반복설정" value={item.repeatSettingLabel} colors={colors} />
          <DetailRow label="시작일" value={item.startDate} colors={colors} />
          <DetailRow label="종료일" value={item.endDate} colors={colors} />
        </View>
      </View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: typeof themeColors.light;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.textAssistive }]}>{label}</Text>
      <Text
        style={[styles.detailValue, { color: colors.textNeutral }]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {value}
      </Text>
    </View>
  );
}

export default function RecurringRecordManagementScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { refresh } = useAppData();
  const { setLoading } = useLoading();
  const { showToast } = useToast();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const yearOptions = useMemo(() => buildYearOptions(currentYear), [currentYear]);
  const minYear = yearOptions[0]?.value ?? currentYear;
  const maxYear = yearOptions[yearOptions.length - 1]?.value ?? currentYear;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [isDataReady, setIsDataReady] = useState(false);
  const [hasAnyGroups, setHasAnyGroups] = useState(false);
  const [groups, setGroups] = useState<RecurringInstallmentGroupSummary[]>([]);
  const [pendingDelete, setPendingDelete] = useState<RecurringInstallmentGroupSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;

  const loadGroupsForYear = useCallback(
    async (year: number) => {
      setIsDataReady(false);
      setLoading(true);
      try {
        const nextGroups = await listRecurringInstallmentGroups(year);
        setGroups(nextGroups);
      } catch (error) {
        console.error('[recurring-record-management] load failed:', error);
        Alert.alert('오류', '반복 기록을 불러오지 못했습니다.');
      } finally {
        setIsDataReady(true);
        setLoading(false);
      }
    },
    [setLoading],
  );

  const loadScreen = useCallback(async () => {
    setIsDataReady(false);
    setLoading(true);
    try {
      const [anyGroups, nextGroups] = await Promise.all([
        hasAnyRecurringInstallmentGroups(),
        listRecurringInstallmentGroups(selectedYear),
      ]);
      setHasAnyGroups(anyGroups);
      setGroups(nextGroups);
    } catch (error) {
      console.error('[recurring-record-management] reload failed:', error);
      setHasAnyGroups(false);
      setGroups([]);
    } finally {
      setIsDataReady(true);
      setLoading(false);
    }
  }, [selectedYear, setLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadScreen();
    }, [loadScreen]),
  );

  useEffect(() => {
    if (!isDataReady) {
      contentOpacity.setValue(0);
      return;
    }

    contentOpacity.setValue(0);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [contentOpacity, isDataReady]);

  const canGoPrevYear = selectedYear > minYear;
  const canGoNextYear = selectedYear < maxYear;

  const applyYear = useCallback(
    (year: number) => {
      const clampedYear = Math.min(maxYear, Math.max(minYear, year));
      if (clampedYear === selectedYear) {
        return;
      }
      setSelectedYear(clampedYear);
      void loadGroupsForYear(clampedYear);
    },
    [loadGroupsForYear, maxYear, minYear, selectedYear],
  );

  const changeYearBy = useCallback(
    (delta: number) => {
      const next = selectedYear + delta;
      if (next < minYear || next > maxYear) {
        return;
      }
      applyYear(next);
    },
    [applyYear, maxYear, minYear, selectedYear],
  );

  const handlePrevYear = useCallback(() => {
    if (!canGoPrevYear) {
      return;
    }
    changeYearBy(-1);
  }, [canGoPrevYear, changeYearBy]);

  const handleNextYear = useCallback(() => {
    if (!canGoNextYear) {
      return;
    }
    changeYearBy(1);
  }, [canGoNextYear, changeYearBy]);

  const handlePrevYearRef = useRef(handlePrevYear);
  const handleNextYearRef = useRef(handleNextYear);
  handlePrevYearRef.current = handlePrevYear;
  handleNextYearRef.current = handleNextYear;

  const handleYearPickerChange = useCallback(
    (year: number) => {
      applyYear(year);
    },
    [applyYear],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (
        _evt: GestureResponderEvent,
        gestureState: PanResponderGestureState,
      ) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy);
      },
      onPanResponderRelease: (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const { dx } = gestureState;

        if (dx <= -SWIPE_THRESHOLD) {
          handleNextYearRef.current();
        } else if (dx >= SWIPE_THRESHOLD) {
          handlePrevYearRef.current();
        }
      },
    }),
  ).current;

  const listKey = useMemo(
    () => `${selectedYear}:${groups.map((group) => `${group.kind}:${group.groupId}`).join('|')}`,
    [groups, selectedYear],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setLoading(true);
    try {
      await deleteRecurringInstallmentGroup(pendingDelete);
      await rebuildCalendarDataFromStores();
      await refresh();
      calendarRefreshEvent.emit();
      setPendingDelete(null);
      showToast(DELETE_SUCCESS_TOAST_MESSAGE);
      const anyGroups = await hasAnyRecurringInstallmentGroups();
      setHasAnyGroups(anyGroups);
      await loadGroupsForYear(selectedYear);
    } catch (error) {
      console.error('[recurring-record-management] delete failed:', error);
      Alert.alert('오류', '삭제에 실패 했습니다. 다시 시도해 주세요.');
    } finally {
      setIsDeleting(false);
      setLoading(false);
    }
  }, [isDeleting, loadGroupsForYear, pendingDelete, refresh, selectedYear, setLoading, showToast]);

  const showYearList = isDataReady && hasAnyGroups && groups.length > 0;
  const showEmptyState = isDataReady && groups.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      <TopNavigation
        type="sub"
        title="반복 기록 관리"
        showLeftIcon
        onLeftIconPress={() => router.back()}
      />

      <View
        style={[styles.content, { backgroundColor: colors.fill }]}
        {...panResponder.panHandlers}
      >
        <View style={[styles.yearCard, { backgroundColor: colors.background }]}>
          <Pressable
            style={styles.yearArrowButton}
            onPress={handlePrevYear}
            disabled={!canGoPrevYear}
            accessibilityRole="button"
            accessibilityLabel="이전 년도"
            accessibilityState={{ disabled: !canGoPrevYear }}
          >
            <Icon
              name="arrowLeft"
              variant="solid"
              size={24}
              color={canGoPrevYear ? colors.text : colors.textDisabled}
            />
          </Pressable>

          <Pressable
            onPress={() => setShowYearPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="년도 선택"
          >
            <UiLineText variant="body01Bold" style={[styles.yearText, { color: colors.text }]}>
              {selectedYear}년
            </UiLineText>
          </Pressable>

          <Pressable
            style={styles.yearArrowButton}
            onPress={handleNextYear}
            disabled={!canGoNextYear}
            accessibilityRole="button"
            accessibilityLabel="다음 년도"
            accessibilityState={{ disabled: !canGoNextYear }}
          >
            <Icon
              name="arrowRight"
              variant="solid"
              size={24}
              color={canGoNextYear ? colors.text : colors.textDisabled}
            />
          </Pressable>
        </View>

        <Animated.View style={[styles.bodyArea, { opacity: contentOpacity }]}>
          {showEmptyState ? (
            <ListEmptyPlaceholder
              message={GLOBAL_EMPTY_MESSAGE}
              verticalOffset={EMPTY_STATE_VERTICAL_OFFSET}
            />
          ) : showYearList ? (
            <FlatList
              key={listKey}
              data={groups}
              keyExtractor={(item) => `${item.kind}:${item.groupId}`}
              renderItem={({ item }) => (
                <RecurringGroupCard item={item} colors={colors} onDeletePress={setPendingDelete} />
              )}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
              showsVerticalScrollIndicator={false}
              bounces={false}
              overScrollMode="never"
            />
          ) : null}
        </Animated.View>
      </View>

      <DatePicker
        visible={showYearPicker}
        onClose={() => setShowYearPicker(false)}
        title="년도 선택"
        yearOptions={yearOptions}
        selectedYear={selectedYear}
        onYearChange={handleYearPickerChange}
      />

      <ModalPopup
        visible={pendingDelete !== null}
        title="반복 기록 삭제 안내"
        confirmText="확인"
        cancelText="취소"
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => {
          if (!isDeleting) {
            setPendingDelete(null);
          }
        }}
        confirmDisabled={isDeleting}
        closeOnBackdrop={!isDeleting}
      >
        <Text style={[styles.deleteConfirmText, { color: colors.textNeutral }]}>
          {pendingDelete ? (
            <>
              <UiLineText variant="body01Bold">{pendingDelete.categoryDisplay}</UiLineText>
              {'에\n포함된 반복 기록은 전부 삭제됩니다.\n삭제를 진행하시겠어요?'}
            </>
          ) : null}
        </Text>
      </ModalPopup>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
  },
  yearCard: {
    height: YEAR_CARD_HEIGHT,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: YEAR_CARD_MARGIN_BOTTOM,
  },
  yearArrowButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: {
    
  },
  bodyArea: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    paddingBottom: 8,
  },
  listSeparator: {
    height: 8,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  deleteColumn: {
    width: 57,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCard: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 151,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  memoText: {
    ...typography.body02.regular,
  },
  infoDivider: {
    height: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  categoryText: {
    flex: 1,
  },
  amountText: {
    
  },
  infoBody: {
    gap: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 21,
  },
  detailLabel: {
    ...typography.body02.regular,
    width: 49,
  },
  detailValue: {
    ...typography.body02.regular,
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  deleteConfirmText: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
