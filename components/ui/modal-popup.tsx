/**
 * Modal Popup Component
 * 
 * A flexible modal popup component matching Figma design system.
 * Supports custom content via children prop for maximum flexibility.
 */

import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ReactNode, useEffect, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from 'react-native';

export interface ModalPopupProps {
  /**
   * Modal visibility
   */
  visible: boolean;
  
  /**
   * Modal title (optional)
   */
  title?: string;
  
  /**
   * Modal content (flexible via children)
   */
  children?: ReactNode;
  
  /**
   * Simple message text (alternative to children)
   */
  message?: string;
  
  /**
   * Confirm button text
   */
  confirmText?: string;
  
  /**
   * Confirm button handler
   */
  onConfirm?: () => void;
  
  /**
   * Cancel button text (if provided, shows 2-button layout)
   */
  cancelText?: string;
  
  /**
   * Cancel button handler
   */
  onCancel?: () => void;
  
  /**
   * Close modal on backdrop press
   */
  closeOnBackdrop?: boolean;
  
  /**
   * Container style
   */
  style?: ViewStyle;
}

/**
 * Modal Popup Component with flexible content
 */
export function ModalPopup({
  visible,
  title,
  children,
  message,
  confirmText = '확인',
  onConfirm,
  cancelText,
  onCancel,
  closeOnBackdrop = true,
  style,
}: ModalPopupProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;
  
  // Animation values
  const dimOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.9)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  // Animate modal open/close
  useEffect(() => {
    if (visible) {
      dimOpacity.setValue(0);
      modalScale.setValue(0.9);
      modalOpacity.setValue(0);
      
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          tension: 100,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dimOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(modalScale, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(modalOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, dimOpacity, modalScale, modalOpacity]);

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  const handleBackdropPress = () => {
    if (closeOnBackdrop && onCancel) {
      onCancel();
    }
  };

  // Check if it's a 2-button layout (Confirm) or 1-button layout (Alert)
  const isTwoButtonLayout = !!cancelText;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      presentationStyle="overFullScreen"
      statusBarTranslucent={true}
    >
      {/* Dim Backdrop */}
      <Animated.View
        style={[
          styles.backdrop,
          { opacity: dimOpacity }
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleBackdropPress}
        />
      </Animated.View>

      {/* Modal Content */}
      <View style={styles.container}>
        <Animated.View
          style={[
            styles.modal,
            {
              backgroundColor: colors.staticWhite,
              opacity: modalOpacity,
              transform: [{ scale: modalScale }],
            },
            style,
          ]}
        >
          {/* Title (Optional) */}
          {title && (
            <Text style={[styles.title, { color: colors.text }]}>
              {title}
            </Text>
          )}

          {/* Content (Flexible via children or message) */}
          <View style={[styles.content, !title && styles.contentNoTitle]}>
            {message ? (
              <Text style={[styles.message, { color: colors.text }]}>
                {message}
              </Text>
            ) : (
              children
            )}
          </View>

          {/* Buttons */}
          <View style={styles.buttons}>
            {isTwoButtonLayout ? (
              <>
                {/* 2-Button Layout (Confirm) */}
                <Pressable
                  onPress={handleCancel}
                  style={[styles.button, styles.buttonHalf, { backgroundColor: colors.fill }]}
                >
                  <Text style={[styles.buttonText, { color: colors.textNeutral }]}>
                    {cancelText}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirm}
                  style={[styles.button, styles.buttonHalf, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.buttonText, { color: colors.staticWhite }]}>
                    {confirmText}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                {/* 1-Button Layout (Alert) */}
                <Pressable
                  onPress={handleConfirm}
                  style={[styles.button, styles.buttonFull, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.buttonText, { color: colors.staticWhite }]}>
                    {confirmText}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 99999,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    zIndex: 100000,
  },
  modal: {
    width: 343,
    borderRadius: 24,
    padding: 24,
  },
  title: {
    ...Typography.headline4.r.bold,
    textAlign: 'center',
    marginBottom: 16,
  },
  content: {
    marginBottom: 24,
  },
  contentNoTitle: {
    marginBottom: 24,
  },
  message: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonHalf: {
    flex: 1,
  },
  buttonFull: {
    width: '100%',
  },
  buttonText: {
    ...Typography.body1.l.medium,
  },
});

