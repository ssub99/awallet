/**
 * 반복 기록 편집·복사 폼. UI는 소비 기록 화면과 같지만 코드는 따로 둔다.
 * - edit: 금액·메모·결제 유형만 바꾸고, 바꾼 항목을 그룹 전체에 적용. 카테고리·날짜·반복 옵션은 잠금.
 * - copy: 첫 기록의 원본 값을 채우고 오늘부터 새 기록을 만든다.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { RecurringOptionSheet, type RepeatOptions } from '@/components/recurring/recurring-option-sheet';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { CustomKeypad, getKeypadHeight, type CustomKeypadOperator, type ExpressionToken } from '@/components/ui/custom-keypad';
import { CustomKeypadOverlay, getCustomKeypadScrollPaddingBottom } from '@/components/ui/custom-keypad-overlay';
import { FieldInputText } from '@/components/ui/field-input-text';
import { Input } from '@/components/ui/input';
import { ModalBottomsheet, ModalBottomsheetBottomInset } from '@/components/ui/modal-bottomsheet';
import { ModalPopup } from '@/components/ui/modal-popup';
import { RecordDatePickerHost } from '@/components/ui/record-date-picker-sheet';
import { SectionTitle } from '@/components/ui/section-title';
import { Tag } from '@/components/ui/tag';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { typographyLayoutFieldLineRowHeight } from '@/constants/typography';
import { useAppData } from '@/contexts/app-data-context';
import { useLoading } from '@/contexts/loading-context';
import { useToast } from '@/contexts/toast-context';
import { calendarRefreshEvent } from '@/hooks/calendar-events';
import { useAndroidKeypadBackDismiss } from '@/hooks/use-android-keypad-back-dismiss';
import { useCategoryEmojiMap } from '@/hooks/use-category-emoji-map';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { loadMonthStartDay } from '@/hooks/use-month-start';
import { useRecordFormMemoKeyboard } from '@/hooks/use-record-form-memo-keyboard';
import { triggerChallengeNotifications } from '@/utils/challenge-utils';
import { formatRecurringSummaryLabel, getRecurringWeekendOptionDisplayLabel } from '@/utils/expense-calculations';
import {
  createExpensesBatch,
  getAllExpenses,
  replaceAllExpenses,
  type PaymentMethod,
} from '@/utils/expenses';
import { generateGroupId, generateRecordId } from '@/utils/id-generator';
import { rescheduleDailyReminderIfNeeded } from '@/utils/notification-scheduler';
import { initializePaymentSubtypes, type PaymentSubtype } from '@/utils/payment-types';
import { rebuildCalendarDataFromStores } from '@/utils/rebuild-calendar-data';
import {
  applyRecurringChanges,
  buildNewSeries,
  buildRecurringSeed,
  getGroupRecords,
  type RecurringChanges,
  type RecurringGroupKind,
  type RecurringSeed,
} from '@/utils/recurring-record-series';
import { refreshWidgetWithCurrentMonth } from '@/utils/widget-data-sync';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const LOCKED_MESSAGE = '변경할 수 없습니다. 새로 생성해 주세요.';
const COPY_SUCCESS_MESSAGE = '반복 기록이 정상적으로 복사 되었습니다.';
const MAX_AMOUNT = 1000000000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const OPERATOR_SYMBOLS: Partial<Record<CustomKeypadOperator, string>> = {
  add: '+',
  sub: '-',
  mul: '×',
  div: '÷',
};

type PaymentItem = Pick<PaymentSubtype, 'id' | 'type' | 'label' | 'description' | 'color'>;

function formatToday(): string {
  const today = new Date();
  return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
}

function formatDateWithWeekday(date: string): string {
  const [year, month, day] = date.split('.').map((part) => parseInt(part, 10));
  if (!year || !month || !day) return date;
  return `${date}(${WEEKDAYS[new Date(year, month - 1, day).getDay()]})`;
}

export function RecurringRecordForm({ mode }: { mode: 'edit' | 'copy' }) {
  const isEdit = mode === 'edit';
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const keypadHeight = getKeypadHeight(windowWidth);
  const { isLoading, setLoading } = useLoading();
  const { showToast } = useToast();
  const { refresh } = useAppData();
  const categoryEmojiMap = useCategoryEmojiMap();
  const params = useLocalSearchParams<{ kind?: string; groupId?: string }>();
  const kind: RecurringGroupKind = params.kind === 'installment' ? 'installment' : 'recurring';
  const groupId = params.groupId ?? '';

  /** 화면에 처음 채운 값 — 편집에서 바꾼 항목을 가리는 기준 */
  const [seed, setSeed] = useState<RecurringSeed | null>(null);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(formatToday);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('credit');
  const [subtypeId, setSubtypeId] = useState('');
  /** 사용자가 결제 유형을 직접 골랐는지 — 삭제된 유형의 자동 대체는 변경으로 보지 않는다 */
  const [isPaymentPicked, setIsPaymentPicked] = useState(false);
  const [repeat, setRepeat] = useState<RepeatOptions>({
    isRecurring: false,
    isInstallment: false,
    recurringType: '매월',
    totalMonths: 2,
    weekendOption: 'weekend',
  });

  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([]);
  const [showPaymentSheet, setShowPaymentSheet] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'credit' | 'debit'>('credit');
  const [showRepeatSheet, setShowRepeatSheet] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => formatToday().replace(/\./g, '-'));
  const [monthStartDay, setMonthStartDay] = useState(1);
  const [showAmountAlert, setShowAmountAlert] = useState(false);
  const [showNoChanges, setShowNoChanges] = useState(false);
  const savingRef = useRef(false);

  // 대상 그룹의 원본 값을 한 번 불러와 채운다
  useEffect(() => {
    let isActive = true;
    const load = async () => {
      const records = getGroupRecords(await getAllExpenses(), { kind, groupId });
      if (!isActive) return;
      if (records.length === 0) {
        Alert.alert('오류', '반복 기록을 불러오지 못했습니다.');
        router.back();
        return;
      }
      const next = buildRecurringSeed(records, kind);
      setSeed(next);
      setCategory(next.category);
      setAmount(next.amount > 0 ? next.amount.toLocaleString() : '');
      setMemo(next.memo);
      setPaymentMethod(next.paymentMethod);
      setSubtypeId(next.paymentSubtypeId ?? '');
      if (isEdit) setDate(next.startDate);
      setRepeat({
        isRecurring: kind === 'recurring',
        isInstallment: kind === 'installment',
        recurringType: next.recurringType,
        totalMonths: kind === 'installment' ? next.installmentMonths : 2,
        weekendOption: next.weekendOption,
      });
    };
    void load();
    void loadMonthStartDay().then((day) => {
      if (isActive) setMonthStartDay(day);
    });
    return () => {
      isActive = false;
    };
  }, [groupId, isEdit, kind, router]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const load = async () => {
        try {
          const items = await initializePaymentSubtypes();
          if (isActive) setPaymentItems(items);
          // 카테고리 선택 화면에서 돌아온 값
          const selected = await AsyncStorage.getItem('selectedCategory');
          if (selected) {
            await AsyncStorage.removeItem('selectedCategory');
            if (isActive) setCategory(selected);
          }
        } catch (error) {
          console.error('[recurring-record-form] load failed:', error);
        }
      };
      void load();
      return () => {
        isActive = false;
      };
    }, []),
  );

  // 결제 유형과 맞지 않는(삭제된) 세부 유형은 그 유형의 첫 항목으로 대신한다
  const selectedSubtype =
    paymentItems.find((item) => item.id === subtypeId && item.type === paymentMethod) ??
    paymentItems.find((item) => item.type === paymentMethod);

  const paymentDisplay =
    paymentMethod === 'cash'
      ? { label: '현금', emoji: '💰', color: atomicColors.blue[500], showDot: false }
      : {
          label: selectedSubtype?.label ?? (paymentMethod === 'debit' ? '체크카드' : '신용카드'),
          emoji: undefined,
          color:
            selectedSubtype?.color ??
            (paymentMethod === 'debit' ? atomicColors.green[500] : atomicColors.blue[500]),
          showDot: true,
        };

  const openPaymentSheet = () => {
    handleKeypadDismiss();
    setPaymentFilter(paymentMethod === 'debit' ? 'debit' : 'credit');
    setShowPaymentSheet(true);
  };

  const selectPayment = (method: PaymentMethod, nextSubtypeId?: string) => {
    setPaymentMethod(method);
    if (nextSubtypeId) setSubtypeId(nextSubtypeId);
    setIsPaymentPicked(true);
    setShowPaymentSheet(false);
  };

  // ── 금액 키패드 ──
  const [amountExpression, setAmountExpression] = useState<ExpressionToken[]>([]);
  const [isKeypadVisible, setIsKeypadVisible] = useState(false);
  const [isKeypadMounted, setIsKeypadMounted] = useState(false);
  const [keypadTranslateY] = useState(() => new Animated.Value(keypadHeight));

  const handleAmountChange = (text: string) => {
    const digits = text.replace(/,/g, '');
    if (!digits) {
      setAmount('');
      return;
    }
    setAmount(Math.min(parseInt(digits, 10), MAX_AMOUNT).toLocaleString());
  };

  useEffect(() => {
    Animated.timing(keypadTranslateY, {
      toValue: isKeypadVisible ? 0 : keypadHeight,
      duration: 300,
      easing: isKeypadVisible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isKeypadVisible) setIsKeypadMounted(false);
    });
  }, [isKeypadVisible, keypadHeight, keypadTranslateY]);

  const handleKeypadDismiss = () => {
    setIsKeypadVisible(false);
    setAmountExpression([]);
  };

  const amountTokens: ExpressionToken[] =
    amountExpression.length > 0
      ? amountExpression
      : [{ type: 'number', value: amount.replace(/,/g, '') || '0' }];

  // ── 메모 키보드 ──
  const scrollViewRef = useRef<ScrollViewInstance>(null);
  const amountSectionYRef = useRef(0);
  const memoSectionYRef = useRef(0);
  const memoSectionHeightRef = useRef(0);
  const {
    memoInputRef,
    keyboardPaddingBottom,
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    blurMemoInput,
    handleMemoFocus: scrollMemoOnFocus,
    handleMemoBlur,
    onMemoScroll,
    memoPointerHandlers,
  } = useRecordFormMemoKeyboard({
    scrollViewRef,
    memoSectionYRef,
    memoSectionHeightRef,
    windowHeight,
    safeAreaBottom: insets.bottom,
  });

  useAndroidKeypadBackDismiss(isKeypadVisible, handleKeypadDismiss, {
    isMemoSystemKeyboardOpen,
    isMemoFocusedRef,
    onDismissMemoInput: blurMemoInput,
  });

  const openKeypad = () => {
    blurMemoInput();
    setIsKeypadMounted(true);
    setIsKeypadVisible(true);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(0, amountSectionYRef.current - Dimensions.get('window').height * 0.4),
        animated: true,
      });
    }, 350);
  };

  // ── 저장 ──
  const finishSave = async (savedCategory: string, savedDate: string) => {
    await rebuildCalendarDataFromStores();
    await refresh();
    calendarRefreshEvent.emit();
    await refreshWidgetWithCurrentMonth().catch(() => {});
    await triggerChallengeNotifications(
      savedCategory,
      new Date(savedDate.replace(/\./g, '-')),
    ).catch((error) => {
      console.error('[recurring-record-form] challenge notification failed:', error);
    });
    rescheduleDailyReminderIfNeeded().catch(() => {});
    router.back();
  };

  const handleSave = async () => {
    if (!seed || savingRef.current) return;
    handleKeypadDismiss();
    Keyboard.dismiss();
    const amountValue = Number(amount.replace(/,/g, '')) || 0;
    const subtype =
      paymentMethod === 'cash' ? undefined : (selectedSubtype?.id ?? (subtypeId || undefined));

    const changes: RecurringChanges = {};
    if (isEdit) {
      if (memo !== seed.memo) changes.memo = memo;
      if (amountValue !== seed.amount) changes.amount = amountValue;
      if (
        isPaymentPicked &&
        (paymentMethod !== seed.paymentMethod || subtype !== seed.paymentSubtypeId)
      ) {
        changes.payment = { paymentMethod, paymentSubtypeId: subtype };
      }
    }
    // 원래 0원(전부 환불 등)인 편집은 금액을 건드리지 않으면 저장할 수 있다
    if (amountValue <= 0 && (!isEdit || changes.amount !== undefined)) {
      setShowAmountAlert(true);
      return;
    }
    if (isEdit && Object.keys(changes).length === 0) {
      setShowNoChanges(true);
      return;
    }

    savingRef.current = true;
    setLoading(true);
    try {
      if (isEdit) {
        const expenses = await getAllExpenses();
        await replaceAllExpenses(
          applyRecurringChanges(expenses, { kind, groupId }, changes, new Date().toISOString()),
        );
        await finishSave(category, seed.startDate);
      } else {
        const records = buildNewSeries(
          { ...repeat, date, category, amount: amountValue, memo, paymentMethod, paymentSubtypeId: subtype },
          {
            groupId: generateGroupId(repeat.isInstallment ? 'installment' : 'recurring'),
            createRecordId: generateRecordId,
            timestamp: Date.now(),
          },
        );
        await createExpensesBatch(records);
        await finishSave(category, records[0].date);
        showToast(COPY_SUCCESS_MESSAGE);
      }
    } catch (error) {
      console.error('[recurring-record-form] save failed:', error);
      Alert.alert('오류', '저장에 실패 했습니다. 다시 시도해 주세요.');
    } finally {
      savingRef.current = false;
      setLoading(false);
    }
  };

  const showLockedToast = () => showToast(LOCKED_MESSAGE);

  const repeatLabel = (() => {
    const weekendText = getRecurringWeekendOptionDisplayLabel(
      repeat.isRecurring ? repeat.recurringType : undefined,
      repeat.weekendOption,
      { isRecurring: repeat.isRecurring },
    );
    if (repeat.isRecurring) {
      return formatRecurringSummaryLabel('정기지출', repeat.recurringType, weekendText);
    }
    if (repeat.isInstallment) {
      return formatRecurringSummaryLabel('할부', `${repeat.totalMonths}개월`, weekendText);
    }
    return '반복/할부 설정';
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.staticWhite }]} edges={['top']}>
      <TopNavigation
        type="sub"
        title={isEdit ? '반복 기록 편집' : '반복 기록 복사'}
        showLeftIcon
        onLeftIconPress={() => router.back()}
      />

      <View style={[styles.content, { backgroundColor: palette.fill }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: isMemoSystemKeyboardOpen
                ? keyboardPaddingBottom
                : isKeypadVisible
                  ? getCustomKeypadScrollPaddingBottom(keypadHeight, insets.bottom)
                  : 16,
            },
          ]}
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
          onScroll={onMemoScroll}
          scrollEventThrottle={16}
        >
          {/* 카테고리 */}
          <View style={styles.section}>
            <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
              카테고리 <Text style={{ color: palette.statusNegative }}>*</Text>
            </SectionTitle>
            <Input
              value={category ? `${categoryEmojiMap[category] ?? ''} ${category}` : ''}
              placeholder="카테고리 선택"
              showRightArrow
              buttonMode
              disabled={isEdit}
              onPress={() => {
                if (isEdit) {
                  showLockedToast();
                  return;
                }
                handleKeypadDismiss();
                Keyboard.dismiss();
                router.push({
                  pathname: '/expense-category',
                  params: { selectedCategory: category, fromEdit: 'true' },
                });
              }}
              style={styles.categoryInput}
            />
          </View>

          {/* 결제 유형 - 편집은 본문, 복사는 하단 고정 */}
          {isEdit ? (
            <View style={styles.section}>
              <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
                결제 유형 <Text style={{ color: palette.statusNegative }}>*</Text>
              </SectionTitle>
              <Input
                value={paymentDisplay.label}
                buttonMode
                sortation
                showSortationDot={paymentDisplay.showDot}
                sortationColor={paymentDisplay.color}
                sortationEmoji={paymentDisplay.emoji}
                showRightArrow
                rightIcon="arrowDown"
                onPress={openPaymentSheet}
              />
            </View>
          ) : null}

          {/* 날짜 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
                날짜 <Text style={{ color: palette.statusNegative }}>*</Text>
              </SectionTitle>
              <Pressable
                style={styles.recurringInstallmentButton}
                onPress={() => {
                  if (isEdit) {
                    showLockedToast();
                    return;
                  }
                  handleKeypadDismiss();
                  Keyboard.dismiss();
                  setShowRepeatSheet(true);
                }}
              >
                <UiLineText
                  style={[styles.recurringInstallmentButtonText, { color: palette.textAssistive }]}
                >
                  {repeatLabel}
                </UiLineText>
              </Pressable>
            </View>
            <View>
              <Input
                variant="line"
                icon="calendarMonth"
                buttonMode
                value={formatDateWithWeekday(date)}
                disabled={isEdit}
                placeholder="날짜 선택"
                onPress={() => {
                  handleKeypadDismiss();
                  Keyboard.dismiss();
                  setPickerDate(date.replace(/\./g, '-'));
                  setShowDatePicker(true);
                }}
              />
              {/* 비활성 입력은 눌림을 받지 않으므로 위에 덮어 안내한다 */}
              {isEdit ? (
                <Pressable
                  style={styles.lockedOverlay}
                  onPress={showLockedToast}
                  accessibilityRole="button"
                  accessibilityLabel="날짜 변경 불가"
                />
              ) : null}
            </View>
          </View>

          {/* 금액 */}
          <View
            style={styles.section}
            onLayout={(event) => {
              amountSectionYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.sectionHeader}>
              <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
                금액 <Text style={{ color: palette.statusNegative }}>*</Text>
              </SectionTitle>
            </View>
            <Input
              variant="line"
              inputType="number"
              unit="원"
              value={amount || '0'}
              valueRenderer={
                <ScrollView
                  horizontal
                  scrollEnabled={false}
                  pointerEvents="none"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.amountExpression}
                >
                  {amountTokens.map((token, index) =>
                    token.type === 'number' ? (
                      <FieldInputText
                        variant="number"
                        key={`num-${index}`}
                        style={[styles.amountExpressionText, { color: palette.text }]}
                      >
                        {Number(token.value.replace(/,/g, '')).toLocaleString()}
                      </FieldInputText>
                    ) : (
                      <FieldInputText
                        variant="number"
                        key={`op-${index}`}
                        style={[styles.amountExpressionOperator, { color: palette.textNeutral }]}
                        accessibilityLabel="연산자"
                      >
                        {OPERATOR_SYMBOLS[token.value as CustomKeypadOperator] ?? ''}
                      </FieldInputText>
                    ),
                  )}
                </ScrollView>
              }
              onChangeText={handleAmountChange}
              placeholder="0"
              textAlign="right"
              editable={false}
              caretHidden
              onPress={openKeypad}
            />
          </View>

          {/* 메모 */}
          <View
            style={styles.section}
            onLayout={(event) => {
              memoSectionYRef.current = event.nativeEvent.layout.y;
              memoSectionHeightRef.current = event.nativeEvent.layout.height;
            }}
          >
            <SectionTitle style={[styles.sectionTitle, { color: palette.staticBlack }]}>
              메모
            </SectionTitle>
            <Input
              ref={memoInputRef}
              variant="area"
              value={memo}
              onChangeText={(text) => setMemo(text.replace(/[\r\n]/g, ''))}
              placeholder="메모를 입력해 주세요.(최대 20자)"
              maxLength={20}
              multiline
              onPressIn={() => {
                memoPointerHandlers.onPressIn();
                handleKeypadDismiss();
              }}
              onPressOut={memoPointerHandlers.onPressOut}
              onFocus={() => {
                handleKeypadDismiss();
                scrollMemoOnFocus();
              }}
              onBlur={handleMemoBlur}
              onSubmitEditing={() => Keyboard.dismiss()}
              blurOnSubmit={false}
            />
          </View>
        </ScrollView>
      </View>

      {!isEdit ? (
        <View style={[styles.paymentTypeStickyContainer, { backgroundColor: atomicColors.neutral[100] }]}>
          <View style={[styles.paymentTypeTopLine, { backgroundColor: palette.border }]} />
          <View style={styles.paymentTypeStickyContent}>
            <UiLineText
              variant="body01Bold"
              style={[styles.paymentTypeStickyLabel, { color: palette.textNeutral }]}
            >
              결제 유형
            </UiLineText>
            <View style={styles.paymentTypeStickyControls}>
              <Input
                value={paymentDisplay.label}
                buttonMode
                shortver
                sortation
                showSortationDot={paymentDisplay.showDot}
                sortationColor={paymentDisplay.color}
                sortationEmoji={paymentDisplay.emoji}
                showRightArrow
                rightIcon="arrowDown"
                onPress={openPaymentSheet}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.bottomButtonContainer,
          { backgroundColor: palette.staticWhite, paddingBottom: 16 + insets.bottom, paddingTop: 16 },
        ]}
      >
        <Button onPress={() => void handleSave()} loading={isLoading} disabled={isLoading || !seed}>
          {isEdit ? '저장' : '확인'}
        </Button>
      </View>

      {isKeypadMounted ? (
        <CustomKeypadOverlay>
          <Animated.View
            style={[styles.customKeypadContainer, { transform: [{ translateY: keypadTranslateY }] }]}
            pointerEvents="box-none"
          >
            <View style={styles.customKeypadContent} pointerEvents="auto">
              <CustomKeypad
                value={amount}
                onValueChange={handleAmountChange}
                onConfirm={(nextValue) => {
                  handleAmountChange(nextValue);
                  handleKeypadDismiss();
                }}
                onExpressionChange={setAmountExpression}
              />
            </View>
          </Animated.View>
        </CustomKeypadOverlay>
      ) : null}

      <RecordDatePickerHost
        open={showDatePicker}
        title="소비 기록일 선택"
        selectedDate={pickerDate}
        onSelectedDateChange={setPickerDate}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(isoDate) => {
          setDate(isoDate.replace(/-/g, '.'));
          setShowDatePicker(false);
        }}
        monthStartDay={monthStartDay}
      />

      {showPaymentSheet ? (
        <ModalBottomsheet
          visible
          title="결제 유형 선택"
          onClose={() => setShowPaymentSheet(false)}
          closeOnBackdrop
          style={{ height: windowHeight * 0.5 }}
          contentStyle={styles.paymentTypeSheetContent}
          noPaddingBottom
        >
          <View style={[styles.paymentTypeSheetBody, { backgroundColor: palette.fill }]}>
            <View style={styles.paymentTypeSheetFilterRow}>
              <View style={styles.paymentTypeSheetFilterChips}>
                <Chip label="신용카드" active={paymentFilter === 'credit'} onPress={() => setPaymentFilter('credit')} />
                <Chip label="체크카드" active={paymentFilter === 'debit'} onPress={() => setPaymentFilter('debit')} />
              </View>
              <Pressable style={styles.paymentTypeSheetCashButton} onPress={() => selectPayment('cash')}>
                <Text style={styles.paymentTypeSheetCashEmoji}>💰</Text>
                <UiLineText style={[styles.paymentTypeSheetCashText, { color: palette.textNeutral }]}>
                  현금 선택
                </UiLineText>
              </Pressable>
            </View>

            <View style={[styles.paymentTypeSheetList, { backgroundColor: palette.staticWhite }]}>
              <ScrollView
                style={styles.paymentTypeSheetListScroll}
                contentContainerStyle={styles.paymentTypeSheetListScrollContent}
                showsVerticalScrollIndicator
                bounces={false}
                overScrollMode="never"
              >
                {paymentItems
                  .filter((item) => item.type === paymentFilter)
                  .map((item, index, list) => (
                    <View key={item.id}>
                      <Pressable style={styles.paymentTypeSheetItem} onPress={() => selectPayment(item.type, item.id)}>
                        <View style={styles.paymentTypeSheetLeft}>
                          <View
                            style={[
                              styles.paymentTypeSheetIndicator,
                              { backgroundColor: item.color, borderColor: palette.border },
                            ]}
                          />
                          <View
                            style={[
                              styles.paymentTypeSheetTextBlock,
                              !item.description.trim() && styles.paymentTypeSheetTextBlockSingleLine,
                            ]}
                          >
                            <UiLineText
                              style={[styles.paymentTypeSheetTitle, { color: palette.text }]}
                              numberOfLines={1}
                            >
                              {item.label}
                            </UiLineText>
                            {item.description.trim() ? (
                              <Text
                                style={[styles.paymentTypeSheetSubtitle, { color: palette.textAssistive }]}
                                numberOfLines={1}
                              >
                                {item.description}
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        {index === 0 ? (
                          <View style={styles.paymentTypeSheetDefaultTagWrap}>
                            <Tag label="기본" status="normal" />
                          </View>
                        ) : null}
                      </Pressable>
                      {index < list.length - 1 ? (
                        <View style={[styles.paymentTypeSheetDivider, { backgroundColor: palette.border }]} />
                      ) : null}
                    </View>
                  ))}
              </ScrollView>
            </View>

            <View style={styles.paymentTypeSheetBottomGap} />
            <ModalBottomsheetBottomInset backgroundColor={palette.staticWhite} />
          </View>
        </ModalBottomsheet>
      ) : null}

      <RecurringOptionSheet
        visible={showRepeatSheet}
        value={repeat}
        palette={palette}
        onClose={() => setShowRepeatSheet(false)}
        onConfirm={(next) => {
          setRepeat(next);
          setShowRepeatSheet(false);
        }}
      />

      <ModalPopup visible={showAmountAlert} onConfirm={() => setShowAmountAlert(false)} confirmText="확인">
        <Text style={[styles.alertText, { color: palette.text }]}>금액을 입력해 주세요.</Text>
      </ModalPopup>

      <ModalPopup visible={showNoChanges} onConfirm={() => setShowNoChanges(false)} confirmText="확인">
        <Text style={[styles.alertText, { color: palette.text }]}>변경된 내용이 없습니다.</Text>
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: 0,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 8,
  },
  sectionTitle: {},
  categoryInput: {
    // Input 컴포넌트가 자체 스타일을 가지고 있으므로 추가 스타일 불필요
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recurringInstallmentButton: {
    paddingVertical: 0,
    paddingHorizontal: 4,
  },
  recurringInstallmentButtonText: {
    textDecorationLine: 'underline',
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  amountExpression: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minHeight: typographyLayoutFieldLineRowHeight,
  },
  amountExpressionText: {},
  amountExpressionOperator: {},
  paymentTypeStickyContainer: {
    paddingHorizontal: 16,
    height: 56,
    justifyContent: 'center',
  },
  paymentTypeTopLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  paymentTypeStickyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentTypeStickyLabel: {},
  paymentTypeStickyControls: {
    width: 200,
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  customKeypadContainer: {
    width: '100%',
  },
  customKeypadContent: {
    width: '100%',
  },
  paymentTypeSheetContent: {
    padding: 0,
  },
  paymentTypeSheetBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    flexDirection: 'column',
  },
  paymentTypeSheetFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 37,
  },
  paymentTypeSheetFilterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentTypeSheetCashButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  paymentTypeSheetCashEmoji: {
    ...typography.headline04.medium,
  },
  paymentTypeSheetCashText: {
    textDecorationLine: 'underline',
  },
  paymentTypeSheetList: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 16,
  },
  paymentTypeSheetListScroll: {
    flex: 1,
  },
  paymentTypeSheetListScrollContent: {
    flexGrow: 1,
  },
  paymentTypeSheetItem: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  paymentTypeSheetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  paymentTypeSheetIndicator: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  paymentTypeSheetTextBlock: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  paymentTypeSheetTextBlockSingleLine: {
    justifyContent: 'center',
  },
  paymentTypeSheetTitle: {},
  paymentTypeSheetSubtitle: {
    ...typography.body02.regular,
  },
  paymentTypeSheetDefaultTagWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentTypeSheetDivider: {
    height: 1,
    marginHorizontal: 16,
  },
  paymentTypeSheetBottomGap: {
    height: 16,
  },
  alertText: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
});
