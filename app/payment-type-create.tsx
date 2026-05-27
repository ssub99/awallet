import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Radio } from '@/components/ui/radio';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, typography, typographyLayout } from '@/constants/theme';
import { useToast } from '@/contexts/toast-context';
import { loadPaymentSubtypes, savePaymentSubtypes } from '@/utils/payment-types';
import {
  getDescriptionKeyboardScrollPaddingBottom,
  scrollScrollViewSectionAboveKeyboard,
} from '@/utils/record-form-keyboard-scroll';
import { ulid } from 'ulid';
import { Stack, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  type KeyboardEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import ColorPicker, { HueSlider, Panel1 } from 'reanimated-color-picker';

type PaymentSubtypeType = 'credit' | 'debit';

export default function PaymentTypeCreateScreen() {
  const COLOR_PICKER_PREWARM_MS = 220;
  const palette = colors.light;
  const router = useRouter();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [selectedType, setSelectedType] = useState<PaymentSubtypeType>('credit');
  const [color, setColor] = useState<string>('#3664CE');

  const [isColorPickerMounted, setIsColorPickerMounted] = useState(false);
  const [isColorPickerVisible, setIsColorPickerVisible] = useState(false);
  const [isColorPickerReady, setIsColorPickerReady] = useState(false);
  const [keyboardPaddingBottom, setKeyboardPaddingBottom] = useState(0);

  const colorPickerOpacity = useRef(new Animated.Value(0)).current;
  const colorPickerScale = useRef(new Animated.Value(0.94)).current;
  const openDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const descriptionSectionYRef = useRef(0);
  const descriptionSectionHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const isDescriptionFocusedRef = useRef(false);
  const latestKeyboardEndRef = useRef<KeyboardEvent['endCoordinates'] | null>(null);

  const scrollDescriptionAboveKeyboard = useCallback(
    (endCoordinates: KeyboardEvent['endCoordinates']) => {
      scrollScrollViewSectionAboveKeyboard({
        scrollViewRef,
        sectionYRef: descriptionSectionYRef,
        sectionHeightRef: descriptionSectionHeightRef,
        scrollYRef,
        keyboardEnd: endCoordinates,
        inputRef: descriptionInputRef,
      });
    },
    [],
  );

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        const paddingBottom = getDescriptionKeyboardScrollPaddingBottom(
          e.endCoordinates,
          insets.bottom,
        );
        latestKeyboardEndRef.current = e.endCoordinates;
        setKeyboardPaddingBottom(paddingBottom);
        if (Platform.OS === 'android' && isDescriptionFocusedRef.current) {
          scrollDescriptionAboveKeyboard(e.endCoordinates);
        }
      }
    );
    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      (e) => {
        setKeyboardPaddingBottom(0);
        latestKeyboardEndRef.current = null;
      }
    );
    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [insets.bottom, scrollDescriptionAboveKeyboard]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const openColorPicker = useCallback(() => {
    Keyboard.dismiss();
    openDelayTimeoutRef.current && clearTimeout(openDelayTimeoutRef.current);
    openDelayTimeoutRef.current = null;
    setIsColorPickerMounted(true);
    setIsColorPickerReady(true);
    setIsColorPickerVisible(false);
    colorPickerOpacity.setValue(0);
    colorPickerScale.setValue(0.94);
    const keyboardCloseDelay = keyboardPaddingBottom > 0 ? 220 : 0;
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
  }, [COLOR_PICKER_PREWARM_MS, colorPickerOpacity, colorPickerScale, keyboardPaddingBottom]);

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
    isDescriptionFocusedRef.current = true;

    if (Platform.OS === 'android') {
      if (latestKeyboardEndRef.current?.height) {
        scrollDescriptionAboveKeyboard(latestKeyboardEndRef.current);
      }
      return;
    }

    setTimeout(() => {
      const targetY = descriptionSectionYRef.current;
      if (targetY > 0) {
        const windowHeight = Dimensions.get('window').height;
        const keyboardAwareOffset = windowHeight * 0.3;
        const scrollY = Math.max(0, targetY - keyboardAwareOffset);
        scrollViewRef.current?.scrollTo({
          y: scrollY,
          animated: true,
        });
        scrollYRef.current = scrollY;
      }
    }, 220);
  }, [closeColorPicker, scrollDescriptionAboveKeyboard]);

  const handleDescriptionBlur = useCallback(() => {
    isDescriptionFocusedRef.current = false;
  }, []);

  const handleCreate = useCallback(async () => {
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

    try {
      // 저장 직전 최신 데이터를 다시 읽어 stale state 덮어쓰기 방지
      const latestSubtypes = await loadPaymentSubtypes({ forceStorage: true });

      const isDuplicate = latestSubtypes.some(
        (item) => item.type === selectedType && item.label === trimmedLabel
      );
      if (isDuplicate) {
        showToast('이미 존재하는 결제 유형 이름입니다.');
        return;
      }

      const nextSubtypes = [
        ...latestSubtypes,
        {
          id: ulid(),
          type: selectedType,
          label: trimmedLabel,
          description: trimmedDescription,
          color,
        },
      ];

      await savePaymentSubtypes(nextSubtypes);
      router.back();
    } catch (error) {
      console.error('결제 유형 생성 실패:', error);
      showToast('결제 유형 생성에 실패했습니다.');
    }
  }, [color, description, label, router, selectedType, showToast]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: palette.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="dark-content" />

      <TopNavigation type="sub" title="결제 유형 생성" showLeftIcon onLeftIconPress={handleBack} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={[styles.content, { backgroundColor: palette.fill }]}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              keyboardPaddingBottom > 0 ? { paddingBottom: keyboardPaddingBottom } : undefined,
            ]}
            keyboardShouldPersistTaps="handled"
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.colorSection}>
              <Pressable
                onPress={handleToggleColorPicker}
                style={[styles.colorCircle, { backgroundColor: color, borderColor: palette.border }]}
                accessibilityRole="button"
                accessibilityLabel="결제 유형 색상 선택"
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: palette.text }]}>
                결제 유형 이름{' '}
                <Text style={{ color: palette.statusNegative }} accessibilityLabel="필수">
                  *
                </Text>
              </Text>
              <Input
                value={label}
                onChangeText={setLabel}
                placeholder="이름 입력"
                autoFocus={false}
                maxLength={10}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: palette.text }]}>
                결제 유형{' '}
                <Text style={{ color: palette.statusNegative }} accessibilityLabel="필수">
                  *
                </Text>
              </Text>
              <View style={styles.radioRow}>
                <View style={styles.radioCol}>
                  <Radio
                    checked={selectedType === 'credit'}
                    label="신용카드"
                    onPress={() => setSelectedType('credit')}
                  />
                </View>
                <View style={styles.radioCol}>
                  <Radio
                    checked={selectedType === 'debit'}
                    label="체크카드"
                    onPress={() => setSelectedType('debit')}
                  />
                </View>
              </View>
            </View>

            <View
              style={styles.section}
              onLayout={(event) => {
                const layout = event.nativeEvent.layout;
                descriptionSectionYRef.current = layout.y;
                descriptionSectionHeightRef.current = layout.height;
              }}
            >
              <Text style={[styles.label, { color: palette.text }]}>설명</Text>
              <Input
                ref={descriptionInputRef}
                variant="area"
                value={description}
                onChangeText={setDescription}
                onFocus={handleDescriptionFocus}
                onBlur={handleDescriptionBlur}
                placeholder="설명을 입력해 주세요.(최대 20자)"
                maxLength={20}
              />
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
                    backgroundColor: atomicColors.neutral[100],
                    borderColor: palette.border,
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

      <View style={[styles.bottomButtonContainer, { backgroundColor: palette.staticWhite }]}>
        <Button onPress={handleCreate}>생성</Button>
      </View>
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
  colorPicker: { width: '100%' },
  colorPanel: { width: '100%', height: 220, borderRadius: 12 },
  hueSlider: { width: '100%', height: 36, marginTop: 12, borderRadius: 12 },

  section: {
    marginBottom: 32,
    gap: 8,
  },
  label: { ...typographyLayout.uiLineBody01Bold },
  radioRow: { flexDirection: 'row', alignItems: 'center' },
  radioCol: { flex: 1, alignItems: 'flex-start' },
});

