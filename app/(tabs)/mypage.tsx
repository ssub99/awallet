/**
 * My Page Screen
 * 
 * User profile, settings, and app information screen
 * Matches Figma design: [Awallet]Mypage
 */

import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { ThemeColors } from '@/constants/theme-colors';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getNotificationPermissionStatus, handleNotificationToggle } from '@/hooks/use-notifications';
import { weekStartEvent } from '@/hooks/use-week-start';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as MailComposer from 'expo-mail-composer';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, AppStateStatus, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyPageScreen() {
  const colorScheme = useColorScheme();
  const colors = ThemeColors[colorScheme ?? 'light'];
  const appState = useRef(AppState.currentState);
  const router = useRouter();
  
  // Settings state
  const [monthStartDay, setMonthStartDay] = useState('1일');
  const [weekStartsSunday, setWeekStartsSunday] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  // Load settings from AsyncStorage on screen focus
  useFocusEffect(
    useCallback(() => {
      const loadSettings = async () => {
        try {
          const [startDay, weekStart, notifications] = await Promise.all([
            AsyncStorage.getItem('monthStartDay'),
            AsyncStorage.getItem('weekStartsSunday'),
            AsyncStorage.getItem('notificationsEnabled'),
          ]);

          if (startDay) setMonthStartDay(startDay);
          if (weekStart !== null) setWeekStartsSunday(JSON.parse(weekStart));
          if (notifications !== null) setNotificationsEnabled(JSON.parse(notifications));
        } catch (error) {

        }
      };

      loadSettings();
    }, [])
  );

  // Sync notification setting with system permission when app becomes active
  useEffect(() => {
    const syncNotificationSetting = async () => {
      try {
        const permissionStatus = await getNotificationPermissionStatus();
        const savedSetting = await AsyncStorage.getItem('notificationsEnabled');
        const currentSetting = savedSetting !== null ? JSON.parse(savedSetting) : true;

        // If permission is granted but setting is off, turn it on automatically
        if (permissionStatus === 'granted' && !currentSetting) {

          setNotificationsEnabled(true);
          await AsyncStorage.setItem('notificationsEnabled', JSON.stringify(true));
        }
        // If permission is denied but setting is on, turn it off automatically
        else if (permissionStatus === 'denied' && currentSetting) {

          setNotificationsEnabled(false);
          await AsyncStorage.setItem('notificationsEnabled', JSON.stringify(false));
        }
      } catch (error) {

      }
    };

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to foreground - sync notification setting

        syncNotificationSetting();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Also sync on mount
    syncNotificationSetting();

    return () => {
      subscription.remove();
    };
  }, []);

  // Save settings to AsyncStorage
  const handleWeekStartChange = async (value: boolean) => {
    setWeekStartsSunday(value);
    try {
      await AsyncStorage.setItem('weekStartsSunday', JSON.stringify(value));

      // Emit event to notify other components
      weekStartEvent.emit(value);

    } catch (error) {

    }
  };

  const handleNotificationsChange = async (value: boolean) => {
    // Check notification permission before enabling
    const shouldEnable = await handleNotificationToggle(value);
    
    if (!shouldEnable) {
      // Permission denied or not granted - don't enable the setting

      return;
    }
    
    // Permission granted or turning off - update setting
    setNotificationsEnabled(value);
    try {
      await AsyncStorage.setItem('notificationsEnabled', JSON.stringify(value));

    } catch (error) {

    }
  };

  // Navigation handlers
  const handleLoginPress = () => {

    // TODO: 로그인 화면으로 이동
  };

  const handleMonthStartDayPress = () => {

    router.push('/month-start-day');
  };

  const handleInquiryPress = async () => {

    try {
      // Check if mail composer is available
      const isAvailable = await MailComposer.isAvailableAsync();
      
      if (!isAvailable) {
        // Fallback to mailto URL
        const EMAIL = 'support@awallet.com';
        const mailtoUrl = `mailto:${EMAIL}`;
        
        Alert.alert(
          '메일 앱 없음',
          '기기에 메일 앱이 설정되어 있지 않습니다.\n\n아래 이메일로 직접 문의해주세요:\n' + EMAIL,
          [{ text: '확인' }]
        );

        return;
      }
      
      // Get app version
      const appVersion = Constants.expoConfig?.version ?? '1.0.0';
      
      // Get OS version
      const osVersion = Platform.Version;
      const osName = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
      
      // TODO: Replace with actual support email
      const EMAIL = 'support@awallet.com';
      const SUBJECT = '[AWallet] 문의하기';
      const BODY = `안녕하세요,

문의 내용을 작성해주세요.

---
앱 버전: ${appVersion}
플랫폼: ${osName} ${osVersion}`;
      
      // Open mail composer with pre-filled content
      const result = await MailComposer.composeAsync({
        recipients: [EMAIL],
        subject: SUBJECT,
        body: BODY,
      });
      
      if (result.status === 'sent') {

      } else if (result.status === 'saved') {

      } else if (result.status === 'cancelled') {

      }
    } catch (error) {

      Alert.alert(
        '오류',
        '메일을 작성하는 중 문제가 발생했습니다.',
        [{ text: '확인' }]
      );
    }
  };

  const handleReviewPress = async () => {

    try {
      let url = '';
      
      if (Platform.OS === 'ios') {
        // iOS App Store review URL
        if (__DEV__) {
          // Development: Open Expo Go app review page
          const EXPO_GO_APP_ID = '982107779';
          url = `https://apps.apple.com/app/id${EXPO_GO_APP_ID}?action=write-review`;

        } else {
          // Production: Open AWallet app review page
          // TODO: Replace with actual App Store Connect ID when app is published
          const APP_ID = 'YOUR_APP_STORE_ID';
          url = `https://apps.apple.com/app/id${APP_ID}?action=write-review`;
        }
      } else if (Platform.OS === 'android') {
        if (__DEV__) {
          // Development: Open Expo Go app review page
          const EXPO_GO_PACKAGE = 'host.exp.exponent';
          url = `market://details?id=${EXPO_GO_PACKAGE}`;

          // Fallback to web URL if Play Store app is not available
          const canOpen = await Linking.canOpenURL(url);
          if (!canOpen) {
            url = `https://play.google.com/store/apps/details?id=${EXPO_GO_PACKAGE}`;
          }
        } else {
          // Production: Open AWallet app review page
          const PACKAGE_NAME = 'com.ssong.awallet';
          url = `market://details?id=${PACKAGE_NAME}`;
          
          const canOpen = await Linking.canOpenURL(url);
          if (!canOpen) {
            url = `https://play.google.com/store/apps/details?id=${PACKAGE_NAME}`;
          }
        }
      } else {
        // Web or other platforms
        Alert.alert(
          '리뷰 작성',
          __DEV__ 
            ? 'Expo Go 앱 스토어 페이지로 이동합니다.'
            : '앱 스토어에서 AWallet을 검색하여 리뷰를 남겨주세요!',
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

      Alert.alert(
        '오류',
        '앱 스토어를 여는 중 문제가 발생했습니다.',
        [{ text: '확인' }]
      );
    }
  };

  return (
    <SafeAreaView 
      style={[styles.container, { backgroundColor: colors.background }]} 
      edges={['top']}
    >
      <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Navigation */}
      <View style={styles.topNavigation}>
        <View style={styles.topNavigationContent}>
          <Text style={[styles.pageTitle, { color: colors.text }]}>마이페이지</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Background */}
        <View style={[styles.background, { backgroundColor: colors.fill }]}>
          {/* Login Card */}
          <Pressable 
            style={[styles.card, styles.loginCard, { backgroundColor: colors.background }]}
            onPress={handleLoginPress}
            accessibilityRole="button"
            accessibilityLabel="로그인하기"
          >
            <View style={styles.loginContent}>
              {/* Profile Icon */}
              <View style={styles.profileIconContainer}>
                <Icon name="profile" size={48} color={colors.textAssistive} />
              </View>

              {/* Login Text */}
              <Text style={[styles.loginText, { color: colors.staticBlack }]}>
                로그인 후 동기화를 진행해 보세요.
              </Text>
            </View>

            {/* Arrow Icon */}
            <Icon name="arrowRight" size={24} color={colors.text} />
          </Pressable>

          {/* Settings Card */}
          <View style={[styles.card, { backgroundColor: colors.background }]}>
            {/* Month Start Day */}
            <Pressable 
              style={styles.settingRow}
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
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>
                한주 일요일 시작
              </Text>
              <Switch 
                value={weekStartsSunday}
                onValueChange={handleWeekStartChange}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Notifications */}
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>알림 설정</Text>
              <Switch 
                value={notificationsEnabled}
                onValueChange={handleNotificationsChange}
              />
            </View>
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
        </View>
      </ScrollView>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  pageTitle: {
    ...Typography.headline4.r.bold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    opacity: 0.16,
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  // Background
  background: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },

  // Login Card
  loginCard: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 94,
  },
  loginContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  profileIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginText: {
    ...Typography.body1.l.medium,
    flex: 1,
  },

  // Setting Row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  settingLabel: {
    ...Typography.body1.l.regular,
  },
  settingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValueText: {
    ...Typography.body1.l.regular,
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
  menuLabel: {
    ...Typography.body1.l.regular,
  },
});
