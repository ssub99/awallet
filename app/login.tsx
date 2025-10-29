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
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
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
  
  // Form state
  const [email, setEmail] = useState('');
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
    // 빈 값 체크
    if (!passwordValue.trim()) {
      return '비밀번호를 입력해 주세요.';
    }
    
    // 10자리 이상 체크
    if (passwordValue.length < 10) {
      return '비밀번호가 일치하지 않습니다.';
    }
    
    // 맨 앞자리 대문자 체크
    if (!/^[A-Z]/.test(passwordValue)) {
      return '비밀번호가 일치하지 않습니다.';
    }
    
    // 특수문자 2개 이상 체크
    const specialCharRegex = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g;
    const specialCharMatches = passwordValue.match(specialCharRegex);
    if (!specialCharMatches || specialCharMatches.length < 2) {
      return '비밀번호가 일치하지 않습니다.';
    }
    
    return '';
  };


  // Navigation handlers
  const handleClosePress = () => {
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
      // TODO: Implement actual login logic
      console.log('Login attempt:', { email, password });
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // For now, just show success and go back
      Alert.alert('로그인 성공', '로그인이 완료되었습니다.', [
        { text: '확인', onPress: () => router.back() }
      ]);
      
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('로그인 실패', '로그인 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupPress = () => {
    router.push('/signup-intro');
  };

  const handleFindIdPress = () => {
    // TODO: Navigate to find ID screen
    Alert.alert('아이디 찾기', '아이디 찾기 기능은 준비 중입니다.');
  };

  const handleFindPasswordPress = () => {
    // TODO: Navigate to find password screen
    Alert.alert('비밀번호 찾기', '비밀번호 찾기 기능은 준비 중입니다.');
  };

  return (
    <>
      <Stack.Screen 
        options={{
          headerShown: false,
        }}
      />
      <SafeAreaView 
        style={[styles.container, { backgroundColor: colors.background }]} 
        edges={['top','bottom']}
      >
        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

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
                  keyboardType="email-address"
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

              {/* Find Account Links */}
              <View style={styles.findAccountContainer}>
                <Pressable 
                  onPress={handleFindIdPress}
                  style={styles.findAccountLink}
                  accessibilityRole="button"
                  accessibilityLabel="아이디 찾기"
                >
                  <Text style={[styles.findAccountText, { color: colors.textAssistive }]}>
                    아이디 찾기
                  </Text>
                </Pressable>
                
                <View style={[styles.findAccountDivider, { backgroundColor: colors.borderStrong }]} />
                
                <Pressable 
                  onPress={handleFindPasswordPress}
                  style={styles.findAccountLink}
                  accessibilityRole="button"
                  accessibilityLabel="비밀번호 찾기"
                >
                  <Text style={[styles.findAccountText, { color: colors.textAssistive }]}>
                    비밀번호 찾기
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Signup Button */}
            <View style={styles.signupButtonContainer}>
              <Button
                onPress={handleSignupPress}
                type="line"
              >
                회원가입
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

  // Find Account Links
  findAccountContainer: {
    flexDirection: 'row',
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
  findAccountDivider: {
    width: 1,
    height: 12,
    opacity: 0.32,
    marginHorizontal: 8,
  },

  // Signup Button
  signupButtonContainer: {
    marginTop: 'auto',
  },

  // Caption
  caption: {
    ...Typography.body2.r.regular,
    marginTop: 8,
  },
});
