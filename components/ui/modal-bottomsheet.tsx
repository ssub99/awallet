/**
 * Modal Bottomsheet Component
 * 
 * A bottom sheet modal with top navigation and flexible content.
 * Features smooth slide-up animation and dim backdrop like native picker.
 */

import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ReactNode, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewStyle
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icon';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface ModalBottomsheetProps {
  /**
   * Modal visibility
   */
  visible: boolean;
  
  /**
   * Sheet title
   */
  title: string;
  
  /**
   * Sheet content (flexible via children)
   */
  children: ReactNode;
  
  /**
   * Confirm button text
   */
  confirmText?: string;
  
  /**
   * Confirm button handler
   */
  onConfirm?: () => void;
  
  /**
   * Close/Cancel handler
   */
  onClose: () => void;
  
  /**
   * Close on backdrop press
   */
  closeOnBackdrop?: boolean;
  
  /**
   * Container style
   */
  style?: ViewStyle;
  
  /**
   * Content style (for overriding content padding)
   */
  contentStyle?: ViewStyle;
  
  /**
   * Disable bottom padding (insets.bottom)
   * Use when content handles home indicator internally
   */
  noPaddingBottom?: boolean;

  /**
   * Render as embedded overlay (no RN Modal). Use when inside another Modal.
   */
  embedded?: boolean;
}

/**
 * Modal Bottomsheet Component with flexible content
 */
export function ModalBottomsheet({
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
  
  // Internal state to control actual Modal visibility (Modal mode only)
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Store content to prevent flickering when switching between sheets
  const [currentContent, setCurrentContent] = useState<ReactNode>(null);
  const [currentTitle, setCurrentTitle] = useState(title);
  
  // Animation values
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Animate sheet open/close (like native picker)
  useEffect(() => {
    if (visible) {
      // Update content immediately when opening
      setCurrentContent(children);
      setCurrentTitle(title);
      
      // In modal mode, show modal first
      if (!embedded) {
      setIsModalVisible(true);
      }
      
      // Reset animation values immediately
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
      // Slide down, then fade dim
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
  }, [visible, title, embedded, dimOpacity, sheetTranslateY]);
  
  // Update content when children change (without triggering animation)
  useEffect(() => {
    if (visible) {
      setCurrentContent(children);
    }
  }, [children, visible]);

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  const handleBackdropPress = () => {
    if (closeOnBackdrop) {
      handleClose();
    }
  };

  if (embedded) {
    // Embedded render (no RN Modal)
    return (
      <>
        {/* Dim Backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: dimOpacity, zIndex: 100001 },
          ]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
        </Animated.View>

        {/* Bottomsheet */}
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              transform: [{ translateY: sheetTranslateY }],
              backgroundColor: colors.staticWhite,
              paddingBottom: noPaddingBottom ? 0 : insets.bottom,
              // Ensure overlay is above popup content when embedded
              zIndex: 100002,
            },
          ]}
          pointerEvents={visible ? 'auto' : 'none'}
        >
          <View style={[styles.sheet, style]}>
            <View style={styles.navigation}>
              <View style={styles.navContent}>
                <View style={styles.navLeft}>
                  <Pressable
                    onPress={handleClose}
                    style={styles.closeButton}
                    accessibilityRole="button"
                    accessibilityLabel="닫기"
                  >
                    <Icon name="close" size={24} color={colors.text} />
                  </Pressable>
                </View>
                <View style={styles.titleContainer}>
                  <Text style={[styles.title, { color: colors.text }]}>
                    {currentTitle}
                  </Text>
                </View>
                <View style={styles.navRight}>
                  {onConfirm ? (
                    <Pressable
                      onPress={handleConfirm}
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
            <View style={[styles.content, contentStyle]}>
              {currentContent}
            </View>
          </View>
        </Animated.View>
      </>
    );
  }

  // Modal render (default)
  return (
    <Modal
      visible={isModalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent={true}
    >
      <Animated.View style={[styles.backdrop, { opacity: dimOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheetContainer,
          {
            transform: [{ translateY: sheetTranslateY }],
            backgroundColor: colors.staticWhite,
            paddingBottom: noPaddingBottom ? 0 : insets.bottom,
          },
        ]}
      >
        <View style={[styles.sheet, style]}>
          <View style={styles.navigation}>
            <View style={styles.navContent}>
              <View style={styles.navLeft}>
                <Pressable
                  onPress={handleClose}
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="닫기"
                >
                  <Icon name="close" size={24} color={colors.text} />
                </Pressable>
              </View>
              <View style={styles.titleContainer}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {currentTitle}
                </Text>
              </View>
              <View style={styles.navRight}>
                {onConfirm ? (
                  <Pressable
                    onPress={handleConfirm}
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
          <View style={[styles.content, contentStyle]}>
            {currentContent}
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: SCREEN_HEIGHT * 0.9, // Max 90% of screen height
  },
  navigation: {
    // Top navigation section
  },
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

