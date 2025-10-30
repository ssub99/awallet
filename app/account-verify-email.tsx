import { AccountVerifyResultModal } from '@/components/ui/account-verify-result-modal';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import OtpInputs from '@/components/ui/otp-inputs';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const OTP_TTL_MS = 3 * 60 * 1000; // 3분

export default function AccountVerifyEmailScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();

  const [displayEmail, setDisplayEmail] = useState<string>('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorBorder, setErrorBorder] = useState(false);
  const [isResendDisabled, setIsResendDisabled] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number>(Date.now() + OTP_TTL_MS);
  
  // Modal state
  const [showResultModal, setShowResultModal] = useState(false);
  const [foundUserId, setFoundUserId] = useState('');
  const [registrationDate, setRegistrationDate] = useState('');

  const handleBack = () => router.back();

  const handleChange = (value: string) => {
    setCode(value);
    if (value.length < 6) setErrorBorder(false);
  };

  useEffect(() => {
    const paramEmail = Array.isArray(params.email) ? params.email[0] : params.email;
    const decoded = paramEmail ? decodeURIComponent(paramEmail) : '';
    if (decoded) {
      setDisplayEmail(decoded);
      return;
    }
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('signupEmail');
        if (stored) setDisplayEmail(stored);
      } catch {}
    })();
  }, [params.email]);

  // 남은 시간은 고정 문구로 안내 (카운트다운 텍스트 미사용)

  const handleComplete = useCallback(async (value: string) => {
    if (Date.now() > expiresAt) {
      setError(true);
      setErrorMessage('인증번호가 만료되었습니다.');
      setErrorBorder(false);
      return;
    }

    try {
      // TODO: 서버 검증 연동
      const TEMP_VALID_CODE = '123456';
      const isValid = value === TEMP_VALID_CODE;
      if (!isValid) {
        setError(true);
        setErrorMessage('인증번호가 일치하지 않습니다.');
        setErrorBorder(true);
        return;
      }
      setError(false);
      setErrorMessage('');
      setErrorBorder(false);
      
      // TODO: 서버에서 실제 계정 정보와 가입일 조회
      // 임시: 사용자가 입력한 이메일을 계정으로 노출하여 본인 확인
      setFoundUserId(displayEmail);
      setRegistrationDate('2025.10.10');
      setShowResultModal(true);
    } catch {
      setError(true);
      setErrorMessage('인증번호가 일치하지 않습니다.');
      setErrorBorder(true);
    }
  }, [expiresAt, displayEmail]);

  const startCooldown = useCallback((seconds: number) => {
    setIsResendDisabled(true);
    setCooldown(seconds);
    const interval = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsResendDisabled(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleResend = () => {
    if (isResendDisabled) return;
    // TODO: 재전송 API 호출
    setExpiresAt(Date.now() + OTP_TTL_MS);
    setError(false);
    setErrorMessage('');
    setErrorBorder(false);
    startCooldown(60);
  };

  const canSubmit = code.length === 6 && !error;

  // Modal handlers
  const handleCloseModal = () => {
    setShowResultModal(false);
  };

  const handleLoginPress = () => {
    setShowResultModal(false);
    router.replace('/login');
  };

  const handleChangePasswordPress = () => {
    setShowResultModal(false);
    router.push('/password-change');
  };

  useEffect(() => {
    if (!isResendDisabled && cooldown === 0) {
      startCooldown(60);
    }
    setExpiresAt(Date.now() + OTP_TTL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getMaskedEmail = (email: string) => {
    if (!email || !email.includes('@')) return email;
    const [id, domain] = email.split('@');
    if (id.length <= 3) return email;
    const maskedId = id.slice(0, -3) + '***';
    return `${maskedId}@${domain}`;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top','bottom']}>
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

        {/* Top Navigation */}
        <View style={[styles.topNavigation, { backgroundColor: colors.background }]}>
          <View style={styles.topNavigationContent}>
            <Pressable
              style={styles.backButton}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
            >
              <Icon name="arrowLeft" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.pageTitle, { color: colors.text }]}>이메일 인증</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={undefined}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
              <View style={styles.titleGroup}>
                <Text style={[styles.title, { color: colors.text }]}>인증 코드를{"\n"}{getMaskedEmail(displayEmail)}로{"\n"}발송하였습니다.</Text>
                <Text style={[styles.remainingTime, { color: colors.textNeutral }]}>인증 코드는 3분 후 만료됩니다.</Text>
              </View>

              <View style={styles.otpArea}>
                <OtpInputs value={code} onChange={handleChange} onComplete={handleComplete} error={error} errorBorder={errorBorder} errorMessage={errorMessage || undefined} />
              </View>

              <View style={styles.resendArea}>
                <Pressable
                  onPress={handleResend}
                  disabled={isResendDisabled}
                  accessibilityRole="button"
                  accessibilityLabel="인증코드 재전송"
                  style={{ flexDirection: 'row', gap: 8 }}
                >
                  <Text style={[styles.resendPrefix, { color: colors.textNeutral, textDecorationLine: 'underline' }]}>코드를 받지 못하셨나요?</Text>
                  <Text style={[styles.resendText, { color: isResendDisabled ? colors.textAssistive : colors.primary }]}>
                    {isResendDisabled ? `재전송(${cooldown})` : '재전송'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.bottomContainer, { backgroundColor: colors.background }]}>
            <View style={styles.buttonSection}>
              <Button onPress={() => router.replace('/login')} disabled={!canSubmit}>
                확인
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Account Verify Result Modal */}
        <AccountVerifyResultModal
        visible={showResultModal}
        userId={foundUserId}
        registrationDate={registrationDate}
        onClose={handleCloseModal}
        onLogin={handleLoginPress}
        onChangePassword={handleChangePasswordPress}
      />
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
  mainContent: { flex: 1, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 },
  titleGroup: { marginBottom: 32 },
  title: { ...Typography.headline4.r.bold, lineHeight: 31.5, textAlign: 'center' },
  remainingTime: { ...Typography.body1.l.regular, textAlign: 'center', marginTop: 16 },
  otpArea: { alignItems: 'center', marginBottom: 0 },
  resendArea: { alignItems: 'center', marginTop: 'auto' },
  resendPrefix: { ...Typography.body1.l.medium },
  resendText: { ...Typography.body1.l.medium },
  buttonSection: {},
  bottomContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
});


