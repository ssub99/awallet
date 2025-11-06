import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { OtpInputs } from '@/components/ui/otp-inputs';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, isSupabaseConfigured } from '@/utils/supabase-client';

const OTP_TTL_MS = 3 * 60 * 1000; // 3분

export default function EmailVerifyScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [displayEmail, setDisplayEmail] = useState<string>('');

  const [code, setCode] = useState('');
  const [error, setError] = useState(false); // caption control
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorBorder, setErrorBorder] = useState(false); // border highlight control
  const [isResendDisabled, setIsResendDisabled] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiresAt, setExpiresAt] = useState<number>(Date.now() + OTP_TTL_MS);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/mypage');
    }
  };

  const handleChange = (value: string) => {
    setCode(value);
    // 입력이 6자 미만이면 보더 하이라이트는 끄되, 캡션은 유지
    if (value.length < 6) {
      setErrorBorder(false);
    }
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

  // 남은 시간 갱신 타이머
  useEffect(() => {
    const update = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const handleComplete = useCallback(async (value: string) => {
    // 만료 우선 체크
    if (Date.now() > expiresAt) {
      setError(true);
      setErrorMessage('인증번호가 만료되었습니다.');
      setErrorBorder(false);
      return;
    }

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured');
      }
      const email = displayEmail;
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: value,
        type: 'email',
      });
      if (verifyError) {
        setError(true);
        setErrorMessage(verifyError.message?.includes('Token has expired') ? '인증번호가 만료되었습니다.' : '인증번호가 일치하지 않습니다.');
        setErrorBorder(true);
        return;
      }
      setError(false);
      setErrorMessage('');
      setErrorBorder(false);
      router.replace('/password-set');
    } catch (e) {
      setError(true);
      setErrorMessage('네트워크 오류가 발생했습니다.');
      setErrorBorder(true);
    }
  }, [expiresAt, router]);

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
    // Supabase OTP 재전송
    if (isSupabaseConfigured && displayEmail) {
      supabase.auth.signInWithOtp({ email: displayEmail, options: { shouldCreateUser: true } }).catch(() => {});
    }
    // 새 만료 타이머 시작
    const newExpires = Date.now() + OTP_TTL_MS;
    setExpiresAt(newExpires);
    setRemainingSeconds(Math.max(0, Math.ceil((newExpires - Date.now()) / 1000)));
    // 에러 표시 초기화(원하시면 캡션 유지로 바꿀 수 있음)
    setError(false);
    setErrorMessage('');
    setErrorBorder(false);
    startCooldown(60);
  };

  const canSubmit = code.length === 6 && !error;

  // 화면 진입 시 바로 쿨다운/만료 시작 (초기 발송 직후 UX 반영)
  useEffect(() => {
    if (!isResendDisabled && cooldown === 0) {
      startCooldown(60);
    }
    // 만료 타이머 시작(초기 발송 시점 가정)
    const initialExpires = Date.now() + OTP_TTL_MS;
    setExpiresAt(initialExpires);
    setRemainingSeconds(Math.max(0, Math.ceil((initialExpires - Date.now()) / 1000)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
  const ss = String(remainingSeconds % 60).padStart(2, '0');

  // 이메일 마스킹 처리 (아이디 뒷자리 3자리)
  const getMaskedEmail = (email: string) => {
    if (!email || !email.includes('@')) return email;
    const [id, domain] = email.split('@');
    if (id.length <= 3) return email; // 3자리 이하면 마스킹 안함
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
                <Text style={[styles.remainingTime, { color: colors.textNeutral }]}>
                  인증 코드는 3분 후 만료됩니다.
                </Text>
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
              <Button onPress={() => router.replace('/password-set')} disabled={!canSubmit}>
                확인
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  mainContent: { flex: 1, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32 },
  titleGroup: { marginBottom: 32 },
  title: { ...Typography.headline4.r.bold, lineHeight: 31.5, textAlign: 'center' },
  otpArea: { alignItems: 'center', marginBottom: 0 },
  remainingTime: { ...Typography.body1.l.regular, textAlign: 'center', marginTop: 16 },
  resendArea: { alignItems: 'center', marginTop: 'auto' },
  resendPrefix: { ...Typography.body1.l.medium },
  resendText: { ...Typography.body1.l.medium },
  buttonSection: {},
  bottomContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
});


