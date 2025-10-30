/**
 * Signup Intro Screen
 * 
 * First step of user registration process
 * Matches Figma design: [Awallet]Mypage_join_step01
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Selectbox } from '@/components/ui/selectbox';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useLoading } from '@/contexts/loading-context';
import { supabase, isSupabaseConfigured } from '@/utils/supabase-client';
import { useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignupIntroScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  
  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  
  // Agreement states
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  
  // Validation states
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showExistingModal, setShowExistingModal] = useState(false);

  // Generate year options (1950-2024)
  const yearOptions = Array.from({ length: 75 }, (_, i) => {
    const year = 2024 - i;
    return { label: `${year}년`, value: year.toString() };
  });

  // Generate month options (1-12)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    return { label: `${month}월`, value: month.toString() };
  });

  // Generate day options (1-31)
  const dayOptions = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return { label: `${day}일`, value: day.toString() };
  });

  // Validation functions
  const validateName = (nameValue: string) => {
    if (!nameValue.trim()) {
      return '이름을 입력해 주세요.';
    }
    if (nameValue.trim().length < 2) {
      return '이름은 2자 이상 입력해 주세요.';
    }
    return '';
  };

  const validateEmail = (emailValue: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailValue.trim()) {
      return '이메일을 입력해 주세요.';
    }
    if (!emailRegex.test(emailValue)) {
      return '올바른 이메일 형식을 입력해 주세요.';
    }
    return '';
  };

  const validateBirthDate = () => {
    if (!birthYear || !birthMonth || !birthDay) {
      return '생년월일을 모두 선택해 주세요.';
    }
    return '';
  };

  // Form validity (for disabling Next button)
  const isFormValid = () => {
    const hasValidName = validateName(name) === '';
    const hasValidEmail = validateEmail(email) === '';
    const hasBirthDate = validateBirthDate() === '';
    const hasAgreements = privacyAgreed && termsAgreed;
    return hasValidName && hasValidEmail && hasBirthDate && hasAgreements;
  };

  // Navigation handlers
  const handleBackPress = () => {
    router.back();
  };

  const handleNextPress = async () => {
    setLoading(true);
    // Clear previous errors
    setNameError('');
    setEmailError('');

    // Validate form
    const nameErr = validateName(name);
    const emailErr = validateEmail(email);
    const birthDateErr = validateBirthDate();

    if (nameErr) {
      setNameError(nameErr);
      return;
    }

    if (emailErr) {
      setEmailError(emailErr);
      return;
    }

    if (birthDateErr) {
      Alert.alert('입력 오류', birthDateErr);
      setLoading(false);
      return;
    }

    if (!privacyAgreed || !termsAgreed) {
      Alert.alert('약관 동의 필요', '개인정보처리방침과 이용약관에 동의해 주세요.');
      return;
    }

    // 0) 기존 가입자 여부 확인 (RPC) — 이름+생년월일+이메일 기준
    try {
      if (isSupabaseConfigured) {
        const birth = `${birthYear}-${String(parseInt(birthMonth || '0')).padStart(2, '0')}-${String(parseInt(birthDay || '0')).padStart(2, '0')}`;
        const { data: checkResult } = await supabase.rpc('check_signup_candidate', {
          p_email: email,
          p_nm: name,
          p_birth_date: birth,
        });
        if (checkResult === 'email_exists' || checkResult === 'person_exists') {
          setShowExistingModal(true);
          setLoading(false);
          return;
        }
      }
    } catch {}

    // 1) 가입 정보 임시 저장 (다음 단계에서 upsert에 사용)
    try {
      const birth = `${birthYear}-${String(parseInt(birthMonth || '0')).padStart(2, '0')}-${String(parseInt(birthDay || '0')).padStart(2, '0')}`;
      await AsyncStorage.multiSet([
        ['signupEmail', email],
        ['signupName', name],
        ['signupBirth', birth],
      ]);
    } catch {}

    // 2) Supabase OTP 발송
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
          },
        });
      } catch (e) {
        Alert.alert('인증 메일 발송 실패', '잠시 후 다시 시도해 주세요.');
      }
    }

    // 3) 이메일 인증 화면으로 이동 (이메일 전달)
    router.push({ pathname: '/email-verify', params: { email: encodeURIComponent(email) } });
    setLoading(false);
  };

  const handlePrivacyAgreementToggle = () => {
    setPrivacyAgreed(prev => !prev);
  };

  const handleTermsAgreementToggle = () => {
    setTermsAgreed(prev => !prev);
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
              style={styles.backButton}
              onPress={handleBackPress}
              accessibilityRole="button"
              accessibilityLabel="뒤로가기"
            >
              <Icon name="arrowLeft" size={24} color={colors.text} />
            </Pressable>
            
            <Text style={[styles.pageTitle, { color: colors.text }]}>회원가입</Text>
            
            <View style={styles.placeholder} />
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
        </View>

        <KeyboardAvoidingView 
          style={styles.keyboardAvoidingView}
          behavior={undefined}
        >
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Main Content */}
            <View style={[styles.mainContent, { backgroundColor: colors.fill }]}>
              {/* Title */}
              <Text style={[styles.title, { color: colors.text }]}>
                인적사항과{'\n'}약관동의가 필요해요.
              </Text>

              {/* Form */}
              <View style={styles.form}>
                {/* Name Input */}
                <View style={styles.inputSection}>
                  <Text style={[styles.label, { color: colors.text }]}>이름</Text>
                  <Input
                    placeholder="이름 입력"
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      setNameError(''); // Clear error on change
                    }}
                    accessibilityLabel="이름 입력"
                  />
                  {nameError ? (
                    <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                      {nameError}
                    </Text>
                  ) : null}
                </View>

                {/* Birth Date */}
                <View style={styles.inputSection}>
                  <Text style={[styles.label, { color: colors.text }]}>생년월일</Text>
                  <View style={styles.dateSelectors}>
                    <Selectbox
                      options={yearOptions}
                      value={birthYear}
                      onValueChange={setBirthYear}
                      placeholder="년"
                      title="년도 선택"
                      style={styles.dateSelector}
                    />
                    <Selectbox
                      options={monthOptions}
                      value={birthMonth}
                      onValueChange={setBirthMonth}
                      placeholder="월"
                      title="월 선택"
                      style={styles.dateSelector}
                    />
                    <Selectbox
                      options={dayOptions}
                      value={birthDay}
                      onValueChange={setBirthDay}
                      placeholder="일"
                      title="일 선택"
                      style={styles.dateSelector}
                    />
                  </View>
                </View>

                {/* Email Input */}
                <View style={styles.inputSection}>
                  <Text style={[styles.label, { color: colors.text }]}>이메일 입력</Text>
                  <Input
                    placeholder="이메일 입력"
                    value={email}
                    onChangeText={(value) => {
                      setEmail(value);
                      setEmailError(''); // Clear error on change
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="이메일 입력"
                  />
                  {emailError ? (
                    <Text style={[styles.errorText, { color: colors.statusNegative }]}>
                      {emailError}
                    </Text>
                  ) : null}
                </View>

                {/* Agreement Checkboxes */}
                <View style={styles.agreementSection}>
                  <Checkbox
                    checked={privacyAgreed}
                    onPress={handlePrivacyAgreementToggle}
                    label="개인 정보 취급방침에 동의합니다."
                    required
                  />
                  <Checkbox
                    checked={termsAgreed}
                    onPress={handleTermsAgreementToggle}
                    label="이용 약관에 동의합니다."
                    required
                  />
                </View>
              </View>

            </View>
          </ScrollView>
          {/* Existing account modal */}
          <ModalPopup
            visible={showExistingModal}
            message={"가입내역이 이미 존재합니다."}
            confirmText="확인"
            onConfirm={() => {
              setShowExistingModal(false);
            }}
            onCancel={() => setShowExistingModal(false)}
          />
          <View style={[styles.bottomContainer, { backgroundColor: colors.background }]}>
            <Button
              onPress={handleNextPress}
              disabled={!isFormValid()}
            >
              다음
            </Button>
          </View>
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
  backButton: {
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

  // Title
  title: {
    ...Typography.headline4.r.bold,
    lineHeight: 31.5,
  },

  // Form
  form: {
    gap: 24,
  },
  inputSection: {
    gap: 8,
  },
  label: {
    ...Typography.body1.l.bold,
  },

  // Date Selectors
  dateSelectors: {
    flexDirection: 'row',
    gap: 12,
  },
  dateSelector: {
    flex: 1,
  },

  // Agreement Section
  agreementSection: {
    gap: 12,
  },

  // Button Section
  buttonSection: {
    marginTop: 'auto',
  },

  // Bottom fixed container
  bottomContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },

  // Error Text
  errorText: {
    ...Typography.body2.r.regular,
    marginTop: 4,
  },
});
