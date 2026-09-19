/**
 * 문자 수신 설정
 * Figma / Fluid: settings.smsReceive.default · addNumberKeypad · setupGuide
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
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
import {
  hasAndroidSmsReceivePermission,
  openAndroidAppSettings,
  requestAndroidSmsReceivePermission,
} from '@/utils/android-sms-permission';
import {
  areAndroidDefaultSmsAppNotificationsEnabled,
  hasAndroidSmsInboxNotificationAccess,
  openAndroidDefaultSmsAppNotificationSettings,
  openAndroidSmsInboxNotificationAccessSettings,
} from '@/utils/android-sms-inbox-notification-access';
import {
  loadSmsReceiveDisclosureAccepted,
  loadSmsReceiveEnabled,
  loadSmsReceiveNumbers,
  saveSmsReceiveDisclosureAccepted,
  saveSmsReceiveEnabled,
  saveSmsReceiveNumbers,
} from '@/utils/sms-receive-settings';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Frame 292 ≡ 간편입력 계산기 calculatorBar
 * (@/contexts/quick-input-context calculatorBar / calculatorInput / calculatorActionButton)
 */
const ADD_BAR_HEIGHT = 64;
/** Figma: Frame 292 bottom → NumericKeyboard top */
const ADD_BAR_GAP_ABOVE_KEYBOARD = 16;
const ADD_BACKDROP_FADE_MS = 100;

const SMS_DISCLOSURE_MESSAGE =
  '설정한 발신번호의 메세지 내용을 확인하기 위해 SMS 접근 권한과 알림 접근 권한이 필요합니다. 수신된 문자를 인식하기 위함이며 별도로 SMS/알림은 저장하지 않습니다.';

type AndroidEnablePendingStep = 'notification-access' | 'messages-notification' | null;

export default function SettingsSmsReceiveScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /** Android push 직후 insets.top=0 → 실값 점프 방지 */
  const topInset =
    insets.top > 0 ? insets.top : (initialWindowMetrics?.insets.top ?? 0);
  const { setLoading } = useLoading();
  const inputRef = useRef<TextInput>(null);
  const addOverlayVisibleRef = useRef(false);
  const addKeyboardWasVisibleRef = useRef(false);
  const isAddClosingRef = useRef(false);
  const addCloseFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { reanimated: keyboardReanimated } = useKeyboardContext();
  const addBackdropOpacity = useSharedValue(0);

  const [settingsReady, setSettingsReady] = useState(false);
  const [smsReceiveEnabled, setSmsReceiveEnabled] = useState(false);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [addOverlayVisible, setAddOverlayVisible] = useState(false);
  /** 닫을 때 입력란만 먼저 언마운트(키패드 follow 없이 그 자리 소거) */
  const [addBarVisible, setAddBarVisible] = useState(false);
  /** null이면 신규 추가, 문자열이면 해당 번호 편집 */
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState('');
  const [setupGuideVisible, setSetupGuideVisible] = useState(false);
  const androidEnablePendingStepRef = useRef<AndroidEnablePendingStep>(null);

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
    let cancelled = false;
    const load = async () => {
      try {
        const [enabled, storedNumbers] = await Promise.all([
          loadSmsReceiveEnabled(),
          loadSmsReceiveNumbers(),
        ]);
        if (cancelled) return;

        const canReceive =
          Platform.OS !== 'android' ||
          ((await hasAndroidSmsReceivePermission()) &&
            (await hasAndroidSmsInboxNotificationAccess()));
        if (cancelled) return;

        const effectiveEnabled = enabled && canReceive;
        setSmsReceiveEnabled(effectiveEnabled);
        setNumbers(storedNumbers);
        setSettingsReady(true);
        if (enabled !== effectiveEnabled) {
          await saveSmsReceiveEnabled(effectiveEnabled);
        }
      } catch {
        if (!cancelled) {
          setSettingsReady(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const finishAndroidEnable = useCallback(async () => {
    androidEnablePendingStepRef.current = null;
    setSmsReceiveEnabled(true);
    await saveSmsReceiveEnabled(true);
  }, []);

  const promptMessagesNotificationGuide = useCallback(() => {
    androidEnablePendingStepRef.current = 'messages-notification';
    Alert.alert(
      '메세지 알림 설정 안내',
      '설정한 발신번호의 메세지를 확인하기 위해 메세지 앱의 알림 기능을 사용 설정해 주세요.',
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => {
            androidEnablePendingStepRef.current = null;
            setSmsReceiveEnabled(false);
          },
        },
        {
          text: '설정으로 이동',
          onPress: () => {
            void openAndroidDefaultSmsAppNotificationSettings();
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  const continueAndroidEnableAfterSms = useCallback(async () => {
    if (await hasAndroidSmsInboxNotificationAccess()) {
      if (await areAndroidDefaultSmsAppNotificationsEnabled()) {
        await finishAndroidEnable();
        return;
      }
      promptMessagesNotificationGuide();
      return;
    }

    androidEnablePendingStepRef.current = 'notification-access';
    Alert.alert(
      '알림 접근 권한 안내',
      '수신되는 알림에 대해 접근을 허용해 주세요.',
      [
        {
          text: '취소',
          style: 'cancel',
          onPress: () => {
            androidEnablePendingStepRef.current = null;
            setSmsReceiveEnabled(false);
          },
        },
        {
          text: '설정으로 이동',
          onPress: () => {
            void openAndroidSmsInboxNotificationAccessSettings();
          },
        },
      ],
      { cancelable: false },
    );
  }, [finishAndroidEnable, promptMessagesNotificationGuide]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void (async () => {
        const pending = androidEnablePendingStepRef.current;
        if (pending === 'notification-access') {
          if (!(await hasAndroidSmsInboxNotificationAccess())) {
            return;
          }
          if (await areAndroidDefaultSmsAppNotificationsEnabled()) {
            await finishAndroidEnable();
            return;
          }
          promptMessagesNotificationGuide();
          return;
        }
        if (pending === 'messages-notification') {
          // 메시지 앱 알림은 완벽 감지가 어려워, 설정에서 돌아온 뒤 사용자가 켠 것으로 보고 진행한다.
          // 감지가 false로 확실할 때만 다시 안내한다.
          const messagesOn = await areAndroidDefaultSmsAppNotificationsEnabled();
          if (!messagesOn) {
            promptMessagesNotificationGuide();
            return;
          }
          if (!(await hasAndroidSmsInboxNotificationAccess())) {
            androidEnablePendingStepRef.current = 'notification-access';
            return;
          }
          if (!(await hasAndroidSmsReceivePermission())) {
            androidEnablePendingStepRef.current = null;
            setSmsReceiveEnabled(false);
            await saveSmsReceiveEnabled(false);
            return;
          }
          await finishAndroidEnable();
          return;
        }

        if (!smsReceiveEnabled) return;
        const [smsOk, listenerOk] = await Promise.all([
          hasAndroidSmsReceivePermission(),
          hasAndroidSmsInboxNotificationAccess(),
        ]);
        if (smsOk && listenerOk) return;
        setSmsReceiveEnabled(false);
        await saveSmsReceiveEnabled(false);
      })();
    });
    return () => subscription.remove();
  }, [finishAndroidEnable, promptMessagesNotificationGuide, smsReceiveEnabled]);

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

  const showSmsPermissionBlockedGuide = useCallback(() => {
    Alert.alert(
      '문자 수신 권한 안내',
      '메세지를 확인하기 위해선 SMS 접근 권한이 필요합니다. 접근 권한을 허용해 주세요.',
      [
        { text: '취소', style: 'cancel' },
        { text: '설정으로 이동', onPress: () => openAndroidAppSettings() },
      ],
    );
  }, []);

  const requestSmsPermissionAfterDisclosure = useCallback(async () => {
    await saveSmsReceiveDisclosureAccepted();
    const result = await requestAndroidSmsReceivePermission();
    if (result !== 'granted') {
      setSmsReceiveEnabled(false);
      await saveSmsReceiveEnabled(false);
      // 단순 거부는 스위치 OFF만. 시스템 팝업이 더 이상 안 뜨는 경우만 설정 안내.
      if (result === 'blocked') {
        showSmsPermissionBlockedGuide();
      }
      return;
    }
    await continueAndroidEnableAfterSms();
  }, [continueAndroidEnableAfterSms, showSmsPermissionBlockedGuide]);

  const showSmsDisclosureAlert = useCallback(() => {
    Alert.alert(
      '문자 수신 설정 안내',
      SMS_DISCLOSURE_MESSAGE,
      [
        {
          text: '허용 안 함',
          style: 'cancel',
          onPress: () => setSmsReceiveEnabled(false),
        },
        {
          text: '허용',
          onPress: () => {
            void requestSmsPermissionAfterDisclosure();
          },
        },
      ],
      { cancelable: false },
    );
  }, [requestSmsPermissionAfterDisclosure]);

  const handleToggle = useCallback(async (value: boolean) => {
    if (!value) {
      androidEnablePendingStepRef.current = null;
      setSmsReceiveEnabled(false);
      await saveSmsReceiveEnabled(false);
      Keyboard.dismiss();
      isAddClosingRef.current = false;
      addOverlayVisibleRef.current = false;
      addKeyboardWasVisibleRef.current = false;
      setAddOverlayVisible(false);
      setAddBarVisible(false);
      setEditingNumber(null);
      setDraftNumber('');
      setSetupGuideVisible(false);
      if (Platform.OS === 'android') {
        KeyboardController.setDefaultMode();
      }
      return;
    }

    if (Platform.OS === 'android') {
      const [disclosureAccepted, permissionGranted, notificationAccess] = await Promise.all([
        loadSmsReceiveDisclosureAccepted(),
        hasAndroidSmsReceivePermission(),
        hasAndroidSmsInboxNotificationAccess(),
      ]);
      if (!disclosureAccepted || !permissionGranted) {
        showSmsDisclosureAlert();
        return;
      }
      if (!notificationAccess) {
        await continueAndroidEnableAfterSms();
        return;
      }
      if (!(await areAndroidDefaultSmsAppNotificationsEnabled())) {
        promptMessagesNotificationGuide();
        return;
      }
    }
    await finishAndroidEnable();
  }, [
    continueAndroidEnableAfterSms,
    finishAndroidEnable,
    promptMessagesNotificationGuide,
    showSmsDisclosureAlert,
  ]);

  const handlePermissionGuidePress = useCallback(() => {
    Alert.alert(
      '접근/권한 허용 안내',
      '설정한 발신번호의 메세지 내용을 확인하기 위해 SMS 접근 권한과 알림 접근 권한이 필요합니다. 수신된 문자를 인식하기 위함이며 별도로 SMS/알림의 내용은 저장하지 않습니다.',
      [{ text: '확인' }],
    );
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
    setAddBarVisible(true);
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
      setAddBarVisible(true);
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
    setAddBarVisible(false);
    setAddOverlayVisible(false);
    setEditingNumber(null);
    setDraftNumber('');
    if (Platform.OS === 'android') {
      KeyboardController.setDefaultMode();
    }
  }, []);

  /** 딤 페이드 후 오버레이 정리 */
  const fadeBackdropThenFinishClose = useCallback(() => {
    // eslint-disable-next-line react-hooks/immutability
    addBackdropOpacity.value = withTiming(0, { duration: ADD_BACKDROP_FADE_MS }, (finished) => {
      if (finished) {
        runOnJS(finishCloseAddOverlay)();
      }
    });
  }, [addBackdropOpacity, finishCloseAddOverlay]);

  /**
   * 닫기: 입력란은 키패드를 따라가지 않고 그 자리에서 바로 언마운트 → 딤 페이드.
   * 열기는 기존대로 딤 → focus → 키패드 follow.
   */
  const closeAddOverlay = useCallback(() => {
    if (!addOverlayVisibleRef.current || isAddClosingRef.current) {
      return;
    }
    isAddClosingRef.current = true;
    inputRef.current?.blur();
    setAddBarVisible(false);
    Keyboard.dismiss();

    if (addCloseFallbackTimeoutRef.current != null) {
      clearTimeout(addCloseFallbackTimeoutRef.current);
    }
    fadeBackdropThenFinishClose();
    addCloseFallbackTimeoutRef.current = setTimeout(() => {
      finishCloseAddOverlay();
    }, ADD_BACKDROP_FADE_MS + 40);
  }, [fadeBackdropThenFinishClose, finishCloseAddOverlay]);

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
        // 닫기 중: 입력란은 이미 언마운트. 딤 페이드는 closeAddOverlay에서 처리.
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
      setAddBarVisible(false);
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
    <View style={[styles.container, { backgroundColor: colors.staticWhite, paddingTop: topInset }]}>
      <View style={styles.container}>
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
        {settingsReady ? (
          <>
        {/* Figma: 문자 수신 여부 + Android SMS 권한 안내 */}
        <View style={styles.sectionHeaderRow}>
          <SectionTitle style={{ color: colors.staticBlack }}>문자 수신 여부</SectionTitle>
          {Platform.OS === 'android' ? (
            <Pressable
              onPress={handlePermissionGuidePress}
              accessibilityRole="link"
              accessibilityLabel="접근/권한 허용 안내"
              hitSlop={8}
            >
              <UiLineText style={[styles.permissionLink, { color: colors.textAssistive }]}>
                접근/권한 허용 안내
              </UiLineText>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
          <View style={styles.toggleBlock}>
            <View style={styles.toggleRow}>
              <UiLineText style={{ color: colors.text }}>문자 수신</UiLineText>
              <Switch
                value={smsReceiveEnabled}
                onValueChange={(v) => void handleToggle(v)}
                accessibilityLabel="문자 수신"
              />
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
            {Platform.OS === 'ios' ? (
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
                  <UiLineText style={{ color: colors.staticBlack }}>
                    문자 수신함 설정 가이드
                  </UiLineText>
                </View>
              </Pressable>
            ) : null}

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
          </>
        ) : null}
      </ScrollView>
      </View>

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
          {addBarVisible ? (
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
          ) : null}
        </View>
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
