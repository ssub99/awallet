import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PasswordChangeScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [koreanError, setKoreanError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 한글 입력 체크
  const hasKorean = (text: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);

  // 공백 제거
  const removeSpaces = (text: string) => text.replace(/\s/g, '');

  const validatePassword = (password: string) => {
    // 8-16자 길이 체크
    if (password.length < 8 || password.length > 16) {
      return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    }
    
    // 대문자 체크
    if (!/[A-Z]/.test(password)) {
      return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    }
    
    // 소문자 체크
    if (!/[a-z]/.test(password)) {
      return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    }
    
    // 숫자 체크
    if (!/[0-9]/.test(password)) {
      return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    }
    
    // 특수문자 체크
    const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
    if (!specialCharRegex.test(password)) {
      return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    }
    
    return '';
  };

  const validateConfirmPassword = (confirm: string) => {
    if (confirm !== newPassword) {
      return '비밀번호가 일치하지 않습니다.';
    }
    return '';
  };

  // 5분 타이머 설정
  const startTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    timerRef.current = setTimeout(() => {
      setIsExpired(true);
      setShowExpiredModal(true);
    }, 5 * 60 * 1000); // 5분
  };

  // 5분 타이머 시작 (백그라운드에서도 유지)
  useEffect(() => {
    // 컴포넌트 마운트 시 타이머 시작
    startTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const canSubmit = newPassword.trim().length > 0 && 
                   confirmPassword.trim().length > 0 && 
                   !newPasswordError && 
                   !confirmPasswordError &&
                   !koreanError &&
                   !isExpired;

  const handleNewPasswordChange = (value: string) => {
    // 공백 제거
    const cleanValue = removeSpaces(value);
    
    // 한글 체크
    if (hasKorean(cleanValue)) {
      setKoreanError('한글은 입력할 수 없습니다.');
      return; // 한글이면 입력값을 받지 않음
    } else {
      setKoreanError('');
    }
    
    // 16자 제한
    const limitedValue = cleanValue.slice(0, 16);
    setNewPassword(limitedValue);
    
    // 새 비밀번호가 변경되면 확인 비밀번호도 다시 검증
    if (confirmPassword.trim().length > 0) {
      setConfirmPasswordError(validateConfirmPassword(confirmPassword));
    }
  };

  const handleConfirmPasswordChange = (value: string) => {
    // 공백 제거
    const cleanValue = removeSpaces(value);
    
    // 한글 체크
    if (hasKorean(cleanValue)) {
      setKoreanError('한글은 입력할 수 없습니다.');
      return; // 한글이면 입력값을 받지 않음
    } else {
      setKoreanError('');
    }
    
    // 16자 제한
    const limitedValue = cleanValue.slice(0, 16);
    setConfirmPassword(limitedValue);
  };

  const handleSubmit = () => {
    // 모든 에러 상태 초기화
    setNewPasswordError('');
    setConfirmPasswordError('');
    setKoreanError('');
    
    // 4번: 비밀번호 유효성 검사
    const passwordValidation = validatePassword(newPassword);
    if (passwordValidation) {
      setNewPasswordError(passwordValidation);
      return;
    }
    
    // 5번: 비밀번호 일치 확인
    const confirmValidation = validateConfirmPassword(confirmPassword);
    if (confirmValidation) {
      setConfirmPasswordError(confirmValidation);
      return;
    }
    
    // 6번: 기존 비밀번호와 동일한지 체크 (임시로 하드코딩)
    // TODO: 실제 기존 비밀번호와 비교
    const existingPassword = 'OldPassword123!'; // 임시
    if (newPassword === existingPassword) {
      setNewPasswordError('기존 비밀번호와 동일합니다.');
      return;
    }
    
    // 모든 검증 통과 시
    // TODO: 서버에 비밀번호 변경 요청
    console.log('비밀번호 변경 요청:', { newPassword });
    
    // 성공 시 로그인 화면으로 이동
    router.replace('/login');
  };

  const handleExpiredModalClose = () => {
    setShowExpiredModal(false);
    // 계정 확인 화면으로 이동
    router.replace('/account-verify');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.background }]} 
        edges={['top','bottom']}
      >
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Top Navigation */}
        <View style={[styles.topNavigation, { backgroundColor: colors.background }]}>
          <View style={styles.topNavigationContent}>
            <Pressable
              style={styles.backButton}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
            >
              <Icon name="arrowLeft" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.pageTitle, { color: colors.text }]}>비밀번호 변경</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={undefined}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
              {/* Subtitle */}
              <Text style={[styles.subtitle, { color: colors.text }]}>
                인증이 완료되었습니다.{Platform.OS === 'ios' ? '\n' : '\n'}비밀번호를 변경해 주세요.
              </Text>

              {/* Input Fields Container */}
              <View style={styles.inputContainer}>
                <Input
                  placeholder="새 비밀번호 입력"
                  value={newPassword}
                  onChangeText={handleNewPasswordChange}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={16}
                  accessibilityLabel="새 비밀번호 입력"
                />
                <Input
                  placeholder="새 비밀번호 입력 확인"
                  value={confirmPassword}
                  onChangeText={handleConfirmPasswordChange}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={16}
                  accessibilityLabel="새 비밀번호 입력 확인"
                />
                {(koreanError || newPasswordError || confirmPasswordError) ? (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                    {koreanError || newPasswordError || confirmPasswordError}
                  </Text>
                ) : null}
              </View>

              {/* Password Requirements box removed as validation is enforced in logic */}
            </View>
          </ScrollView>

          {/* Bottom fixed button */}
          <View style={[styles.bottomContainer, { backgroundColor: colors.background }]}>
            <Button onPress={handleSubmit} disabled={!canSubmit}>
              확인
            </Button>
          </View>
        </KeyboardAvoidingView>

        {/* 인증 만료 모달 */}
        <Modal
          visible={showExpiredModal}
          transparent
          animationType="fade"
          onRequestClose={handleExpiredModalClose}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: colors.staticWhite }]}>
              <View style={styles.modalContent}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  인증이 만료되었습니다.
                </Text>
                <Text style={[styles.modalMessage, { color: colors.textNeutral }]}>
                  처음부터 다시 진행해 주세요.
                </Text>
              </View>
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, { backgroundColor: colors.primary }]}
                  onPress={handleExpiredModalClose}
                  accessibilityRole="button"
                  accessibilityLabel="확인"
                >
                  <Text style={[styles.modalButtonText, { color: colors.staticWhite }]}>
                    확인
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNavigation: { height: 56 },
  topNavigationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { ...Typography.body1.l.bold },
  placeholder: { width: 32, height: 32 },
  divider: { height: StyleSheet.hairlineWidth, opacity: 0.16 },
  keyboardAvoidingView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  mainContent: { flex: 1, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, gap: 24 },
  subtitle: { ...Typography.headline4.r.bold },
  inputContainer: { gap: 8 },
  errorText: { ...Typography.body2.r.regular, marginTop: 0 },
  bottomContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalContainer: {
    borderRadius: 24,
    width: '100%',
    maxWidth: 343,
    overflow: 'hidden',
  },
  modalContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: 'center',
  },
  modalTitle: {
    ...Typography.headline4.r.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalMessage: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalButtons: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  modalButton: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonText: {
    ...Typography.body1.l.medium,
  },
});
