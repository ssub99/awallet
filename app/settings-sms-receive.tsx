/**
 * 문자 수신 설정
 * Figma / Fluid: settings.smsReceive.default · addNumberKeypad · setupGuide
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ModalPopup } from '@/components/ui/modal-popup';
import { SectionTitle } from '@/components/ui/section-title';
import { SmsInboxSetupGuideSheet } from '@/components/ui/sms-inbox-setup-guide-sheet';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { resolveSmsInboxShortcutInstallUrl } from '@/constants/sms-inbox-shortcut';
import { themeColors } from '@/constants/theme-colors';
import { typography, typographyLayout } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissionThenOpenSettings } from '@/hooks/use-notifications';
import {
  loadSmsReceiveEnabled,
  loadSmsReceiveNumbers,
  saveSmsReceiveEnabled,
  saveSmsReceiveNumbers,
} from '@/utils/sms-receive-settings';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  AndroidSoftInputModes,
  KeyboardController,
  useKeyboardContext,
} from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Frame 292 ≡ 간편입력 계산기 calculatorBar
 * (@/contexts/quick-input-context calculatorBar / calculatorInput / calculatorActionButton)
 */
const ADD_BAR_HEIGHT = 64;
/** Figma: Frame 292 bottom → NumericKeyboard top */
const ADD_BAR_GAP_ABOVE_KEYBOARD = 16;
const ADD_BACKDROP_FADE_MS = 200;

export default function SettingsSmsReceiveScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setLoading } = useLoading();
  const inputRef = useRef<TextInput>(null);
  const addOverlayVisibleRef = useRef(false);
  const addKeyboardWasVisibleRef = useRef(false);
  const isAddClosingRef = useRef(false);
  const addCloseFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { reanimated: keyboardReanimated } = useKeyboardContext();
  const addBackdropOpacity = useSharedValue(0);

  const [smsReceiveEnabled, setSmsReceiveEnabled] = useState(false);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [addOverlayVisible, setAddOverlayVisible] = useState(false);
  /** null이면 신규 추가, 문자열이면 해당 번호 편집 */
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState('');
  const [permissionGuideVisible, setPermissionGuideVisible] = useState(false);
  const [setupGuideVisible, setSetupGuideVisible] = useState(false);

  const addBackdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: addBackdropOpacity.value,
  }));

  const addBarAnimatedStyle = useAnimatedStyle(() => {
    const keyboardHeight = Math.abs(keyboardReanimated.height.value);
    const restBottom = insets.bottom;
    return {
      bottom:
        keyboardHeight > 0
          ? keyboardHeight + ADD_BAR_GAP_ABOVE_KEYBOARD
          : restBottom + ADD_BAR_GAP_ABOVE_KEYBOARD,
    };
  }, [insets.bottom]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [enabled, storedNumbers] = await Promise.all([
          loadSmsReceiveEnabled(),
          loadSmsReceiveNumbers(),
        ]);
        setSmsReceiveEnabled(enabled);
        setNumbers(storedNumbers);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [setLoading]);

  useEffect(() => {
    if (!addOverlayVisible) return;
    // eslint-disable-next-line react-hooks/immutability
    addBackdropOpacity.value = withTiming(1, { duration: ADD_BACKDROP_FADE_MS });
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => {
      clearTimeout(timer);
    };
  }, [addBackdropOpacity, addOverlayVisible]);

  const handleBack = () => {
    router.back();
  };

  const handleToggle = useCallback(async (value: boolean) => {
    setSmsReceiveEnabled(value);
    await saveSmsReceiveEnabled(value);
    if (!value) {
      Keyboard.dismiss();
      isAddClosingRef.current = false;
      addOverlayVisibleRef.current = false;
      addKeyboardWasVisibleRef.current = false;
      setAddOverlayVisible(false);
      setEditingNumber(null);
      setDraftNumber('');
      setSetupGuideVisible(false);
      if (Platform.OS === 'android') {
        KeyboardController.setDefaultMode();
      }
      return;
    }
    // Android만: OS 시스템 모달(가능 시) → 알림 권한 설정 화면
    if (Platform.OS === 'android') {
      await requestNotificationPermissionThenOpenSettings();
    }
  }, []);

  const handlePermissionGuidePress = useCallback(() => {
    setPermissionGuideVisible(true);
  }, []);

  const closePermissionGuide = useCallback(() => {
    setPermissionGuideVisible(false);
  }, []);

  const handleSetupGuidePress = useCallback(() => {
    setSetupGuideVisible(true);
  }, []);

  const closeSetupGuide = useCallback(() => {
    setSetupGuideVisible(false);
  }, []);

  const handleShortcutsPress = useCallback(() => {
    void (async () => {
      try {
        setLoading(true);
        const installUrl = await resolveSmsInboxShortcutInstallUrl();
        await Linking.openURL(installUrl);
      } catch {
        await Linking.openURL('shortcuts://');
      } finally {
        setLoading(false);
      }
    })();
  }, [setLoading]);

  const openAddOverlay = useCallback(() => {
    if (Platform.OS === 'android') {
      KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
    }
    isAddClosingRef.current = false;
    // eslint-disable-next-line react-hooks/immutability
    addBackdropOpacity.value = 0;
    addOverlayVisibleRef.current = true;
    setEditingNumber(null);
    setDraftNumber('');
    setAddOverlayVisible(true);
  }, [addBackdropOpacity]);

  const openEditOverlay = useCallback(
    (number: string) => {
      if (Platform.OS === 'android') {
        KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
      }
      isAddClosingRef.current = false;
      // eslint-disable-next-line react-hooks/immutability
      addBackdropOpacity.value = 0;
      addOverlayVisibleRef.current = true;
      setEditingNumber(number);
      setDraftNumber(number);
      setAddOverlayVisible(true);
    },
    [addBackdropOpacity],
  );

  const finishCloseAddOverlay = useCallback(() => {
    if (addCloseFallbackTimeoutRef.current != null) {
      clearTimeout(addCloseFallbackTimeoutRef.current);
      addCloseFallbackTimeoutRef.current = null;
    }
    if (!isAddClosingRef.current && !addOverlayVisibleRef.current) {
      return;
    }
    isAddClosingRef.current = false;
    addOverlayVisibleRef.current = false;
    addKeyboardWasVisibleRef.current = false;
    setAddOverlayVisible(false);
    setEditingNumber(null);
    setDraftNumber('');
    if (Platform.OS === 'android') {
      KeyboardController.setDefaultMode();
    }
  }, []);

  /**
   * 간편입력 메인과 동일하게 키보드 SharedValue를 끝까지 따라간 뒤
   * keyboardDidHide에서 오버레이를 정리한다.
   */
  const closeAddOverlay = useCallback(() => {
    if (!addOverlayVisibleRef.current || isAddClosingRef.current) {
      return;
    }
    isAddClosingRef.current = true;
    inputRef.current?.blur();
    // eslint-disable-next-line react-hooks/immutability
    addBackdropOpacity.value = withTiming(0, { duration: ADD_BACKDROP_FADE_MS });
    const keyboardVisible =
      addKeyboardWasVisibleRef.current || (Keyboard.metrics()?.height ?? 0) > 0;
    Keyboard.dismiss();

    if (addCloseFallbackTimeoutRef.current != null) {
      clearTimeout(addCloseFallbackTimeoutRef.current);
    }
    addCloseFallbackTimeoutRef.current = setTimeout(() => {
      finishCloseAddOverlay();
    }, keyboardVisible ? 600 : ADD_BACKDROP_FADE_MS + 20);
  }, [addBackdropOpacity, finishCloseAddOverlay]);

  useEffect(() => {
    if (!addOverlayVisible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeAddOverlay();
      return true;
    });
    return () => sub.remove();
  }, [addOverlayVisible, closeAddOverlay]);

  useEffect(() => {
    if (!addOverlayVisible) {
      return undefined;
    }
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      if (!isAddClosingRef.current) {
        addKeyboardWasVisibleRef.current = true;
      }
    });
    const didHideSub = Keyboard.addListener('keyboardDidHide', () => {
      if (isAddClosingRef.current) {
        finishCloseAddOverlay();
        return;
      }
      if (!addKeyboardWasVisibleRef.current) {
        return;
      }
      addKeyboardWasVisibleRef.current = false;
      if (!addOverlayVisibleRef.current) {
        return;
      }
      // OS 키보드 내리기 버튼은 BackHandler보다 먼저 소비된다.
      addBackdropOpacity.value = 0;
      isAddClosingRef.current = true;
      finishCloseAddOverlay();
    });
    return () => {
      showSub.remove();
      didHideSub.remove();
    };
  }, [addBackdropOpacity, addOverlayVisible, finishCloseAddOverlay]);

  useEffect(() => {
    return () => {
      if (addCloseFallbackTimeoutRef.current != null) {
        clearTimeout(addCloseFallbackTimeoutRef.current);
      }
    };
  }, []);

  const confirmAddNumber = useCallback(async () => {
    if (draftNumber.length === 0) {
      return;
    }
    let next: string[];
    if (editingNumber != null) {
      next = numbers.map((item) => (item === editingNumber ? draftNumber : item));
      // 편집 결과가 다른 항목과 중복이면 한 번만 유지
      next = [...new Set(next)];
    } else {
      next = numbers.includes(draftNumber) ? numbers : [...numbers, draftNumber];
    }
    setNumbers(next);
    await saveSmsReceiveNumbers(next);
    closeAddOverlay();
  }, [closeAddOverlay, draftNumber, editingNumber, numbers]);

  const removeNumber = useCallback(
    async (target: string) => {
      const next = numbers.filter((item) => item !== target);
      setNumbers(next);
      await saveSmsReceiveNumbers(next);
    },
    [numbers],
  );

  const canConfirmAdd = draftNumber.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.staticWhite }]}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopNavigation
          type="sub"
          title="문자 수신 설정"
          showLeftIcon
          onLeftIconPress={handleBack}
        />

        <ScrollView
          style={[styles.scroll, { backgroundColor: colors.fill }]}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: 24 + insets.bottom },
          ]}
          bounces={false}
          overScrollMode="never"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
        {/* Figma: 문자 수신 여부 + (Android) 알림 권한 설정 안내 */}
        <View style={styles.sectionHeaderRow}>
          <SectionTitle style={{ color: colors.staticBlack }}>문자 수신 여부</SectionTitle>
          {Platform.OS === 'android' ? (
            <Pressable
              onPress={handlePermissionGuidePress}
              accessibilityRole="link"
              accessibilityLabel="알림 권한 설정 안내"
              hitSlop={8}
            >
              <UiLineText style={[styles.permissionLink, { color: colors.textAssistive }]}>
                알림 권한 설정 안내
              </UiLineText>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
          <View style={styles.toggleBlock}>
            <View style={styles.toggleRow}>
              <UiLineText style={{ color: colors.text }}>문자 수신</UiLineText>
              <Switch value={smsReceiveEnabled} onValueChange={(v) => void handleToggle(v)} />
            </View>
            <UiLineText style={[styles.caption, { color: colors.textAssistive }]}>
              발송되는 문자를 수신하여 기록으로 생성합니다.
            </UiLineText>
          </View>

          {smsReceiveEnabled && Platform.OS === 'ios' ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable
                style={styles.toggleBlock}
                onPress={handleShortcutsPress}
                accessibilityRole="button"
                accessibilityLabel="단축어 자동화 바로가기"
              >
                <View style={styles.toggleRow}>
                  <UiLineText style={{ color: colors.text }}>단축어 자동화 바로가기</UiLineText>
                  <Icon name="arrowRight" size={24} color={colors.staticBlack} />
                </View>
                <UiLineText style={[styles.caption, { color: colors.textAssistive }]}>
                  메세지의 내용을 전달하여 문자 수신함에 적재합니다.
                </UiLineText>
              </Pressable>
            </>
          ) : null}
        </View>

        {smsReceiveEnabled ? (
          <>
            {/*
              Figma Frame 303 — 문자 수신함 설정 가이드 (문자 수신 ON일 때만)
              HORIZONTAL SPACE_BETWEEN · pad 16 · radius 16 · 좌: tip 24 + gap8 + body01 regular
            */}
            <Pressable
              style={[styles.guideCard, { backgroundColor: colors.staticWhite }]}
              onPress={handleSetupGuidePress}
              accessibilityRole="button"
              accessibilityLabel="문자 수신함 설정 가이드"
            >
              <View style={styles.guideLeading}>
                <View style={styles.guideIconSlot}>
                  <Icon name="tip" variant="solid" size={24} accessibilityLabel="설정 가이드" />
                </View>
                <UiLineText style={{ color: colors.staticBlack }}>문자 수신함 설정 가이드</UiLineText>
              </View>
            </Pressable>

            <SectionTitle style={[styles.numberSectionTitle, { color: colors.staticBlack }]}>
              수신 번호 설정
            </SectionTitle>

            {/*
              Figma settings.smsReceive.default · 수신 번호 추가 행
              HORIZONTAL SPACE_BETWEEN + CENTER · pad 16/12
              좌: VERTICAL(보낸 사람 → 캡션) / 우: button assistive/solid/48 「추가」
            */}
            <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
              <View style={styles.addRow}>
                <View style={styles.addTextCol}>
                  <UiLineText style={{ color: colors.text }}>보낸 사람</UiLineText>
                  <UiLineText style={[styles.caption, { color: colors.textAssistive }]}>
                    국가 번호를 포함한 연락처를 기입합니다.
                  </UiLineText>
                </View>
                <Button
                  variant="assistive"
                  type="solid"
                  size="large"
                  onPress={openAddOverlay}
                  accessibilityLabel="수신 번호 추가"
                >
                  추가
                </Button>
              </View>
            </View>

            {numbers.map((number) => (
              <View
                key={number}
                style={[styles.numberCard, { backgroundColor: colors.staticWhite }]}
              >
                <View style={styles.numberRow}>
                  <Pressable
                    style={styles.numberPress}
                    onPress={() => openEditOverlay(number)}
                    accessibilityRole="button"
                    accessibilityLabel={`${number} 편집`}
                  >
                    <UiLineText style={{ color: colors.text }}>{number}</UiLineText>
                  </Pressable>
                  <Pressable
                    onPress={() => void removeNumber(number)}
                    accessibilityRole="button"
                    accessibilityLabel={`${number} 삭제`}
                    hitSlop={8}
                  >
                    <Icon name="cancel" variant="solid" size={24} color={colors.textAssistive} />
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
      </SafeAreaView>

      {/*
        settings.smsReceive.addNumberKeypad
        간편입력 메인과 동일한 화면 오버레이 + keyboard SharedValue follow.
      */}
      {addOverlayVisible ? (
        <View style={styles.addOverlayRoot}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.addBackdrop,
              { backgroundColor: colors.overlayDim },
              addBackdropAnimatedStyle,
            ]}
          />
          <Pressable
            style={styles.addDimTap}
            onPress={closeAddOverlay}
            accessibilityRole="button"
            accessibilityLabel="추가 취소"
          />
          <Animated.View style={[styles.addBarDock, addBarAnimatedStyle]}>
            <View style={styles.addEdgeContent}>
              <View style={styles.addBar}>
                <View style={styles.addInputShell}>
                  <TextInput
                    ref={inputRef}
                    value={draftNumber}
                    onChangeText={setDraftNumber}
                    placeholder="+82 1588-1100"
                    placeholderTextColor={colors.textAssistive}
                    keyboardType="default"
                    showSoftInputOnFocus
                    accessibilityLabel="수신 번호 입력"
                    style={[
                      styles.addInputText,
                      typographyLayout.fieldInputLine,
                      { color: colors.text },
                    ]}
                  />
                </View>
                <Pressable
                  onPress={() => {
                    void confirmAddNumber();
                  }}
                  disabled={!canConfirmAdd}
                  accessibilityRole="button"
                  accessibilityLabel="확인"
                  accessibilityState={{ disabled: !canConfirmAdd }}
                  style={[
                    styles.addActionButton,
                    {
                      backgroundColor: canConfirmAdd
                        ? colors.primary
                        : atomicColors.neutral[300],
                    },
                  ]}
                >
                  <Icon
                    name="check"
                    size={24}
                    color={canConfirmAdd ? colors.staticWhite : colors.textDisabled}
                  />
                </Pressable>
              </View>
            </View>
          </Animated.View>
        </View>
      ) : null}

      {Platform.OS === 'android' ? (
        <ModalPopup
          visible={permissionGuideVisible}
          title="알림 권한 설정 안내"
          confirmText="확인"
          onConfirm={closePermissionGuide}
          onCancel={closePermissionGuide}
        />
      ) : null}

      <SmsInboxSetupGuideSheet visible={setupGuideVisible} onClose={closeSetupGuide} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 0,
  },
  permissionLink: {
    textDecorationLine: 'underline',
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  /** Figma Frame 303 */
  guideCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guideLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  guideIconSlot: {
    width: 24,
    height: 24,
  },
  toggleBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  caption: {
    ...typography.body02.regular,
    marginTop: 0,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
  numberSectionTitle: {
    marginTop: 16,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addTextCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  numberCard: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  numberRow: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  numberPress: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  addOverlayRoot: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    elevation: 10,
  },
  addBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  /** 풀스크린 딤 탭 */
  addDimTap: {
    ...StyleSheet.absoluteFill,
  },
  /** 키보드 height → bottom. 딤 위에 그려야 함 */
  addBarDock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  /** ≡ quick-input edgeContent */
  addEdgeContent: {
    marginHorizontal: 16,
  },
  /** ≡ quick-input calculatorBar / Figma Frame 292 */
  addBar: {
    height: ADD_BAR_HEIGHT,
    borderRadius: 16,
    backgroundColor: atomicColors.neutral[100],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  /** ≡ quick-input calculatorInput */
  addInputShell: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: atomicColors.common[0],
    paddingHorizontal: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  addInputText: {
    padding: 0,
    margin: 0,
  },
  /** ≡ quick-input calculatorActionButton (비활성 기본색; 활성은 primary 런타임) */
  addActionButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
