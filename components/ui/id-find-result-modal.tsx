/**
 * ID Find Result Modal Component
 * 
 * Modal popup for displaying found ID and registration date after successful verification.
 * Matches Figma design: [Awallet]Mypage_idfind_certified_result
 */

import { Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
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

export interface IdFindResultModalProps {
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
 * ID Find Result Modal Component
 */
export function IdFindResultModal({
  visible,
  userId,
  registrationDate,
  onClose,
  onLogin,
  onChangePassword,
}: IdFindResultModalProps) {
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
              backgroundColor: colors.staticWhite,
              opacity: modalOpacity,
              transform: [{ scale: modalScale }],
            },
          ]}
        >
          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={[styles.title, { color: colors.text }]}>
              계정 확인
            </Text>
            <Text style={[styles.subtitle, { color: colors.textNeutral }]}>
              입력하신 정보의 가입 내역은 아래와 같습니다.
            </Text>
          </View>

          {/* Info Section */}
          <View style={[styles.infoSection, { backgroundColor: colors.fill }]}>
            {/* ID Row */}
            <View style={styles.infoRow}>
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: colors.textNeutral }]}>
                  아이디
                </Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={[styles.value, { color: colors.text }]}>
                  {userId}
                </Text>
              </View>
            </View>

            {/* Registration Date Row */}
            <View style={styles.infoRow}>
              <View style={styles.labelContainer}>
                <Text style={[styles.label, { color: colors.textNeutral }]}>
                  가입일
                </Text>
              </View>
              <View style={styles.valueContainer}>
                <Text style={[styles.value, { color: colors.text }]}>
                  {registrationDate}
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons: Change Password | Login */}
          <View style={styles.buttonsRow}>
            <Pressable
              onPress={onChangePassword}
              style={[styles.subButton, { backgroundColor: colors.fill }]}
              accessibilityRole="button"
              accessibilityLabel="비밀번호 변경"
            >
              <Text style={[styles.subButtonText, { color: colors.textNeutral }]}>비밀번호 변경</Text>
            </Pressable>
            <Pressable
              onPress={onLogin}
              style={[styles.mainButton, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel="로그인 하기"
            >
              <Text style={[styles.mainButtonText, { color: colors.staticWhite }]}>로그인 하기</Text>
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
    ...Typography.headline4.r.bold,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    ...Typography.body1.l.regular,
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
    ...Typography.body1.l.regular,
    textAlign: 'left',
  },
  valueContainer: {
    flex: 1,
  },
  value: {
    ...Typography.body1.l.medium,
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
    ...Typography.body1.l.medium,
  },
  mainButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: 143,
  },
  mainButtonText: {
    ...Typography.body1.l.medium,
  },
});
