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

import { colors, type ColorPalette } from '@/constants/theme';
import { atomicColors } from '@/constants/atomic-colors';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getAndroidNavigationBarInset,
  getIosSystemBottomInset,
} from '@/components/ui/custom-keypad-overlay';
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import {
  EdgeInsets,
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { ToastHost } from '@/contexts/toast-context';
import { Icon } from './icon';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.8;
const SHEET_DISMISS_HEIGHT = SCREEN_HEIGHT * 0.5;
const SHEET_NAV_HEIGHT = 56;
const SHEET_HEIGHT_ANIMATION_DURATION = 180;
const SHEET_PRESENTATION_ANIMATION_DURATION = 300;

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
   * content: ModalBottomsheet owns height, measuring content and animating to fit each depth.
   * fixed: keep caller-provided height/maxHeight or natural wrap-content behavior.
   */
  sizing?: 'content' | 'fixed';
  /** Show the visual grabber without changing sheet sizing behavior. */
  showHandle?: boolean | 'auto';
  /** Allow the grabber to resize the sheet between 31% and 80%; below 30% dismisses. */
  resizable?: boolean;
  /** sheet: drag the whole sheet down. resize: resize the sheet height. */
  dragBehavior?: 'resize' | 'sheet';
  /**
   * Skip shell bottom inset. Use when children handle iOS home indicator / Android nav (see category emoji picker).
   */
  noPaddingBottom?: boolean;
  /** Render inside parent Modal (ModalPopup extraOverlay). */
  embedded?: boolean;
  /** zIndex for embedded sheet host. Use higher values for nested sheets. */
  embeddedZIndex?: number;
  /** Hide the sheet backdrop when the parent layer already owns dimming. */
  showBackdrop?: boolean;
  /** Use a back arrow in the navigation left slot instead of the close icon. */
  navigationLeftIcon?: 'close' | 'back';
  /** Hide built-in navigation so callers can animate their own screen-level navigation. */
  hideNavigation?: boolean;
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
  sizing,
  showHandle = 'auto',
  resizable = false,
  dragBehavior = 'resize',
  noPaddingBottom = false,
  embedded = false,
  showBackdrop = true,
  navigationLeftIcon = 'close',
  hideNavigation = false,
}: ModalBottomsheetProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const insets = useSafeAreaInsets();
  const sheetBottomPadding = getSheetContainerBottomPadding(noPaddingBottom, insets);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentContent, setCurrentContent] = useState<ReactNode>(null);
  const [currentTitle, setCurrentTitle] = useState(title);
  const [measuredSheetHeight, setMeasuredSheetHeight] = useState<number | null>(null);

  const dimOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetHeight = useRef(new Animated.Value(0)).current;
  const sheetHeightValueRef = useRef(0);
  const dragStartHeightRef = useRef(0);
  const visibleRef = useRef(visible);
  const wasVisibleForContentRef = useRef(visible);
  const latestVisibleContentRef = useRef<ReactNode>(children);
  /** True while exit animation runs before parent `onClose` / `visible={false}`. */
  const isDismissingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onConfirmRef = useRef(onConfirm);
  onCloseRef.current = onClose;
  onConfirmRef.current = onConfirm;

  const flattenedStyle = StyleSheet.flatten(style);
  const numericStyleHeight = typeof flattenedStyle?.height === 'number' ? flattenedStyle.height : undefined;
  const numericStyleMaxHeight = typeof flattenedStyle?.maxHeight === 'number' ? flattenedStyle.maxHeight : undefined;
  const resolvedSizing = sizing ?? 'fixed';
  const usesMeasuredHeight = resolvedSizing === 'content';
  const usesControlledHeight = resizable || usesMeasuredHeight;
  const usesSheetDrag = resizable && dragBehavior === 'sheet';
  const usesFlexibleContent =
    typeof numericStyleHeight === 'number' || (usesMeasuredHeight && measuredSheetHeight !== null);
  const hasHandle =
    showHandle === true ||
    (showHandle === 'auto' &&
      (usesMeasuredHeight ||
        (typeof numericStyleHeight === 'number' && numericStyleHeight >= SHEET_MAX_HEIGHT - 1) ||
        (typeof numericStyleMaxHeight === 'number' && numericStyleMaxHeight >= SHEET_MAX_HEIGHT - 1)));
  const initialSheetHeight = Math.min(numericStyleHeight ?? numericStyleMaxHeight ?? SHEET_MAX_HEIGHT, SHEET_MAX_HEIGHT);
  const sheetStyle = usesControlledHeight ? { ...style, height: undefined, maxHeight: undefined } : style;

  if (visible) {
    latestVisibleContentRef.current = children;
  }

  useEffect(() => {
    const id = sheetHeight.addListener(({ value }) => {
      sheetHeightValueRef.current = value;
    });
    return () => sheetHeight.removeListener(id);
  }, [sheetHeight]);

  const animateSheetHeight = useCallback((toValue: number, duration = SHEET_HEIGHT_ANIMATION_DURATION) => {
    Animated.timing(sheetHeight, {
      toValue,
      duration,
      useNativeDriver: false,
    }).start();
  }, [sheetHeight]);

  const runCloseAnimation = useCallback(
    (after?: () => void) => {
      if (isDismissingRef.current) {
        return;
      }
      isDismissingRef.current = true;

      dimOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      sheetHeight.stopAnimation();

      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: SCREEN_HEIGHT,
          duration: SHEET_PRESENTATION_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: SHEET_PRESENTATION_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) {
          isDismissingRef.current = false;
          return;
        }
        if (!embedded) {
          setIsModalVisible(false);
        }
        setCurrentContent(null);
        after?.();
      });
    },
    [dimOpacity, embedded, sheetHeight, sheetTranslateY],
  );

  const requestClose = useCallback(() => {
    runCloseAnimation(() => {
      onCloseRef.current();
    });
  }, [runCloseAnimation]);

  const requestConfirm = useCallback(() => {
    if (!onConfirmRef.current) {
      return;
    }
    runCloseAnimation(() => {
      onConfirmRef.current?.();
    });
  }, [runCloseAnimation]);

  const handleMeasuredSheetLayout = useCallback((event: LayoutChangeEvent) => {
    if (!usesMeasuredHeight || !visible) {
      return;
    }

    const nextHeight = Math.min(event.nativeEvent.layout.height, SHEET_MAX_HEIGHT);
    if (nextHeight <= 0) {
      return;
    }

    setMeasuredSheetHeight((prevHeight) => {
      if (prevHeight === null) {
        sheetHeight.setValue(nextHeight);
        return nextHeight;
      }

      if (Math.abs(prevHeight - nextHeight) < 1) {
        return prevHeight;
      }

      animateSheetHeight(nextHeight);
      return nextHeight;
    });
  }, [animateSheetHeight, sheetHeight, usesMeasuredHeight, visible]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => resizable && !isDismissingRef.current,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          resizable &&
          !isDismissingRef.current &&
          Math.abs(gestureState.dy) > 4 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderGrant: () => {
          if (usesSheetDrag) {
            sheetTranslateY.stopAnimation();
            return;
          }
          sheetHeight.stopAnimation((value) => {
            const nextValue = typeof value === 'number' && value > 0 ? value : initialSheetHeight;
            sheetHeightValueRef.current = nextValue;
            dragStartHeightRef.current = nextValue;
          });
        },
        onPanResponderMove: (_, gestureState) => {
          if (usesSheetDrag) {
            sheetTranslateY.setValue(Math.max(0, gestureState.dy));
            return;
          }
          const dragStartHeight = dragStartHeightRef.current || sheetHeightValueRef.current || initialSheetHeight;
          const nextHeight = Math.max(0, Math.min(SHEET_MAX_HEIGHT, dragStartHeight - gestureState.dy));
          sheetHeightValueRef.current = nextHeight;
          sheetHeight.setValue(nextHeight);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (usesSheetDrag) {
            if (gestureState.dy >= initialSheetHeight * 0.5 || gestureState.vy > 1.2) {
              requestClose();
              return;
            }
            Animated.timing(sheetTranslateY, {
              toValue: 0,
              duration: SHEET_HEIGHT_ANIMATION_DURATION,
              useNativeDriver: true,
            }).start();
            return;
          }
          const currentHeight = sheetHeightValueRef.current;
          if (gestureState.dy > 0 && currentHeight <= SHEET_DISMISS_HEIGHT) {
            requestClose();
            return;
          }
          animateSheetHeight(initialSheetHeight);
        },
        onPanResponderTerminate: () => {
          if (usesSheetDrag) {
            Animated.timing(sheetTranslateY, {
              toValue: 0,
              duration: SHEET_HEIGHT_ANIMATION_DURATION,
              useNativeDriver: true,
            }).start();
            return;
          }
          animateSheetHeight(initialSheetHeight);
        },
      }),
    [animateSheetHeight, initialSheetHeight, requestClose, resizable, sheetHeight, sheetTranslateY, usesSheetDrag]
  );

  useEffect(() => {
    visibleRef.current = visible;

    if (visible) {
      isDismissingRef.current = false;
      if (!embedded) {
        setIsModalVisible(true);
      }

      dimOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      sheetHeight.stopAnimation();
      dimOpacity.setValue(0);
      sheetTranslateY.setValue(SCREEN_HEIGHT);
      if (usesMeasuredHeight) {
        setMeasuredSheetHeight(null);
      }
      if (resizable) {
        sheetHeight.setValue(initialSheetHeight);
      }

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(dimOpacity, {
            toValue: 1,
            duration: SHEET_PRESENTATION_ANIMATION_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(sheetTranslateY, {
            toValue: 0,
            duration: SHEET_PRESENTATION_ANIMATION_DURATION,
            useNativeDriver: true,
          }),
        ]).start();
      });
    } else if (isDismissingRef.current) {
      // Exit animation already ran via requestClose / requestConfirm.
      isDismissingRef.current = false;
      if (!embedded) {
        setIsModalVisible(false);
      }
      setCurrentContent(null);
    } else {
      dimOpacity.stopAnimation();
      sheetTranslateY.stopAnimation();
      sheetHeight.stopAnimation();
      Animated.parallel([
        Animated.timing(sheetTranslateY, {
          toValue: SCREEN_HEIGHT,
          duration: SHEET_PRESENTATION_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: SHEET_PRESENTATION_ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (!embedded && !visibleRef.current) {
          setIsModalVisible(false);
        }
        if (!visibleRef.current) {
          setCurrentContent(null);
        }
      });
    }
  }, [
    visible,
    embedded,
    dimOpacity,
    initialSheetHeight,
    resizable,
    sheetHeight,
    sheetTranslateY,
    usesMeasuredHeight,
  ]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setCurrentTitle(title);
  }, [title, visible]);

  useEffect(() => {
    if (wasVisibleForContentRef.current && !visible) {
      setCurrentContent(latestVisibleContentRef.current);
    }
    wasVisibleForContentRef.current = visible;
  }, [visible]);

  const handleBackdropPress = () => {
    if (closeOnBackdrop) {
      requestClose();
    }
  };

  useEffect(() => {
    if (!embedded || !visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      requestClose();
      return true;
    });

    return () => subscription.remove();
  }, [embedded, visible, requestClose]);

  const sheetBodyContent = (
    <View
      style={[styles.sheet, usesControlledHeight ? styles.controlledSheet : null, sheetStyle]}
      onLayout={handleMeasuredSheetLayout}
    >
      {!hideNavigation ? (
        <View style={styles.navigation}>
          {hasHandle ? (
            <View
              style={styles.grabberTouchArea}
              pointerEvents="box-none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <View
                style={styles.grabberTouchTarget}
                {...(resizable ? panResponder.panHandlers : null)}
              >
                <View style={styles.grabber} />
              </View>
            </View>
          ) : null}
          <View style={styles.navContent}>
            <View style={styles.navLeft}>
              <Pressable
                onPress={requestClose}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel={navigationLeftIcon === 'back' ? '이전' : '닫기'}
              >
                <Icon name={navigationLeftIcon === 'back' ? 'arrowLeft' : 'close'} size={24} color={palette.text} />
              </Pressable>
            </View>
            <View style={styles.titleContainer}>
              <Text style={[styles.title, { color: palette.text }]}>{currentTitle}</Text>
            </View>
            <View style={styles.navRight}>
              {onConfirm ? (
                <Pressable
                  onPress={requestConfirm}
                  style={[styles.confirmButton, { backgroundColor: palette.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={confirmText}
                >
                  <Text style={[styles.confirmText, { color: palette.staticWhite }]}>
                    {confirmText}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.emptySpace} />
              )}
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
        </View>
      ) : null}
      <View
        style={[
          styles.content,
          usesFlexibleContent ? styles.flexibleContent : null,
          usesMeasuredHeight ? styles.measuredContent : null,
          contentStyle,
        ]}
      >
        {visible ? children : currentContent ?? latestVisibleContentRef.current}
      </View>
      {hideNavigation && hasHandle && resizable ? (
        <View
          style={styles.grabberGestureOverlay}
          pointerEvents="box-only"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          {...panResponder.panHandlers}
        />
      ) : null}
    </View>
  );

  const sheetBody = resizable ? (
    <Animated.View style={{ height: sheetHeight }}>{sheetBodyContent}</Animated.View>
  ) : usesMeasuredHeight && measuredSheetHeight !== null ? (
    <Animated.View style={{ height: sheetHeight }}>{sheetBodyContent}</Animated.View>
  ) : (
    sheetBodyContent
  );

  const sheetChrome = (
    <>
      <Animated.View
        style={[
          styles.backdrop,
          showBackdrop ? { backgroundColor: palette.overlayDim, opacity: dimOpacity } : styles.transparentBackdrop,
          embedded ? { zIndex: 100001 } : null,
        ]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
      </Animated.View>

      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY: sheetTranslateY }],
            backgroundColor: palette.staticWhite,
            paddingBottom: sheetBottomPadding,
            ...(embedded ? { zIndex: 100002 } : null),
          },
        ]}
        pointerEvents={embedded ? (visible ? 'auto' : 'none') : undefined}
      >
        {sheetBody}
      </Animated.View>
      {visible ? <ToastHost /> : null}
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
      onRequestClose={requestClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
    >
      <SafeAreaProvider style={styles.insetProviderModal}>{sheetChrome}</SafeAreaProvider>
    </Modal>
  );
}

/**
 * Modal Bottomsheet — embedded overlays get SafeAreaProvider at the root (parent Modal window).
 *
 * Android: elevation on an absoluteFill host steals touches even when `pointerEvents="none"`
 * (notably RNCSafeAreaProvider). Keep elevation only while visible, and gate hits on a plain View.
 */
export function ModalBottomsheet(props: ModalBottomsheetProps) {
  if (props.embedded) {
    const embeddedZIndex = props.embeddedZIndex ?? 100000;
    const hostPointerEvents = props.visible ? 'box-none' : 'none';

    return (
      <View
        collapsable={false}
        pointerEvents={hostPointerEvents}
        style={[
          styles.insetProviderOverlay,
          props.visible
            ? { zIndex: embeddedZIndex, elevation: embeddedZIndex }
            : styles.insetProviderOverlayHidden,
        ]}
      >
        <SafeAreaProvider
          initialMetrics={initialWindowMetrics}
          style={styles.insetProviderModal}
          pointerEvents={hostPointerEvents}
        >
          <ModalBottomsheetContent {...props} embedded />
        </SafeAreaProvider>
      </View>
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
  // Nested SafeAreaProvider can report bottom=0 on Android; fall back to window metrics.
  const bottom =
    insets.bottom > 0 ? insets.bottom : (initialWindowMetrics?.insets.bottom ?? 0);
  const height =
    getAndroidNavigationBarInset({ bottom }) +
    (Platform.OS === 'ios' ? Math.max(bottom, 34) : 0);

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
  /** Hidden embedded host: stay mounted for close animation, but do not stack/steal Android touches. */
  insetProviderOverlayHidden: {
    zIndex: 0,
    elevation: 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  transparentBackdrop: {
    backgroundColor: 'transparent',
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
    maxHeight: SHEET_MAX_HEIGHT,
  },
  grabberTouchArea: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  grabberTouchTarget: {
    width: 96,
    height: 44,
    paddingTop: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  grabberGestureOverlay: {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: 96,
    height: 52,
    marginLeft: -48,
    zIndex: 20,
  },
  grabber: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: atomicColors.neutral[300],
  },
  navigation: {},
  navContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: SHEET_NAV_HEIGHT,
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
    ...typographyLayout.uiLineBody01Bold,
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
    ...typographyLayout.uiLineButton02Medium,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  content: {
    padding: 16,
  },
  controlledSheet: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  flexibleContent: {
    flex: 1,
    minHeight: 0,
  },
  measuredContent: {
    maxHeight: SHEET_MAX_HEIGHT - SHEET_NAV_HEIGHT,
  },
});
