import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ModalPopup } from '@/components/ui/modal-popup';
import { Selectbox } from '@/components/ui/selectbox';
import { Toast } from '@/components/ui/toast';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { upsertProfile } from '@/utils/profiles';
import { isSupabaseConfigured, supabase } from '@/utils/supabase-client';

export default function AccountEditScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const { setLoading } = useLoading();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [birthMonth, setBirthMonth] = useState('');
  const [birthDay, setBirthDay] = useState('');
  const [nameError, setNameError] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAgree, setWithdrawAgree] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useMemo(() => new Animated.Value(0), []);
  const [showEmailToast, setShowEmailToast] = useState(false);
  const [showErrorToast, setShowErrorToast] = useState(false);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 100 }, (_, index) => {
      const year = currentYear - index;
      return { label: `${year}년`, value: year.toString() };
    });
  }, []);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        return { label: `${month}월`, value: month.toString().padStart(2, '0') };
      }),
    []
  );

  const dayOptions = useMemo(
    () =>
      Array.from({ length: 31 }, (_, index) => {
        const day = index + 1;
        return { label: `${day}일`, value: day.toString().padStart(2, '0') };
      }),
    []
  );

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      if (!isSupabaseConfigured) {
        Alert.alert('설정 오류', 'Supabase가 설정되지 않았습니다.');
        return;
      }

      try {
        setLoading(true);

        const { data: userData } = await supabase.auth.getUser();
        const user = userData?.user;

        if (!user) {
          router.replace({ pathname: '/login', params: { from: 'account-edit' } });
          return;
        }

        if (!isMounted) return;

        setEmail(user.email ?? '');

        const { data: profileData } = await supabase
          .from('profiles')
          .select('nm, birth_date')
          .eq('auth_uid', user.id)
          .maybeSingle();

        if (!isMounted) return;

        const profileName = (profileData?.nm as string | null) ?? '';
        const birthDate = (profileData?.birth_date as string | null) ?? null;

        setName(profileName);

        if (birthDate) {
          const [year, month, day] = birthDate.split('-');
          setBirthYear(year ?? '');
          setBirthMonth(month ?? '');
          setBirthDay(day ?? '');
        }

        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setIsContentReady(true);
        });
      } catch (error) {
        console.error('계정 정보 로드 중 오류:', error);
        Alert.alert('오류', '계정 정보를 불러오는 중 문제가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [router, setLoading]);

  const validateName = useCallback((value: string) => {
    if (!value.trim()) {
      return '이름을 입력해 주세요.';
    }
    if (value.trim().length < 2) {
      return '이름은 2자 이상 입력해 주세요.';
    }
    return '';
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const nameValidation = validateName(trimmedName);
    if (nameValidation) {
      setNameError(nameValidation);
      return;
    }

    if (!birthYear || !birthMonth || !birthDay) {
      Alert.alert('입력 오류', '생년월일을 모두 선택해 주세요.');
      return;
    }

    if (!isSupabaseConfigured) {
      Alert.alert('설정 오류', 'Supabase가 설정되지 않았습니다.');
      return;
    }

    const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;

    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;

      if (!user) {
        Alert.alert('세션 만료', '다시 로그인해 주세요.');
        router.replace({ pathname: '/login', params: { from: 'account-edit' } });
        return;
      }

      await supabase.rpc('update_profile', {
        p_nm: trimmedName,
        p_birth_date: birthDate,
      });

      await upsertProfile({
        authUid: user.id,
        email: user.email ?? null,
        name: trimmedName,
        birthDate,
      });

      await AsyncStorage.setItem('userName', trimmedName);

      router.back();
      return;
    } catch (error) {
      console.error('계정 정보 저장 중 오류:', error);
      setShowErrorToast(true);
    } finally {
      setLoading(false);
    }
  }, [birthDay, birthMonth, birthYear, name, router, setLoading, validateName]);

  const handleWithdrawPress = useCallback(() => {
    setWithdrawAgree(false);
    setShowWithdrawModal(true);
  }, []);

  const handleWithdrawConfirm = useCallback(() => {
    if (!withdrawAgree) {
      Alert.alert('확인 필요', '동의 여부를 먼저 체크해 주세요.');
      return;
    }

    setShowWithdrawModal(false);
    Alert.alert('준비 중', '탈퇴 기능은 준비 중입니다.');
  }, [withdrawAgree]);

  const handleWithdrawCancel = useCallback(() => {
    setShowWithdrawModal(false);
  }, []);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (nameError) {
        setNameError('');
      }
    },
    [nameError]
  );

  const handleScrollViewLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setLayoutHeight(event.nativeEvent.layout.height);
    },
    []
  );

  const handleContentSizeChange = useCallback((_: number, height: number) => {
    setContentHeight(height);
  }, []);

  const scrollEnabled = contentHeight > layoutHeight;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <TopNavigation
          type="sub"
          title="계정 정보 수정"
          showLeftIcon
          onLeftIconPress={() => router.back()}
        />

        <View style={styles.contentWrapper}>
          <Animated.View style={[styles.contentContainer, { opacity: isContentReady ? contentOpacity : 0 }]}>
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[styles.scrollContent, { backgroundColor: colors.fill }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onLayout={handleScrollViewLayout}
              onContentSizeChange={handleContentSizeChange}
              scrollEnabled={scrollEnabled}
              overScrollMode="never"
            >
            <View style={styles.section}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>이름</Text>
                <Input
                  placeholder="이름 입력"
                  value={name}
                  onChangeText={handleNameChange}
                  accessibilityLabel="이름 입력"
                />
              </View>
              {nameError ? (
                <Text style={[styles.errorText, { color: colors.statusNegative }]}>{nameError}</Text>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, styles.sectionTitleWithSpacing, { color: colors.text }]}>생년월일</Text>
              <View style={[styles.fieldGroup, styles.birthSelectRow]}>
                <Selectbox
                  options={yearOptions}
                  value={birthYear}
                  onValueChange={setBirthYear}
                  placeholder="년"
                  title="년도 선택"
                  style={styles.birthSelect}
                />
                <Selectbox
                  options={monthOptions}
                  value={birthMonth}
                  onValueChange={setBirthMonth}
                  placeholder="월"
                  title="월 선택"
                  style={styles.birthSelect}
                />
                <Selectbox
                  options={dayOptions}
                  value={birthDay}
                  onValueChange={setBirthDay}
                  placeholder="일"
                  title="일 선택"
                  style={styles.birthSelect}
                />
              </View>
            </View>

            <View style={[styles.section, styles.sectionEmail]}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>이메일</Text>
                <Input
                  value={email}
                  disabled
                  accessibilityLabel="이메일"
                  onPress={() => setShowEmailToast(true)}
                  style={{ borderColor: colors.fillStrong }}
                />
              </View>
            </View>

            <View style={styles.withdrawContainer}>
              <Pressable
                onPress={handleWithdrawPress}
                accessibilityRole="button"
                accessibilityLabel="회원탈퇴"
              >
                <Text
                  style={[
                    styles.withdrawLabel,
                    { color: colors.textAssistive },
                  ]}
                >
                  회원탈퇴
                </Text>
              </Pressable>
            </View>
            </ScrollView>

            <View style={[styles.bottomButtonContainer, { backgroundColor: colors.background }]}>
              <Button onPress={handleSave}>저장</Button>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>

      <Toast
        visible={showErrorToast}
        message="다시 한번 시도해 주세요."
        onHide={() => setShowErrorToast(false)}
      />
      <Toast
        visible={showEmailToast}
        message="이메일은 변경할 수 없습니다."
        onHide={() => setShowEmailToast(false)}
        zIndex={100004}
      />

      <ModalPopup
        visible={showWithdrawModal}
        onCancel={handleWithdrawCancel}
        cancelText="취소"
        onConfirm={handleWithdrawConfirm}
        confirmText="확인"
        confirmDisabled={!withdrawAgree}
      >
        <View style={styles.withdrawModalContent}>
          <Text style={[styles.withdrawModalTitle, { color: colors.text }]}>회원 탈퇴 안내</Text>
          <Text style={[styles.withdrawModalDescription, { color: colors.textNeutral }]}>
            탈퇴 시 가입내역을 3개월 보관 후 삭제하며{'\n'}
            삭제된 데이터는 복구할 수 없습니다.{'\n'}
            재가입은 3개월 이후 진행하실 수 있습니다.
          </Text>
          <View style={styles.withdrawCheckboxContainer}>
            <Checkbox
              checked={withdrawAgree}
              onPress={() => setWithdrawAgree((prev) => !prev)}
              label="이에 동의하며 탈퇴를 진행하겠습니다."
            />
          </View>
        </View>
      </ModalPopup>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  section: {
    marginBottom: 32,
  },
  fieldGroup: {
    gap: 8,
  },
  sectionEmail: {
    marginBottom: 16,
  },
  sectionTitle: {
    ...Typography.body1.l.bold,
  },
  sectionTitleWithSpacing: {
    marginBottom: 8,
  },
  errorText: {
    ...Typography.body2.r.regular,
  },
  birthSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  birthSelect: {
    flex: 1,
  },
  withdrawLabel: {
    ...Typography.body1.l.regular,
    textDecorationLine: 'underline',
  },
  withdrawContainer: {
    alignItems: 'flex-start',
  },
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  withdrawModalContent: {
    gap: 16,
  },
  withdrawModalTitle: {
    ...Typography.headline4.r.bold,
    textAlign: 'center',
  },
  withdrawModalDescription: {
    ...Typography.body1.l.regular,
    textAlign: 'center',
    lineHeight: 24,
  },
  withdrawCheckboxContainer: {
    alignItems: 'center',
  },
});


