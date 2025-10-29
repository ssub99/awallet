import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import OtpInputs from '@/components/ui/otp-inputs';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EmailVerifyScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [displayEmail, setDisplayEmail] = useState<string>('');

  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [isResendDisabled, setIsResendDisabled] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleBack = () => router.back();

  const handleChange = (value: string) => {
    setError(false);
    setCode(value);
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

  const handleComplete = useCallback(async (value: string) => {
    // TODO: 서버 검증 연동 후 성공 시 아래 내비게이션 유지
    // 실패 시 setError(true) 처리
    router.replace('/signup-complete');
  }, [router]);

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
    startCooldown(60);
  };

  const canSubmit = code.length === 6 && !error;

  // 숫자 초 단위 표시로 변경 (예: 60 → 59 → ...)

  // 화면 진입 시 바로 쿨다운 시작 (초기 발송 직후 UX 반영)
  useEffect(() => {
    if (!isResendDisabled && cooldown === 0) {
      startCooldown(60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
              <Text style={[styles.title, { color: colors.text }]}>이메일 코드를{"\n"}{displayEmail}로{"\n"}발송하였습니다.</Text>

              <View style={styles.otpArea}>
                <OtpInputs value={code} onChange={handleChange} onComplete={handleComplete} error={error} />
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

              <View style={styles.buttonSection}>
                <Button onPress={() => router.replace('/signup-complete')} disabled={!canSubmit}>
                  확인
                </Button>
              </View>
            </View>
          </ScrollView>
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
  mainContent: { flex: 1, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, gap: 32 },
  title: { ...Typography.headline4.r.bold, lineHeight: 31.5, textAlign: 'center' },
  otpArea: { alignItems: 'center' },
  resendArea: { alignItems: 'center' },
  resendPrefix: { ...Typography.body1.l.medium },
  resendText: { ...Typography.body1.l.medium },
  buttonSection: { marginTop: 'auto' },
});


