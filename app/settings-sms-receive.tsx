/**
 * 문자 수신 설정
 * Figma / Fluid: settings.smsReceive.default (+ addNumberKeypad 추가 플로우)
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ModalPopup } from '@/components/ui/modal-popup';
import { SectionTitle } from '@/components/ui/section-title';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { atomicColors } from '@/constants/atomic-colors';
import { themeColors } from '@/constants/theme-colors';
import { typography, typographyLayout } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { requestNotificationPermissionThenOpenSettings } from '@/hooks/use-notifications';
import { resolveSmsInboxShortcutInstallUrl } from '@/constants/sms-inbox-shortcut';
import {
  diagnoseSmsInboxNativeQueue,
  flushPendingSmsInboxFromNative,
  formatSmsInboxDiagnoseMessage,
  formatSmsInboxFlushMessage,
} from '@/utils/sms-inbox-native-queue';
import {
  loadSmsReceiveEnabled,
  loadSmsReceiveNumbers,
  saveSmsReceiveEnabled,
  saveSmsReceiveNumbers,
} from '@/utils/sms-receive-settings';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Linking,
  Modal,
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
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Frame 292 ≡ 간편입력 계산기 calculatorBar
 * (@/contexts/quick-input-context calculatorBar / calculatorInput / calculatorActionButton)
 */
const ADD_BAR_HEIGHT = 64;
/** Figma: Frame 292 bottom → NumericKeyboard top */
const ADD_BAR_GAP_ABOVE_KEYBOARD = 16;

export default function SettingsSmsReceiveScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const inputRef = useRef<TextInput>(null);

  const [smsReceiveEnabled, setSmsReceiveEnabled] = useState(false);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [addOverlayVisible, setAddOverlayVisible] = useState(false);
  /** null이면 신규 추가, 문자열이면 해당 번호 편집 */
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [draftNumber, setDraftNumber] = useState('');
  const [permissionGuideVisible, setPermissionGuideVisible] = useState(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyTitle, setVerifyTitle] = useState('문자 수신 검증');
  const [verifyMessage, setVerifyMessage] = useState('');

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
    // Android adjustResize와 sticky 이중 이동 방지 — 간편입력과 동일
    if (Platform.OS === 'android') {
      KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_NOTHING);
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => {
      clearTimeout(timer);
      if (Platform.OS === 'android') {
        KeyboardController.setDefaultMode();
      }
    };
  }, [addOverlayVisible]);

  const handleBack = () => {
    router.back();
  };

  const handleToggle = useCallback(async (value: boolean) => {
    setSmsReceiveEnabled(value);
    await saveSmsReceiveEnabled(value);
    if (!value) {
      Keyboard.dismiss();
      setAddOverlayVisible(false);
      setEditingNumber(null);
      setDraftNumber('');
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

  const handleShortcutsPress = useCallback(() => {
    if (Platform.OS === 'ios') {
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
      return;
    }
    void Linking.openSettings();
  }, [setLoading]);

  /** Intent→App Group 전달 여부 확인 (큐를 비우지 않음) */
  const handleVerifyPeek = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      setLoading(true);
      const report = await diagnoseSmsInboxNativeQueue();
      setVerifyTitle('대기 큐 확인 (peek)');
      setVerifyMessage(formatSmsInboxDiagnoseMessage(report));
      setVerifyVisible(true);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  /** 대기 큐 drain → ingest 결과 확인 */
  const handleVerifyFlush = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    try {
      setLoading(true);
      const before = await diagnoseSmsInboxNativeQueue();
      const flush = await flushPendingSmsInboxFromNative();
      const after = await diagnoseSmsInboxNativeQueue();
      setVerifyTitle('flush → ingest 결과');
      setVerifyMessage(
        [
          '[flush 전]',
          formatSmsInboxDiagnoseMessage(before),
          '',
          '[flush]',
          formatSmsInboxFlushMessage(flush),
          '',
          '[flush 후]',
          `스토어 가기록: ${after.storeItemCount}`,
          `pending: ${after.pendingCount}`,
        ].join('\n'),
      );
      setVerifyVisible(true);
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const openAddOverlay = useCallback(() => {
    setEditingNumber(null);
    setDraftNumber('');
    setAddOverlayVisible(true);
  }, []);

  const openEditOverlay = useCallback((number: string) => {
    setEditingNumber(number);
    setDraftNumber(number);
    setAddOverlayVisible(true);
  }, []);

  const closeAddOverlay = useCallback(() => {
    Keyboard.dismiss();
    setAddOverlayVisible(false);
    setEditingNumber(null);
    setDraftNumber('');
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
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.staticWhite }]}
      edges={['top', 'bottom']}
    >
      <TopNavigation
        type="sub"
        title="문자 수신 설정"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <ScrollView
        style={[styles.scroll, { backgroundColor: colors.fill }]}
        contentContainerStyle={styles.scrollContent}
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

          {smsReceiveEnabled ? (
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
                  공유 단축어를 추가한 뒤, 자동화에서 발신번호 트리거만 연결하세요. (아이폰)
                </UiLineText>
              </Pressable>
              {Platform.OS === 'ios' ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Pressable
                    style={styles.toggleBlock}
                    onPress={() => {
                      void handleVerifyPeek();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="대기 큐 확인"
                  >
                    <View style={styles.toggleRow}>
                      <UiLineText style={{ color: colors.text }}>대기 큐 확인 (peek)</UiLineText>
                      <Icon name="arrowRight" size={24} color={colors.staticBlack} />
                    </View>
                    <UiLineText style={[styles.caption, { color: colors.textAssistive }]}>
                      단축어가 App Group에 본문을 넣었는지 확인합니다. 큐는 비우지 않습니다.
                    </UiLineText>
                  </Pressable>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Pressable
                    style={styles.toggleBlock}
                    onPress={() => {
                      void handleVerifyFlush();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="대기 큐 flush"
                  >
                    <View style={styles.toggleRow}>
                      <UiLineText style={{ color: colors.text }}>대기 큐 flush → 수신함</UiLineText>
                      <Icon name="arrowRight" size={24} color={colors.staticBlack} />
                    </View>
                    <UiLineText style={[styles.caption, { color: colors.textAssistive }]}>
                      큐를 비워 ingest하고 성공/실패 reason을 보여 줍니다.
                    </UiLineText>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}
        </View>

        {smsReceiveEnabled ? (
          <>
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

      {/*
        settings.smsReceive.addNumberKeypad
        구조 = 간편입력 계산기: 풀스크린 딤 + calculatorBar(Frame 292) + OS 쿼티(공백 입력용)
        딤은 루트 배경으로 깔고(절대 안 사라짐), 탭 영역은 상단 flex:1 Pressable.
      */}
      <Modal
        visible={addOverlayVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeAddOverlay}
      >
        <View style={[styles.addOverlayRoot, { backgroundColor: colors.overlayDim }]}>
          <View style={styles.addDockHost}>
            <Pressable
              style={styles.addDimTap}
              onPress={closeAddOverlay}
              accessibilityRole="button"
              accessibilityLabel="추가 취소"
            />
            {/* 쿼티와 같은 프레임으로 인풋바 상승 (간편입력 calculatorBar와 동일 패턴) */}
            <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
              <View style={styles.addEdgeContent}>
                {/* ≡ styles.calculatorBar */}
                <View style={styles.addBar}>
                  {/* ≡ styles.calculatorInput */}
                  <View style={styles.addInputShell}>
                    <TextInput
                      ref={inputRef}
                      value={draftNumber}
                      onChangeText={setDraftNumber}
                      placeholder="+82 1588-1100"
                      placeholderTextColor={colors.textAssistive}
                      keyboardType="default"
                      autoFocus
                      accessibilityLabel="수신 번호 입력"
                      style={[
                        styles.addInputText,
                        typographyLayout.fieldInputLine,
                        { color: colors.text },
                      ]}
                    />
                  </View>
                  {/* ≡ styles.calculatorActionButton — Frame 288 체크 */}
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
            </KeyboardStickyView>
          </View>
        </View>
      </Modal>

      {Platform.OS === 'android' ? (
        <ModalPopup
          visible={permissionGuideVisible}
          title="알림 권한 설정 안내"
          confirmText="확인"
          onConfirm={closePermissionGuide}
          onCancel={closePermissionGuide}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <ModalPopup
          visible={verifyVisible}
          title={verifyTitle}
          message={verifyMessage}
          confirmText="확인"
          onConfirm={() => setVerifyVisible(false)}
          onCancel={() => setVerifyVisible(false)}
          closeOnBackdrop
        />
      ) : null}
    </SafeAreaView>
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
    paddingBottom: 24,
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
    flex: 1,
  },
  addDockHost: {
    flex: 1,
  },
  /** 딤 탭 영역(색은 루트 backgroundColor) */
  addDimTap: {
    flex: 1,
  },
  /** ≡ quick-input edgeContent */
  addEdgeContent: {
    marginHorizontal: 16,
    marginBottom: ADD_BAR_GAP_ABOVE_KEYBOARD,
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
