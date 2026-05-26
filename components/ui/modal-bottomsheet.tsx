/**
 * Modal Bottomsheet Component
 *
 * A bottom sheet modal with top navigation and flexible content.
 * Features smooth slide-up animation and dim backdrop like native picker.
 *
 * Bottom inset (same philosophy as CustomKeypadOverlay + CustomKeypad):
 * - Android: padding from native navigation bar inset (OS option / minimized state).
 * - iOS (default): native home-indicator inset on the sheet shell.
 * - iOS (noPaddingBottom): children reserve the zone (e.g. Figma 34px spacer), like CustomKeypad body.
 *
 * RN Modal is outside the app SafeAreaProvider — Provider below is required so insets subscribe to the modal window.
 */

import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getAndroidNavigationBarInset,
  getIosSystemBottomInset,
} from '@/components/ui/custom-keypad-overlay';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { EdgeInsets, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ToastHost } from '@/contexts/toast-context';
import { Icon } from './icon';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface ModalBottomsheetProps {
  visible: boolean;
  title: string;
  children: ReactNode;
  confirmText?: string;
  onConfirm?: () => void;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  /**
   * Skip shell bottom inset. Use when children handle iOS home indicator / Android nav (see category emoji picker).
   */
  noPaddingBottom?: boolean;
  /** Render inside parent Modal (ModalPopup extraOverlay). */
  embedded?: boolean;
}

function getSheetContainerBottomPadding(
  noPaddingBottom: boolean,
  insets: Pick<EdgeInsets, 'bottom'>,
): number {
  if (noPaddingBottom) {
    return 0;
  }
  return getAndroidNavigationBarInset(insets) + getIosSystemBottomInset(insets);
}

function ModalBottomsheetContent({
  visible,
  title,
  children,
  confirmText = '확인',
  onConfirm,
  onClose,
  closeOnBackdrop = true,
  style,
  contentStyle,
  noPaddingBottom = false,
  embedded = false,
}: ModalBottomsheetProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  const insets = useSafeAreaInsets();
  const sheetBottomPadding = getSheetContainerBottomPadding(noPaddingBottom, insets);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentContent, setCurrentContent] = useState<ReactNode>(null);
  const [currentTitle, setCurrentTitle] = useState(title);

  const dimOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      if (!embedded) {
        setIsModalVisible(true);
      }

      dimOpacity.setValue(0);
      sheetTranslateY.setValue(SCREEN_HEIGHT);

      requestAnimationFrame(() => {
        Animated.sequence([
          Animated.timing(dimOpacity, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(sheetTranslateY, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else {
      Animated.sequence([
        Animated.timing(sheetTranslateY, {
          toValue: SCREEN_HEIGHT,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!embedded) {
          setIsModalVisible(false);
        }
      });
    }
  }, [visible, embedded, dimOpacity, sheetTranslateY]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setCurrentContent(children);
  }, [children, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setCurrentTitle(title);
  }, [title, visible]);

  useEffect(() => {
    if (visible) {
      setCurrentContent(children);
    }
  }, [children, visible]);

  const handleBackdropPress = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  useEffect(() => {
    if (!embedded || !visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [embedded, visible, onClose]);

  const sheetBody = (
    <View style={[styles.sheet, style]}>
      <View style={styles.navigation}>
        <View style={styles.navContent}>
          <View style={styles.navLeft}>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="닫기"
            >
              <Icon name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.text }]}>{currentTitle}</Text>
          </View>
          <View style={styles.navRight}>
            {onConfirm ? (
              <Pressable
                onPress={onConfirm}
                style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                accessibilityRole="button"
                accessibilityLabel={confirmText}
              >
                <Text style={[styles.confirmText, { color: colors.staticWhite }]}>
                  {confirmText}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.emptySpace} />
            )}
          </View>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>
      <View style={[styles.content, contentStyle]}>{currentContent}</View>
    </View>
  );

  const sheetChrome = (
    <>
      <Animated.View
        style={[
          styles.backdrop,
          embedded ? { opacity: dimOpacity, zIndex: 100001 } : { opacity: dimOpacity },
        ]}
        pointerEvents={embedded ? (visible ? 'auto' : 'none') : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY: sheetTranslateY }],
            backgroundColor: colors.staticWhite,
            paddingBottom: sheetBottomPadding,
            ...(embedded ? { zIndex: 100002 } : null),
          },
        ]}
        pointerEvents={embedded ? (visible ? 'auto' : 'none') : undefined}
      >
        {sheetBody}
      </Animated.View>
      <ToastHost />
    </>
  );

  if (embedded) {
    return sheetChrome;
  }

  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <SafeAreaProvider style={styles.insetProviderModal}>{sheetChrome}</SafeAreaProvider>
    </Modal>
  );
}

/**
 * Modal Bottomsheet — embedded overlays get SafeAreaProvider at the root (parent Modal window).
 */
export function ModalBottomsheet(props: ModalBottomsheetProps) {
  if (props.embedded) {
    return (
      <SafeAreaProvider style={styles.insetProviderOverlay}>
        <ModalBottomsheetContent {...props} embedded />
      </SafeAreaProvider>
    );
  }

  return <ModalBottomsheetContent {...props} />;
}

export type ModalBottomsheetBottomInsetProps = {
  backgroundColor: string;
};

/**
 * `noPaddingBottom` 바텀시트 본문 맨 아래 OS safe area.
 * ModalBottomsheet(SafeAreaProvider) 자식에서만 사용 — Android nav / iOS home indicator(최소 34).
 */
export function ModalBottomsheetBottomInset({
  backgroundColor,
}: ModalBottomsheetBottomInsetProps) {
  const insets = useSafeAreaInsets();
  const height =
    getAndroidNavigationBarInset(insets) +
    (Platform.OS === 'ios' ? Math.max(insets.bottom, 34) : 0);

  if (height <= 0) {
    return null;
  }

  return (
    <View
      style={{
        marginHorizontal: -16,
        backgroundColor,
        height,
      }}
    />
  );
}

const styles = StyleSheet.create({
  insetProviderModal: {
    flex: 1,
  },
  insetProviderOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1000,
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    zIndex: 1001,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.8,
  },
  navigation: {},
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 16,
  },
  navLeft: {
    width: 80,
    alignItems: 'flex-start',
  },
  navRight: {
    width: 80,
    alignItems: 'flex-end',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    ...Typography.body1.l.bold,
  },
  confirmButton: {
    paddingHorizontal: 16,
    height: 32,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 48,
  },
  emptySpace: {
    width: 32,
    height: 32,
  },
  confirmText: {
    ...Typography.button2.r.medium,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  content: {
    padding: 16,
  },
});
