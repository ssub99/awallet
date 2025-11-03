import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLoading } from '@/contexts/loading-context';
import { supabase, isSupabaseConfigured } from '@/utils/supabase-client';
import { Stack, useRouter, useNavigation } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, KeyboardAvoidingView, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PasswordChangeScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const navigation = useNavigation();
  const { setLoading } = useLoading();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [koreanError, setKoreanError] = useState('');
  const [isExpired, setIsExpired] = useState(false);
  const [showExpiredModal, setShowExpiredModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const [isPasswordChanged, setIsPasswordChanged] = useState(false); // 비밀번호 변경 완료 여부
  const isNavigatingRef = useRef(false); // 로그인 화면으로 이동 중인지 추적
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const appState = useRef(AppState.currentState);

  // 세션 확인: 이메일 인증 후 세션이 있어야 비밀번호 변경 가능
  useEffect(() => {
    // 이미 로그인 화면으로 이동 중이면 세션 확인하지 않음
    if (isNavigatingRef.current) {
      return;
    }

    (async () => {
      try {
        if (!isSupabaseConfigured) {
          setIsExpired(true);
          setShowExpiredModal(true);
          return;
        }
        const { data } = await supabase.auth.getUser();
        if (!data?.user) {
          setIsExpired(true);
          setShowExpiredModal(true);
        }
      } catch (error) {
        console.error('🔎 [PasswordChange] Session check error:', error);
        setIsExpired(true);
        setShowExpiredModal(true);
      }
    })();
  }, []);

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
      // 이미 로그인 화면으로 이동 중이면 타이머로 모달을 열지 않음
      if (!isNavigatingRef.current) {
        setIsExpired(true);
        setShowExpiredModal(true);
      }
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

  // 앱이 백그라운드로 가거나 종료될 때 세션 종료 처리
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // 앱이 백그라운드로 가거나 비활성화될 때
      if (
        (appState.current === 'active' && nextAppState.match(/inactive|background/)) ||
        (appState.current.match(/inactive|background/) && nextAppState === 'background')
      ) {
        // 비밀번호 변경이 완료되지 않았으면 세션 종료
        if (!isPasswordChanged && isSupabaseConfigured) {
          supabase.auth.signOut().catch((error) => {
            console.error('🔎 [PasswordChange] Sign out error:', error);
          });
        }
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isPasswordChanged]);

  // 뒤로가기 버튼/제스처 처리
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // 이미 다른 화면으로 이동 중이면 차단하지 않음
      if (isNavigatingRef.current) {
        return;
      }
      // 비밀번호 변경이 완료되지 않았으면 뒤로가기 방지
      if (!isPasswordChanged) {
        e.preventDefault();
        if (!showBackModal) {
          setShowBackModal(true);
        }
      }
    });

    return unsubscribe;
  }, [navigation, isPasswordChanged, showBackModal]);

  // 버튼 활성화 조건: 입력값만 확인 (에러는 제출 시 검증하여 재시도 가능하도록)
  const canSubmit = newPassword.trim().length > 0 && 
                   confirmPassword.trim().length > 0 && 
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
    
    // 실시간 비밀번호 형식 검증 (8자 이상일 때만 검증)
    // 단, 서버 에러 메시지가 있으면 사용자가 입력을 변경했으므로 형식 검증으로 덮어씀
    if (limitedValue.length >= 8) {
      const passwordValidation = validatePassword(limitedValue);
      if (passwordValidation) {
        // 형식 검증 에러가 있으면 설정 (서버 에러 대체)
        setNewPasswordError(passwordValidation);
      } else {
        // 형식 검증 통과 시 서버 에러가 있으면 유지, 없으면 클리어
        // (사용자가 올바른 형식으로 수정 중이면 서버 에러는 유지하지 않음)
        setNewPasswordError('');
      }
    } else if (limitedValue.length > 0) {
      // 8자 미만이면 에러 표시하지 않음 (입력 중일 수 있음)
      // 단, 형식 검증 통과 상태면 서버 에러도 클리어
      setNewPasswordError('');
    } else {
      setNewPasswordError('');
    }
    
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

  const handleSubmit = async () => {
    
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

    setLoading(true);
    
    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured');
      }

      // 세션 확인
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setNewPasswordError('인증이 만료되었습니다. 처음부터 다시 진행해 주세요.');
        setIsExpired(true);
        setShowExpiredModal(true);
        return;
      }

      // 비밀번호 변경 API 호출
      
      const { error: updateErr } = await supabase.auth.updateUser({ 
        password: newPassword 
      });

      if (updateErr) {
        // Supabase 에러 메시지 처리 (사용자에게 표시할 에러로 변환하므로 console.error 대신 console.log 사용)
        const errorMessage = updateErr.message.toLowerCase();
        
        
        // 기존 비밀번호와 동일한 경우
        if (errorMessage.includes('different') || 
            errorMessage.includes('same') || 
            errorMessage.includes('identical')) {
          const errorMsg = '기존 비밀번호와 동일합니다.';
          setNewPasswordError(errorMsg);
        } else if (errorMessage.includes('weak')) {
          setNewPasswordError('비밀번호가 너무 약합니다.');
        } else {
          setNewPasswordError('비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
        setLoading(false);
        return;
      }

      
      
      // 비밀번호 변경 완료 플래그 설정
      setIsPasswordChanged(true);
      
      // 성공 시 완료 모달 표시
      setShowSuccessModal(true);
    } catch (error) {
      console.error('🔎 [PasswordChange] unexpected error:', error);
      setNewPasswordError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleExpiredModalClose = async () => {
    
    // 로그인 화면으로 이동 중임을 표시하여 다른 로직이 모달을 다시 열지 않도록 함
    isNavigatingRef.current = true;
    setShowExpiredModal(false);
    
    // 세션 종료 후 로그인 화면으로 이동
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('🔎 [PasswordChange] Sign out error:', error);
    }
    
    // 즉시 로그인 화면으로 이동
    router.push('/login');
  };

  const handleSuccessModalClose = async () => {
    
    setShowSuccessModal(false);
    // 세션 종료 후 로그인 화면으로 이동
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('🔎 [PasswordChange] Sign out error:', error);
    }
    router.back();
  };

  const handleBackModalClose = async () => {
    
    // 다른 로직이 다시 모달을 띄우지 않도록 네비게이팅 플래그 설정
    isNavigatingRef.current = true;
    setShowBackModal(false);
    // 세션 종료 후 로그인 화면으로 이동
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      }
    } catch (error) {
      console.error('🔎 [PasswordChange] Sign out error:', error);
    }
    router.back();
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
              onPress={() => {
                // 이미 이동 중이면 무시
                if (isNavigatingRef.current) return;
                // 비밀번호 변경이 완료되지 않았으면 모달 표시
                if (!isPasswordChanged) {
                  setShowBackModal(true);
                } else {
                  router.back();
                }
              }}
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
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
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
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
                  maxLength={16}
                  accessibilityLabel="새 비밀번호 입력 확인"
                />
                {koreanError ? (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                    {koreanError}
                  </Text>
                ) : newPasswordError ? (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                    {newPasswordError}
                  </Text>
                ) : confirmPasswordError ? (
                  <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                    {confirmPasswordError}
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
        <ModalPopup
          visible={showExpiredModal}
          confirmText="확인"
          onConfirm={handleExpiredModalClose}
        >
          <Text style={[Typography.body1.l.regular, { color: colors.text, textAlign: 'center' }]}>
            인증이 만료되었습니다.
            {'\n'}
            처음부터 다시 진행해 주세요.
          </Text>
        </ModalPopup>

        {/* 비밀번호 변경 완료 모달 */}
        <ModalPopup
          visible={showSuccessModal}
          message="비밀번호 변경이 완료 되었습니다."
          confirmText="확인"
          onConfirm={handleSuccessModalClose}
        />

        {/* 뒤로가기 방지 모달 */}
        <ModalPopup
          visible={showBackModal}
          confirmText="확인"
          onConfirm={handleBackModalClose}
        >
          <Text style={[Typography.body1.l.regular, { color: colors.text, textAlign: 'center' }]}>
            이전화면으로 이동이 불가합니다.
            {'\n'}
            처음부터 다시 진행해 주세요.
          </Text>
        </ModalPopup>
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
