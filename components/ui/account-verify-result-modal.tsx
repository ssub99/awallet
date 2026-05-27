/**
 * ID Find Result Modal Component
 * 
 * Modal popup for displaying found ID and registration date after successful verification.
 * Matches Figma design: [Awallet]Mypage_idfind_certified_result
 */

import { colors, type ColorPalette } from '@/constants/theme';
import { typography, typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useRef } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';

export interface AccountVerifyResultModalProps {
  /**
   * Modal visibility
   */
  visible: boolean;
  
  /**
   * Found user ID
   */
  userId: string;
  
  /**
   * Registration date
   */
  registrationDate: string;
  
  /**
   * Close modal handler
   */
  onClose: () => void;
  
  /**
   * Login button handler
   */
  onLogin: () => void;

  /**
   * Change password button handler
   */
  onChangePassword?: () => void;
}

/**
 * Account Verify Result Modal Component
 */
export function AccountVerifyResultModal({
  visible,
  userId,
  registrationDate,
  onClose,
  onLogin,
  onChangePassword,
}: AccountVerifyResultModalProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  
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

  const handleBackdropPress = () => {
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
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
              backgroundColor: palette.staticWhite,
              opacity: modalOpacity,
              transform: [{ scale: modalScale }],
            },
          ]}
        >
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={[styles.title, { color: palette.text }]}>
              계정 확인
            </Text>
            <Text style={[styles.subtitle, { color: palette.textNeutral }]}>
              입력하신 정보의 가입 내역은 아래와 같습니다.
            </Text>
          </View>

          {/* Info Section */}
          <View style={[styles.infoSection, { backgroundColor: palette.fill }]}>
            {/* ID Row */}
            <View style={styles.infoRow}>
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: palette.textNeutral }]}>
                  아이디
                </Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={[styles.value, { color: palette.text }]}>
                  {userId}
                </Text>
              </View>
            </View>

            {/* Registration Date Row */}
            <View style={styles.infoRow}>
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: palette.textNeutral }]}>
                  가입일
                </Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={[styles.value, { color: palette.text }]}>
                  {registrationDate}
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons: Change Password | Login */}
          <View style={styles.buttonsRow}>
            <Pressable
              onPress={onChangePassword}
              style={[styles.subButton, { backgroundColor: palette.fill }]}
              accessibilityRole="button"
              accessibilityLabel="비밀번호 변경"
            >
              <Text style={[styles.subButtonText, { color: palette.textNeutral }]}>비밀번호 변경</Text>
            </Pressable>
            <Pressable
              onPress={onLogin}
              style={[styles.mainButton, { backgroundColor: palette.primary }]}
              accessibilityRole="button"
              accessibilityLabel="로그인 하기"
            >
              <Text style={[styles.mainButtonText, { color: palette.staticWhite }]}>로그인 하기</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
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
  titleSection: {
    marginBottom: 24,
  },
  title: {
    ...typography.headline04.bold,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    ...typography.body01.regular,
    textAlign: 'center',
  },
  infoSection: {
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  labelContainer: {
    width: 42,
    marginRight: 0,
  },
  label: {
    ...typographyLayout.uiLineBody01Regular,
    textAlign: 'left',
  },
  valueContainer: {
    flex: 1,
  },
  value: {
    ...typographyLayout.uiLineBody01Medium,
    textAlign: 'left',
  },
  buttonSection: {
    // Button component handles its own styling
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  subButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 144,
  },
  subButtonText: {
    ...typographyLayout.uiLineBody01Medium,
  },
  mainButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 143,
  },
  mainButtonText: {
    ...typographyLayout.uiLineBody01Medium,
  },
});
