/**
 * Login Screen
 * 
 * User authentication screen
 * Matches Figma design: [Awallet]Mypage_loginmain
 */

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getOrCreateDeviceId } from '@/utils/device-id';
import { upsertProfile } from '@/utils/profiles';
import { isSupabaseConfigured, supabase } from '@/utils/supabase-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const [isClosing, setIsClosing] = useState(false);
  // Focus log
  useFocusEffect(
    useCallback(() => {
      console.log('🔎 [Login] entered');
    }, [])
  );


  // 진입 시 애니메이션 없음
  
  // Form state
  const params = useLocalSearchParams<{ email?: string | string[]; force?: string | string[] }>();
  const [email, setEmail] = useState('');
  // Prefill email when navigated with param
  useEffect(() => {
    const paramEmail = Array.isArray(params.email) ? params.email[0] : params.email;
    const decoded = paramEmail ? decodeURIComponent(paramEmail) : '';
    if (decoded) {
      setEmail(decoded);
      setEmailError('');
    }
  }, [params.email]);

  // 이미 세션이 있으면 폼을 보여주지 않고 마이페이지로 보냄
  useEffect(() => {
    (async () => {
      try {
        const forceParam = Array.isArray(params.force) ? params.force[0] : params.force;
        if (forceParam === '1') return; // 강제 로그인 화면 표시
        const { data } = await supabase.auth.getUser();
        if (data?.user) {
          router.replace('/(tabs)/mypage');
        }
      } catch {}
    })();
  }, [router, params.force]);
  const [password, setPassword] = useState('');
  
  // Validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');


  // Validation functions
  const validateEmail = (emailValue: string) => {
    // 이메일 형식 체크
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (emailValue.trim() && !emailRegex.test(emailValue)) {
      return '입력하신 정보가 존재하지 않습니다.';
    }
    
    // 빈 값 체크
    if (!emailValue.trim()) {
      return '이메일을 입력해 주세요.';
    }
    
    return '';
  };

  const validatePassword = (passwordValue: string) => {
    // 서버 검증에 맡기고, 클라이언트는 비어있지만 체크만 수행
    if (!passwordValue.trim()) return '비밀번호를 입력해 주세요.';
    return '';
  };


  // Navigation handlers
  const handleClosePress = () => {
    if (isClosing) return;
    setIsClosing(true);
    router.back();
  };

  const handleLoginPress = async () => {
    // 모든 에러 상태 초기화
    setEmailError('');
    setPasswordError('');
    
    // 아이디부터 체크
    const emailErr = validateEmail(email);
    if (emailErr) {
      setEmailError(emailErr);
      return;
    }
    
    // 비밀번호 체크
    const passwordErr = validatePassword(password);
    if (passwordErr) {
      setPasswordError(passwordErr);
      return;
    }

    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        throw new Error('Supabase not configured');
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data?.user) {
        setPasswordError('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const user = data.user;
      // 로그인 후 프로필에서 이름을 조회하여 저장 (이메일 아이디 하드코딩 제거)
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('nm')
          .eq('auth_uid', user.id)
          .maybeSingle();
        if (profile?.nm) {
          await AsyncStorage.setItem('userName', profile.nm as string);
        } else {
          await AsyncStorage.removeItem('userName');
        }
      } catch {}

      // 프로필 동기화 (upsert)
      try {
        const deviceId = await getOrCreateDeviceId();
        await upsertProfile({
          authUid: user.id,
          email: user.email ?? email,
          deviceId,
          loginAt: new Date().toISOString(),
        });
      } catch {}

      router.replace('/(tabs)/mypage');
    } catch (e) {
      setPasswordError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupPress = () => {
    router.push('/signup-intro');
  };

  const handleFindAccountPress = () => {
    // push로 스택을 쌓아서 뒤로가기 시 로그인으로 복귀 가능하게 함
    router.push('/account-verify');
  };

  return (
    <>
      <Stack.Screen 
        options={{
          headerShown: false,
          gestureEnabled: false,
        }}
      />
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.background }]} 
        edges={['top','bottom']}
      >

      {/* Screen Content */}
      <View style={{ flex: 1 }}>
      {/* Top Navigation */}
      <View style={[styles.topNavigation, { backgroundColor: colors.background }]}> 
        <View style={styles.topNavigationContent}>
          <Pressable 
            style={styles.closeButton}
            onPress={handleClosePress}
            accessibilityRole="button"
            accessibilityLabel="닫기"
          >
            <Icon name="close" size={24} color={colors.text} />
          </Pressable>
          
          <Text style={[styles.pageTitle, { color: colors.text }]}>로그인</Text>
          
          <View style={styles.placeholder} />
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Content */}
          <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
            {/* Welcome Message */}
            <Text style={[styles.welcomeText, { color: colors.text }]}>
              안녕하세요!{'\n'}작은 소비 습관 기록{'\n'}에이월렛 입니다.
            </Text>

            {/* Form */}
            <View style={styles.form}>
              {/* Email Input */}
              <View style={styles.inputContainer}>
                <Input
                  placeholder="이메일 입력"
                  value={email}
                  onChangeText={(value) => {
                    // 한글 입력 방지
                    const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
                    if (koreanRegex.test(value)) {
                      setEmailError('한글은 입력할 수 없습니다.');
                      return; // 한글이 포함된 경우 입력 무시
                    }
                    setEmail(value);
                    setEmailError(''); // 에러 상태 초기화
                  }}
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
                  autoCapitalize="none"
                  autoCorrect={false}
                  icon="person"
                  accessibilityLabel="이메일 입력"
                />
              </View>

              {/* Password Input */}
              <View style={styles.inputContainer}>
                <Input
                  placeholder="비밀번호 입력"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  keyboardType={Platform.select({ ios: 'default', android: 'default' }) as any}
                  icon="lock"
                  accessibilityLabel="비밀번호 입력"
                />
                {(emailError || passwordError) ? (
                  <Text style={[styles.caption, { color: colors.statusNegative }]}>
                    {emailError || passwordError}
                  </Text>
                ) : null}
              </View>
            </View>

            {/* Login Button Area */}
            <View style={styles.loginButtonArea}>
              <Button
                onPress={handleLoginPress}
              >
                로그인
              </Button>

              {/* Find Account Link */}
              <View style={styles.findAccountContainer}>
                <Pressable 
                  onPress={handleFindAccountPress}
                  style={styles.findAccountLink}
                  accessibilityRole="button"
                  accessibilityLabel="계정 및 비밀번호 찾기"
                >
                  <Text style={[styles.findAccountText, { color: colors.textAssistive }]}>
                    계정 및 비밀번호 찾기
                  </Text>
                </Pressable>
              </View>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      
      {/* Signup Button - Fixed at bottom */}
      <View style={[styles.signupButtonContainer, { backgroundColor: colors.background }]}>
        <Button
          onPress={handleSignupPress}
          type="line"
        >
          회원가입
        </Button>
      </View>
      </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  // Top Navigation
  topNavigation: {
    height: 56,
  },
  topNavigationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    ...Typography.body1.l.bold,
  },
  placeholder: {
    width: 32,
    height: 32,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.16,
  },

  // Keyboard Avoiding View
  keyboardAvoidingView: {
    flex: 1,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Main Content
  mainContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 32,
  },

  // Welcome Text
  welcomeText: {
    ...Typography.headline4.r.bold,
  },

  // Form
  form: {
    gap: 8,
  },
  inputContainer: {
    // Input component handles its own styling
  },

  // Login Button Area
  loginButtonArea: {
    // marginTop removed - mainContent gap handles spacing
  },
  loginButton: {
    // marginTop removed
  },
  loginButtonDisabled: {
    opacity: 0.12,
  },

  // Find Account Link
  findAccountContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  findAccountLink: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  findAccountText: {
    ...Typography.body2.r.medium,
  },

  // Signup Button
  signupButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },

  // Caption
  caption: {
    ...Typography.body2.r.regular,
    marginTop: 8,
  },
});
