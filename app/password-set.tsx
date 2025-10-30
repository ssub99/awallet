import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PasswordSetScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [koreanError, setKoreanError] = useState('');

  const hasKorean = (text: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text);

  const validatePassword = (value: string) => {
    if (value.length < 8 || value.length > 16) return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    if (!/[A-Z]/.test(value)) return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    if (!/[a-z]/.test(value)) return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    if (!/[0-9]/.test(value)) return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) return '8-16자의 영문 대/소문자, 숫자, 특수문자를 사용해 주세요.';
    return '';
  };

  const canSubmit = password.trim().length > 0 && confirm.trim().length > 0 && !error && !koreanError;

  const onChangePassword = (value: string) => {
    const next = value.slice(0, 16);
    if (hasKorean(next)) {
      setKoreanError('한글은 입력할 수 없습니다.');
      return;
    }
    setKoreanError('');
    setPassword(next);
    // 비밀번호 규칙 검증
    setError(validatePassword(next));
  };

  const onChangeConfirm = (value: string) => {
    const next = value.slice(0, 16);
    if (hasKorean(next)) {
      setKoreanError('한글은 입력할 수 없습니다.');
      return;
    }
    setKoreanError('');
    setConfirm(next);
  };

  const handleSubmit = () => {
    setError('');
    setKoreanError('');

    const ruleErr = validatePassword(password);
    if (ruleErr) {
      setError(ruleErr);
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // TODO: 서버에 비밀번호 설정 요청
    router.replace('/signup-complete');
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
            <Text style={[styles.pageTitle, { color: colors.text }]}>비밀번호 설정</Text>
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={undefined}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}> 
              <Text style={[styles.subtitle, { color: colors.text }]}>인증이 완료되었습니다.{Platform.OS === 'ios' ? '\n' : '\n'}비밀번호를 설정해 주세요.</Text>

              <View style={styles.inputContainer}>
                <Input
                  placeholder="비밀번호 입력"
                  value={password}
                  onChangeText={onChangePassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.select({ ios: 'ascii-capable', android: 'visible-password' }) as any}
                  maxLength={16}
                  accessibilityLabel="비밀번호 입력"
                />
                <Input
                  placeholder="비밀번호 입력 확인"
                  value={confirm}
                  onChangeText={onChangeConfirm}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={Platform.select({ ios: 'ascii-capable', android: 'visible-password' }) as any}
                  maxLength={16}
                  accessibilityLabel="비밀번호 입력 확인"
                />
                {(koreanError || error) ? (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>{koreanError || error}</Text>
                ) : null}
              </View>
            </View>
          </ScrollView>

          <View style={[styles.bottomContainer, { backgroundColor: colors.background }]}>
            <Button onPress={handleSubmit} disabled={!canSubmit}>확인</Button>
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


