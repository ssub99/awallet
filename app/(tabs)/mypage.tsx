/**
 * My Page Screen
 * 
 * User profile, settings, and app information screen
 * Matches Figma design: [Awallet]Mypage
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { getAppStoreWriteReviewUrl } from '@/constants/app-store';
import { themeColors } from '@/constants/theme-colors';
import { typography, typographyLayout } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { monthStartEvent } from '@/hooks/use-month-start';
import { weekStartEvent } from '@/hooks/use-week-start';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyPageScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();
  const hasInitializedRef = useRef(false);   // 마이페이지 최초 진입 1회만 로드
  const [isContentReady, setIsContentReady] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  
  // Settings state
  const [monthStartDay, setMonthStartDay] = useState('1일');
  const [weekStartsSunday, setWeekStartsSunday] = useState(true);

  // Load settings from AsyncStorage on screen focus
  useFocusEffect(
    useCallback(() => {
      // 탭 루트: 시스템 뒤로가기 → 홈 탭 (`/home`, index Redirect와 동일)
      const onBackPress = () => {
        router.navigate('/home');
        return true;
      };
      const backSub = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      const loadSettings = async () => {
        try {
          // 최초 1회만 글로벌 인디케이터 + 로드
          const shouldLoad = !hasInitializedRef.current;
          if (shouldLoad) {
            setIsContentReady(false);
            setLoading(true);
          } else {
            // 이미 초기화된 경우, 바로 컨텐츠 표시 유지
            setIsContentReady(true);
          }
          const [startDay, weekStart] = await Promise.all([
            AsyncStorage.getItem('monthStartDay'),
            AsyncStorage.getItem('weekStartsSunday'),
          ]);

          if (startDay) setMonthStartDay(startDay);
          else setMonthStartDay('1일');
          if (weekStart !== null) setWeekStartsSunday(JSON.parse(weekStart));
        } catch (error) {
          console.error('설정 로드 중 오류:', error);
        } finally {
          hasInitializedRef.current = true;
          setIsContentReady(true);
          setLoading(false);
        }
      };

      loadSettings();

      return () => {
        backSub.remove();
      };
    }, [router, setLoading])
  );

  // Fade-in when ready
  useEffect(() => {
    if (isContentReady) {
      contentOpacity.setValue(0);
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      contentOpacity.setValue(0);
    }
  }, [isContentReady, contentOpacity]);

  // Reflect month start day change without full reload
  useEffect(() => {
    const unsub = monthStartEvent.subscribe((day) => {
      setMonthStartDay(`${day}일`);
    });
    return unsub;
  }, []);

  // Save settings to AsyncStorage
  const handleWeekStartChange = async (value: boolean) => {
    setWeekStartsSunday(value);
    try {
      await AsyncStorage.setItem('weekStartsSunday', JSON.stringify(value));

      // Emit event to notify other components
      weekStartEvent.emit(value);

    } catch (error) {
      console.error('설정 저장 중 오류:', error);

    }
  };

  const handleMonthStartDayPress = () => {

    router.push('/month-start-day');
  };

  const handleInquiryPress = async () => {
    const EMAIL = 'ssuby99@gmail.com';
    // CRLF(\r\n)로 줄바꿈해 써드파티 메일 앱에서도 본문 줄바꿈이 유지되도록 함
    const body = [
      '안녕하세요, 문의 내용을 작성해주세요.',
      '',
      '- App version : ',
      '- OS version : ',
    ].join('\r\n');
    const subject = '[AWallet] 문의하기';

    try {
      // mailto: 사용 시 시스템 설정의 기본 메일 앱(써드파티 포함)이 열림
      const mailtoUrl = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const canOpen = await Linking.canOpenURL(mailtoUrl);

      if (canOpen) {
        await Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          '메일 앱 없음',
          '기기에 메일 앱이 설정되어 있지 않습니다.\n\n아래 이메일로 직접 문의해주세요:\n' + EMAIL,
          [{ text: '확인' }]
        );
      }
    } catch (error) {
      console.error('문의하기 메일 열기 오류:', error);
      Alert.alert(
        '오류',
        '메일을 여는 중 문제가 발생했습니다.',
        [{ text: '확인' }]
      );
    }
  };

  const handleReviewPress = async () => {

    try {
      let url = '';
      
      if (Platform.OS === 'ios') {
        url = getAppStoreWriteReviewUrl();
      } else if (Platform.OS === 'android') {
        // Android Play Store review URL - Always use AWallet package name
        const PACKAGE_NAME = 'com.ssong.awallet';
        url = `market://details?id=${PACKAGE_NAME}`;
        
        const canOpen = await Linking.canOpenURL(url);
        if (!canOpen) {
          url = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}`;
        }
      } else {
        // Web or other platforms
        Alert.alert(
          '리뷰 작성',
          '앱 스토어에서 AWallet을 검색하여 리뷰를 남겨주세요!',
          [{ text: '확인' }]
        );
        return;
      }
      
      const supported = await Linking.canOpenURL(url);
      
      if (supported) {
        await Linking.openURL(url);

      } else {
        Alert.alert(
          '앱 스토어 열기 실패',
          '앱 스토어를 열 수 없습니다. 나중에 다시 시도해주세요.',
          [{ text: '확인' }]
        );

      }
    } catch (error) {
      console.error('설정 저장 중 오류:', error);

      Alert.alert(
        '오류',
        '앱 스토어를 여는 중 문제가 발생했습니다.',
        [{ text: '확인' }]
      );
    }
  };

  const handlePrivacyPolicyPress = async () => {
    const PRIVACY_POLICY_URL = 'https://lake-speedboat-a83.notion.site/2a4b71a1411280069937f6894dd544a6?source=copy_link';
    try {
      const supported = await Linking.canOpenURL(PRIVACY_POLICY_URL);
      if (supported) {
        await Linking.openURL(PRIVACY_POLICY_URL);
      } else {
        Alert.alert('열기 실패', '현재 개인정보처리방침 페이지를 열 수 없습니다.', [{ text: '확인' }]);
      }
    } catch (error) {
      console.error('개인정보처리방침 열기 중 오류:', error);
      Alert.alert('오류', '페이지로 이동하는 중 문제가 발생했습니다.', [{ text: '확인' }]);
    }
  };

  const handleTermsOfUsePress = async () => {
    const TERMS_OF_USE_URL = 'https://lake-speedboat-a83.notion.site/2a4b71a14112802795d9d090448b0f81?source=copy_link';
    try {
      const supported = await Linking.canOpenURL(TERMS_OF_USE_URL);
      if (supported) {
        await Linking.openURL(TERMS_OF_USE_URL);
      } else {
        Alert.alert('열기 실패', '현재 이용약관 페이지를 열 수 없습니다.', [{ text: '확인' }]);
      }
    } catch (error) {
      console.error('이용약관 열기 중 오류:', error);
      Alert.alert('오류', '페이지로 이동하는 중 문제가 발생했습니다.', [{ text: '확인' }]);
    }
  };

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      edges={['top']}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* Top Navigation (shared component) - Figma main type (no arrow) */}
      <Animated.View style={{ opacity: isContentReady ? contentOpacity : 0 }}>
      <TopNavigation type="main" title="설정" />
      </Animated.View>

      <Animated.View style={{ flex: 1, opacity: isContentReady ? contentOpacity : 0 }}>
        {/* Background */}
        <View style={[styles.background, { backgroundColor: colors.fill }]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            bounces={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
          >
          {/* Settings Card */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {/* Month Start Day */}
            <Pressable 
              style={[styles.settingRow, { height: 56 }]}
              onPress={handleMonthStartDayPress}
              accessibilityRole="button"
              accessibilityLabel="월 시작일 설정"
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>월 시작일</Text>
              <View style={styles.settingValue}>
                <Text style={[styles.settingValueText, { color: colors.textNeutral }]}>
                  {monthStartDay}
                </Text>
                <Icon name="arrowRight" size={24} color={colors.text} />
              </View>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Week Start Sunday */}
            <View style={[styles.settingRow, { height: 56 }]}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                한주 일요일 시작
              </Text>
              <View style={styles.settingValue}>
                <Switch 
                  value={weekStartsSunday}
                  onValueChange={handleWeekStartChange}
                />
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Notifications */}
            <Pressable
              style={[styles.settingRow, { height: 56 }]}
              onPress={() => {
                router.push('/notification-setting');
              }}
              accessibilityRole="button"
              accessibilityLabel="알림 설정"
            >
              <Text style={[styles.settingLabel, { color: colors.text }]}>알림 설정</Text>
              <View style={styles.settingValue}>
                <Icon name="arrowRight" size={24} color={colors.text} />
              </View>
            </Pressable>
          </View>

          {/* Category Settings Card */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {/* Income Category Settings */}
            <Pressable 
              style={styles.menuRow}
              onPress={() => {
                router.push('/category-setting?type=income');
              }}
              accessibilityRole="button"
              accessibilityLabel="수입 카테고리 설정"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>수입 카테고리 설정</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Expense Category Settings */}
            <Pressable 
              style={styles.menuRow}
              onPress={() => {
                router.push('/category-setting?type=expense');
              }}
              accessibilityRole="button"
              accessibilityLabel="지출 카테고리 설정"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>지출 카테고리 설정</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Payment Type Settings (UI only) */}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                router.push('/payment-type-setting');
              }}
              accessibilityRole="button"
              accessibilityLabel="결제 유형 설정"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>결제 유형 설정</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Recurring Record Management */}
            <Pressable
              style={styles.menuRow}
              onPress={() => {
                router.push('/recurring-record-management');
              }}
              accessibilityRole="button"
              accessibilityLabel="반복 기록 관리"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>반복 기록 관리</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Inquiry & Review Card */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {/* Inquiry */}
            <Pressable 
              style={styles.menuRow}
              onPress={handleInquiryPress}
              accessibilityRole="button"
              accessibilityLabel="문의하기"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>문의하기</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Review */}
            <Pressable 
              style={styles.menuRow}
              onPress={handleReviewPress}
              accessibilityRole="button"
              accessibilityLabel="리뷰 쓰기"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>리뷰 쓰기</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Policies */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <Pressable
              style={styles.menuRow}
              onPress={handlePrivacyPolicyPress}
              accessibilityRole="button"
              accessibilityLabel="개인정보처리방침"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>개인정보처리방침</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            <Pressable
              style={styles.menuRow}
              onPress={handleTermsOfUsePress}
              accessibilityRole="button"
              accessibilityLabel="이용약관"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>이용약관</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Data backup/restore (Figma: Frame 65) */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            <Pressable
              style={styles.menuRowSingle}
              onPress={() => router.push('/data-backup')}
              accessibilityRole="button"
              accessibilityLabel="데이터 백업/복원"
            >
              <Text style={[styles.menuLabel, { color: colors.text }]}>데이터 백업/복원</Text>
              <Icon name="arrowRight" size={24} color={colors.text} />
            </Pressable>
          </View>

          {/* Test Environment Card (only in __DEV__) */}
          {__DEV__ && (
            <View style={[styles.card, { backgroundColor: colors.background }]}>
              <Pressable 
                style={styles.menuRow}
                onPress={() => {

                  router.push('/(dev-tabs)/components');
                }}
                accessibilityRole="button"
                accessibilityLabel="테스트 환경 바로가기"
              >
                <Text style={[styles.menuLabel, { color: colors.text }]}>
                  테스트 환경 바로가기
                </Text>
                <Icon name="arrowRight" size={24} color={colors.text} />
              </Pressable>
            </View>
          )}
          </ScrollView>
        </View>
      </Animated.View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  
  // TopNavigation styles removed (using shared component)
  divider: {
    height: 1,
    marginHorizontal: 16,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 16,
    gap: 16,
  },

  // Background
  background: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    height: 56,
  },
  settingLabel: {
    ...typographyLayout.fieldLine,
  },
  settingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValueText: {
    ...typographyLayout.fieldLine,
  },

  // Menu Row
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  menuRowSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 58,
  },
  menuLabel: {
    ...typographyLayout.fieldLine,
  },
});
