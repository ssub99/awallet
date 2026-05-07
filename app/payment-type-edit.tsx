import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Radio } from '@/components/ui/radio';
import { AtomicColors } from '@/constants/atomic-colors';
import { Colors, Typography } from '@/constants/theme';
import { useToast } from '@/contexts/toast-context';
import { getAllExpenses } from '@/utils/expenses';
import {
  getDefaultSubtypeIdByMethod,
  initializePaymentSubtypes,
  savePaymentSubtypes,
  type PaymentSubtype,
} from '@/utils/payment-types';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Keyboard, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ColorPicker, { HueSlider, Panel1 } from 'reanimated-color-picker';

export default function PaymentTypeEditScreen() {
  const COLOR_PICKER_PREWARM_MS = 220;
  const colors = Colors.light;
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();

  const subtypeId = params.id ?? '';

  const [paymentSubtypes, setPaymentSubtypes] = useState<PaymentSubtype[]>([]);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>('#3664CE');
  const [isColorPickerMounted, setIsColorPickerMounted] = useState(false);
  const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  const [isColorPickerReady, setIsColorPickerReady] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteBlockedAlert, setShowDeleteBlockedAlert] = useState(false);
  const colorPickerOpacity = useRef(new Animated.Value(0)).current;
  const colorPickerScale = useRef(new Animated.Value(0.94)).current;
  const openDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const descriptionSectionYRef = useRef(0);

  const currentSubtype = useMemo(
    () => paymentSubtypes.find((s) => s.id === subtypeId),
    [paymentSubtypes, subtypeId]
  );
  const isCurrentDefaultSubtype = useMemo(() => {
    if (!currentSubtype) return false;
    const defaultId = getDefaultSubtypeIdByMethod(currentSubtype.type, paymentSubtypes);
    return currentSubtype.id === defaultId;
  }, [currentSubtype, paymentSubtypes]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const loaded = await initializePaymentSubtypes();
      if (!active) return;
      setPaymentSubtypes(loaded);

      const found = loaded.find((s) => s.id === subtypeId);
      if (found) {
        setLabel(found.label);
        setDescription(found.description);
        setColor(found.color);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [subtypeId]);

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleSave = useCallback(async () => {
    const trimmedLabel = label.trim();
    const trimmedDescription = description.trim();

    if (!trimmedLabel) {
      showToast('결제 유형 이름을 입력해주세요.');
      return;
    }
    if (trimmedLabel.length > 10) {
      showToast('결제 유형 이름은 10자 이하로 입력해주세요.');
      return;
    }
    if (trimmedDescription.length > 20) {
      showToast('설명은 20자 이하로 입력해주세요.');
      return;
    }

    if (!currentSubtype) {
      showToast('결제 유형 정보를 불러오지 못했습니다.');
      return;
    }

    // 동일 type 내 라벨 중복 방지 (자기 자신 제외)
    const isDuplicate = paymentSubtypes.some(
      (s) => s.type === currentSubtype.type && s.label === trimmedLabel && s.id !== currentSubtype.id
    );
    if (isDuplicate) {
      showToast('이미 존재하는 결제 유형 이름입니다.');
      return;
    }

    const next = paymentSubtypes.map((s) =>
      s.id === currentSubtype.id
        ? {
            ...s,
            label: trimmedLabel,
            description: trimmedDescription,
            color,
          }
        : s
    );

    try {
      await savePaymentSubtypes(next);
      setPaymentSubtypes(next);
      router.back();
    } catch (error) {
      console.error('결제 유형 저장 실패:', error);
      showToast('결제 유형 저장에 실패했습니다.');
    }
  }, [color, currentSubtype, description, label, paymentSubtypes, router, showToast]);

  const openColorPicker = useCallback(() => {
    Keyboard.dismiss();
    openDelayTimeoutRef.current && clearTimeout(openDelayTimeoutRef.current);
    openDelayTimeoutRef.current = null;
    setIsColorPickerMounted(true);
    setIsColorPickerReady(true);
    setIsColorPickerVisible(false);
    colorPickerOpacity.setValue(0);
    colorPickerScale.setValue(0.94);
    const keyboardCloseDelay = keyboardHeight > 0 ? 220 : 0;
    openDelayTimeoutRef.current = setTimeout(() => {
      setIsColorPickerVisible(true);
      Animated.parallel([
        Animated.timing(colorPickerOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
        Animated.timing(colorPickerScale, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start();
    }, COLOR_PICKER_PREWARM_MS + keyboardCloseDelay);
  }, [COLOR_PICKER_PREWARM_MS, colorPickerOpacity, colorPickerScale, keyboardHeight]);

  const closeColorPicker = useCallback(() => {
    openDelayTimeoutRef.current && clearTimeout(openDelayTimeoutRef.current);
    openDelayTimeoutRef.current = null;
    if (!isColorPickerVisible) {
      setIsColorPickerMounted(false);
      setIsColorPickerReady(false);
      return;
    }
    setIsColorPickerVisible(false);
    Animated.parallel([
      Animated.timing(colorPickerOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(colorPickerScale, {
        toValue: 0.94,
        duration: 100,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setIsColorPickerMounted(false);
        setIsColorPickerReady(false);
      }
    });
  }, [colorPickerOpacity, colorPickerScale, isColorPickerVisible]);

  const handleToggleColorPicker = useCallback(() => {
    if (isColorPickerVisible) {
      closeColorPicker();
      return;
    }
    openColorPicker();
  }, [closeColorPicker, isColorPickerVisible, openColorPicker]);

  const handleDescriptionFocus = useCallback(() => {
    closeColorPicker();
    setTimeout(() => {
      const targetY = descriptionSectionYRef.current;
      if (targetY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const keyboardAwareOffset = windowHeight * 0.3;
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, targetY - keyboardAwareOffset),
          animated: true,
        });
      }
    }, 220);
  }, [closeColorPicker]);

  const handleDeletePress = useCallback(async () => {
    if (isCurrentDefaultSubtype) {
      showToast('기본 결제 유형은 삭제할 수 없습니다.');
      return;
    }
    if (!currentSubtype) {
      showToast('결제 유형 정보를 불러오지 못했습니다.');
      return;
    }

    closeColorPicker();

    try {
      const expenses = await getAllExpenses();
      const hasLinkedExpenses = expenses.some((expense) => expense.paymentSubtypeId === currentSubtype.id);
      if (hasLinkedExpenses) {
        setShowDeleteBlockedAlert(true);
        return;
      }

      // 2번 정책: 연결 소비 기록이 없을 때만 삭제 확인 모달 노출
      setShowDeleteConfirm(true);
    } catch (error) {
      console.error('결제 유형 삭제 가능 여부 확인 실패:', error);
      showToast('결제 유형 정보를 확인하지 못했습니다.');
    }
  }, [closeColorPicker, currentSubtype, isCurrentDefaultSubtype, showToast]);

  const handleDeleteCancel = useCallback(() => {
    setShowDeleteConfirm(false);
  }, []);
  const handleDeleteBlockedAlertClose = useCallback(() => {
    setShowDeleteBlockedAlert(false);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!currentSubtype) {
      setShowDeleteConfirm(false);
      showToast('결제 유형 정보를 불러오지 못했습니다.');
      return;
    }
    if (isCurrentDefaultSubtype) {
      setShowDeleteConfirm(false);
      showToast('기본 결제 유형은 삭제할 수 없습니다.');
      return;
    }

    try {
      const expenses = await getAllExpenses();
      const hasLinkedExpenses = expenses.some((expense) => expense.paymentSubtypeId === currentSubtype.id);
      if (hasLinkedExpenses) {
        setShowDeleteConfirm(false);
        setShowDeleteBlockedAlert(true);
        return;
      }

      const nextSubtypes = paymentSubtypes.filter((item) => item.id !== currentSubtype.id);
      await savePaymentSubtypes(nextSubtypes);

      setShowDeleteConfirm(false);
      router.back();
    } catch (error) {
      console.error('결제 유형 삭제 실패:', error);
      setShowDeleteConfirm(false);
      showToast('결제 유형 삭제에 실패했습니다.');
    }
  }, [currentSubtype, isCurrentDefaultSubtype, paymentSubtypes, router, showToast]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      <TopNavigation type="sub" title="결제 유형 편집" showLeftIcon onLeftIconPress={handleBack} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.content, { backgroundColor: colors.fill }]}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardHeight > 0
                ? { paddingBottom: keyboardHeight + 16 }
                : undefined,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.colorSection}>
              <Pressable
                onPress={handleToggleColorPicker}
                style={[styles.colorCircle, { backgroundColor: color, borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="결제 유형 색상 선택"
              />
            </View>

            <View style={styles.section}>
              <View style={styles.inputHeader}>
                <Text style={[styles.label, { color: colors.text }]}>
                  결제 유형 이름{' '}
                  <Text style={{ color: colors.statusNegative }} accessibilityLabel="필수">
                    *
                  </Text>
                </Text>
                <Pressable
                  onPress={handleDeletePress}
                  accessibilityRole="button"
                  accessibilityLabel="결제 유형 삭제"
                >
                  <Text style={styles.deleteText}>삭제</Text>
                </Pressable>
              </View>
              <Input
                value={label}
                onChangeText={setLabel}
                placeholder="이름 입력"
                autoFocus={false}
                maxLength={10}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.text }]}>
                결제 유형{' '}
                <Text style={{ color: colors.statusNegative }} accessibilityLabel="필수">
                  *
                </Text>
              </Text>
              <View style={styles.radioRowWrap}>
                <View style={styles.radioRow}>
                <View style={styles.radioCol}>
                  <Radio checked={currentSubtype?.type === 'credit'} label="신용카드" disabled />
                </View>
                <View style={styles.radioCol}>
                  <Radio checked={currentSubtype?.type === 'debit'} label="체크카드" disabled />
                </View>
              </View>
              </View>
            </View>

            <View
              style={styles.section}
              onLayout={(event) => {
                descriptionSectionYRef.current = event.nativeEvent.layout.y;
              }}
            >
              <Text style={[styles.label, { color: colors.text }]}>설명</Text>
              <View style={[styles.textAreaWrap, { backgroundColor: colors.staticWhite, borderColor: colors.border }]}>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onFocus={handleDescriptionFocus}
                  placeholder="설명을 입력해 주세요.(최대 20자)"
                  placeholderTextColor={colors.textAssistive}
                  style={[styles.textArea, { color: colors.text }]}
                  multiline
                  maxLength={20}
                  textAlignVertical="top"
                />
              </View>
            </View>
          </ScrollView>
          {isColorPickerMounted ? (
            <>
              {isColorPickerVisible ? (
                <Pressable style={styles.colorPickerBackdrop} onPress={closeColorPicker} />
              ) : null}
              <Animated.View
                style={[
                  styles.colorPickerPopover,
                  {
                    backgroundColor: AtomicColors.neutral[100],
                    borderColor: colors.border,
                    opacity: colorPickerOpacity,
                    transform: [{ scale: colorPickerScale }],
                  },
                ]}
              >
                {isColorPickerReady ? (
                  <ColorPicker value={color} onChangeJS={(selected) => setColor(selected.hex)} style={styles.colorPicker}>
                    <Panel1 style={styles.colorPanel} />
                    <HueSlider style={styles.hueSlider} />
                  </ColorPicker>
                ) : null}
              </Animated.View>
            </>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <View
        style={[
          styles.bottomButtonContainer,
          {
            backgroundColor: colors.staticWhite,
            paddingBottom: insets.bottom || 34,
          },
        ]}
      >
        <Button onPress={handleSave}>저장</Button>
      </View>

      <ModalPopup
        visible={showDeleteConfirm}
        confirmText="확인"
        cancelText="취소"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        closeOnBackdrop
        backdropInteractive
      >
        <Text style={[styles.modalText, { color: colors.textNeutral }]}>
          '{currentSubtype?.label ?? ''}'의{'\n'}
          결제 유형을 삭제하시겠어요?
        </Text>
      </ModalPopup>

      <ModalPopup
        visible={showDeleteBlockedAlert}
        confirmText="확인"
        onConfirm={handleDeleteBlockedAlertClose}
        onCancel={handleDeleteBlockedAlertClose}
        closeOnBackdrop
        backdropInteractive
      >
        <Text style={[styles.modalText, { color: colors.textNeutral }]}>
          해당 결제 유형으로 생성된{'\n'}
          소비 기록을 먼저 삭제한 후{'\n'}
          결제 유형을 삭제할 수 있습니다.
        </Text>
      </ModalPopup>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 16 },
  bottomButtonContainer: { paddingHorizontal: 16, paddingTop: 16 },

  colorSection: { alignItems: 'center', marginTop: 24, marginBottom: 32 },
  colorCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
  },
  colorPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  // 시안 반영: 240x304 고정 오버레이 패널
  colorPickerPopover: {
    position: 'absolute',
    top: 152,
    left: '50%',
    marginLeft: -120,
    width: 240,
    height: 304,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    zIndex: 50,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  // reanimated-color-picker는 고정 높이 기반이 안정적
  colorPicker: { width: '100%' },
  colorPanel: { width: '100%', height: 220, borderRadius: 12 },
  hueSlider: { width: '100%', height: 36, marginTop: 12, borderRadius: 12 },

  // 피그마: 섹션 간 32px 간격
  section: { marginBottom: 32 },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: { ...Typography.body1.l.bold },
  deleteText: {
    ...Typography.body1.l.regular,
    color: Colors.light.statusNegative,
  },
  // 피그마: 신용(좌) / 체크(우)로 고정 배치
  // - 2컬럼(각 50%)으로 쪼개서, 체크카드가 화면 중앙(50%)에서 시작하도록 맞춤
  radioRowWrap: { marginTop: 8 },
  radioRow: { flexDirection: 'row', alignItems: 'center' },
  radioCol: { flex: 1, alignItems: 'flex-start' },

  textAreaWrap: {
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  textArea: {
    ...Typography.body1.l.regular,
    flex: 1,
    padding: 0,
  },
  modalText: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
});

