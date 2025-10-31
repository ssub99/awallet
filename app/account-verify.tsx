import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoading } from '@/contexts/loading-context';
import { Stack, useRouter } from 'expo-router';
import { supabase, isSupabaseConfigured } from '@/utils/supabase-client';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function IdFindScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const canSubmit = name.trim().length > 0 && isValidEmail(email.trim());

  const handleSubmit = async () => {
    console.log('🔎 [AccountVerify] submit clicked', { name, email });
    setError(false);
    setErrorMessage('');
    if (!name.trim() || !isValidEmail(email.trim())) {
      console.log('🔎 [AccountVerify] local validation failed');
      setError(true);
      setErrorMessage('입력하신 정보가 존재하지 않습니다.');
      return;
    }

    try {
      setLoading(true);
      if (!isSupabaseConfigured) throw new Error('Supabase not configured');
      console.log('🔎 [AccountVerify] verifying candidate via RPC');
      // 1) 보안 RPC로 이름+이메일 매칭 확인 (RLS 우회)
      const { data: isValid, error: verifyErr } = await supabase.rpc('verify_account_candidate', {
        p_email: email.trim(),
        p_nm: name.trim(),
      });

      if (verifyErr || !isValid) {
        console.log('🔎 [AccountVerify] verify failed', { verifyErr, isValid });
        setError(true);
        setErrorMessage('입력하신 정보가 존재하지 않습니다.');
        setLoading(false);
        return;
      }

      console.log('🔎 [AccountVerify] verify ok, sending OTP');
      // 2) OTP 발송 (기존 가입자만, shouldCreateUser: false)
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: false },
      });
      if (otpErr) {
        console.log('🔎 [AccountVerify] send OTP failed', { otpErr });
        setError(true);
        setErrorMessage('인증 요청이 잦습니다. 30초 후 다시 시도해 주세요.');
        setLoading(false);
        return;
      }
      console.log('🔎 [AccountVerify] send OTP ok, navigating to email verify');
      router.replace({ pathname: '/account-verify-email', params: { email: encodeURIComponent(email.trim()), name: encodeURIComponent(name.trim()) } });
    } catch {
      console.log('🔎 [AccountVerify] unexpected error');
      setError(true);
      setErrorMessage('일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: 'name' | 'email', value: string) => {
    if (field === 'name') {
      setName(value);
    } else {
      setEmail(value);
    }
    // 입력 시 에러 상태 초기화
    if (error) {
      setError(false);
    }
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
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
            >
              <Icon name="arrowLeft" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.pageTitle, { color: colors.text }]}>계정 확인</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={undefined}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
              {/* Subtitle */}
              <Text style={[styles.subtitle, { color: colors.text }]}>가입하실 때 입력했던{Platform.OS === 'ios' ? '\n' : '\n'}인적사항을 입력해 주세요.</Text>

              {/* Input Fields Container */}
              <View style={styles.inputContainer}>
                <Input
                  placeholder="이름 입력"
                  value={name}
                  onChangeText={(value) => handleInputChange('name', value)}
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
                  accessibilityLabel="이름 입력"
                />
                <Input
                  placeholder="이메일 입력"
                  value={email}
                  onChangeText={(value) => handleInputChange('email', value)}
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="이메일 입력"
                />
                {error && !!errorMessage && (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                    {errorMessage}
                  </Text>
                )}
              </View>
            </View>
          </ScrollView>

          {/* Bottom fixed button */}
          <View style={[styles.bottomContainer, { backgroundColor: colors.background }]}>
            <Button onPress={handleSubmit} disabled={!canSubmit}>
              확인
            </Button>
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
  mainContent: { flex: 1, paddingHorizontal: 16, paddingTop: 32, paddingBottom: 32, gap: 24 },
  subtitle: { ...Typography.headline4.r.bold },
  inputContainer: { gap: 8 },
  errorText: { ...Typography.body2.r.regular, marginTop: 0 },
  bottomContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16 },
});


