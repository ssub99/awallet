/**
 * Notification Setting Screen
 *
 * UI-only screen for notification feature branching setup.
 * Functional behavior will be connected in a later task.
 */

import { TopNavigation } from '@/components/navigation/top-navigation';
import { SectionTitle } from '@/components/ui/section-title';
import { Switch } from '@/components/ui/switch';
import { UiLineText } from '@/components/ui/ui-line-text';
import { themeColors } from '@/constants/theme-colors';
import { typography } from '@/constants/typography';
import { useLoading } from '@/contexts/loading-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  handleNotificationToggle,
  hasAndroidExactAlarmPermission,
  showExactAlarmPermissionAlert,
} from '@/hooks/use-notifications';
import { checkActiveChallengesNotifications, checkEndedChallenges } from '@/utils/challenge-utils';
import {
  getChallengeNotificationsEnabled,
  getGeneralNotificationsEnabled,
  setChallengeNotificationsEnabled,
  setGeneralNotificationsEnabled,
} from '@/utils/notification-scheduler';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotificationSettingScreen() {
  const colorScheme = useColorScheme();
  const colors = themeColors[colorScheme ?? 'light'];
  const router = useRouter();
  const { setLoading } = useLoading();

  const [normalNotificationEnabled, setNormalNotificationEnabled] = useState(true);
  const [challengeNotificationEnabled, setChallengeNotificationEnabled] = useState(true);

  /** 알람 및 리마인더 설정 화면에서 돌아오면 일반 알림 ON 이어서 처리 */
  const exactAlarmPendingRef = useRef(false);

  useEffect(() => {
    const loadNotificationSettings = async () => {
      try {
        setLoading(true);
        const [generalEnabled, challengeEnabled, exactAlarmOk] = await Promise.all([
          getGeneralNotificationsEnabled(),
          getChallengeNotificationsEnabled(),
          hasAndroidExactAlarmPermission(),
        ]);
        const effectiveGeneral = generalEnabled && exactAlarmOk;
        setNormalNotificationEnabled(effectiveGeneral);
        setChallengeNotificationEnabled(challengeEnabled);
        if (generalEnabled !== effectiveGeneral) {
          await setGeneralNotificationsEnabled(false);
        }
      } finally {
        setLoading(false);
      }
    };

    loadNotificationSettings();
  }, [setLoading]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !exactAlarmPendingRef.current) return;
      void (async () => {
        if (!(await hasAndroidExactAlarmPermission())) return;
        exactAlarmPendingRef.current = false;
        setNormalNotificationEnabled(true);
        await setGeneralNotificationsEnabled(true);
      })();
    });
    return () => subscription.remove();
  }, []);

  const handleBack = () => {
    router.back();
  };

  const handleGeneralToggle = useCallback(
    async (value: boolean) => {
      const shouldEnable = await handleNotificationToggle(value);
      if (!shouldEnable) {
        return;
      }
      if (value && !(await hasAndroidExactAlarmPermission())) {
        exactAlarmPendingRef.current = true;
        showExactAlarmPermissionAlert(() => {
          exactAlarmPendingRef.current = false;
        });
        return;
      }
      exactAlarmPendingRef.current = false;
      setNormalNotificationEnabled(value);
      await setGeneralNotificationsEnabled(value);
    },
    []
  );

  const handleChallengeToggle = useCallback(
    async (value: boolean) => {
      const shouldEnable = await handleNotificationToggle(value);
      if (!shouldEnable) {
        return;
      }
      setChallengeNotificationEnabled(value);
      await setChallengeNotificationsEnabled(value);
      if (value) {
        await checkActiveChallengesNotifications();
        await checkEndedChallenges();
      }
    },
    []
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.staticWhite }]}
      edges={['top', 'bottom']}
    >
      <TopNavigation
        type="sub"
        title="알림 설정"
        showLeftIcon
        onLeftIconPress={handleBack}
      />

      <View style={[styles.contentWrapper, { backgroundColor: colors.fill }]}>
        <SectionTitle style={[styles.sectionTitleSpacing, { color: colors.staticBlack }]}>
          알림 형태
        </SectionTitle>

        <View style={[styles.card, { backgroundColor: colors.staticWhite }]}>
          <View style={styles.recurringSection}>
            <View style={styles.recurringTitleRow}>
              <UiLineText style={[styles.switchLabel, { color: colors.text }]}>일반 알림</UiLineText>
              <Switch
                value={normalNotificationEnabled}
                onValueChange={(value) => {
                  void handleGeneralToggle(value);
                }}
              />
            </View>
            <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                기록 알림에 대해 받아보실 수 있습니다.
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.recurringSection}>
            <View style={styles.recurringTitleRow}>
              <UiLineText style={[styles.switchLabel, { color: colors.text }]}>챌린지 알림</UiLineText>
              <Switch
                value={challengeNotificationEnabled}
                onValueChange={(value) => {
                  void handleChallengeToggle(value);
                }}
              />
            </View>
            <Text style={[styles.recurringCaption, { color: colors.textAssistive }]}>
                챌린지에 대해 알림을 받아보실 수 있습니다.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitleSpacing: {
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  recurringSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  recurringTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  switchLabel: {},
  recurringCaption: {
    ...typography.body02.regular,
    marginTop: 0,
  },
  divider: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
  },
});

