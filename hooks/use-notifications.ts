/**
 * Use Notifications Hook
 *
 * - 첫 실행: 알림 권한 OS 모달 요청 (ATT는 permissionChecked 이후)
 * - 알림 설정 토글 ON 시에도 권한 확인·요청
 * - 문자 수신은 RECEIVE_SMS / 알림 접근 등 별도 경로 (여기와 무관)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { getExpoNotifications } from '@/utils/expo-notifications-client';
import {
  setChallengeNotificationsEnabled,
  setGeneralNotificationsEnabled,
} from '@/utils/notification-scheduler';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

const HAS_REQUESTED_PERMISSION_KEY = 'hasRequestedNotificationPermission';

/**
 * Request notification permission
 * Returns true if permission granted, false otherwise
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return false;
    }
    // 항상 request 호출 — 이미 granted/denied면 OS가 모달 없이 즉시 반환
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (error) {

    return false;
  }
}

async function hasRequestedPermission(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(HAS_REQUESTED_PERMISSION_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

async function markPermissionAsRequested(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAS_REQUESTED_PERMISSION_KEY, 'true');
  } catch {
    // ignore
  }
}

/**
 * Get current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const Notifications = getExpoNotifications();
    if (!Notifications) {
      return 'undetermined';
    }
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch (error) {

    return 'undetermined';
  }
}

/**
 * Open OS app settings (notification permission can be changed there).
 */
export function openAppNotificationSettings(): void {
  if (Platform.OS === 'ios') {
    void Linking.openURL('app-settings:');
    return;
  }
  void Linking.openSettings();
}

/**
 * SMS 수신 ON 권한 플로우 결과
 * - skipped: Android 아님 — 이 플로우 미적용
 * - granted: 이미 허용 — 추가 동작 없음
 * - prompted: OS 시스템 모달 후(또는 거부 상태에서) 설정 이동
 */
export type SmsReceivePermissionFlowResult = 'skipped' | 'granted' | 'prompted';

/**
 * SMS 수신 ON용 권한 플로우 — **Android만**.
 *
 * 1) undetermined / 다시 물을 수 있음 → OS 시스템 모달(허용/거부) → 설정
 * 2) denied(다시 못 물음) → OS 모달 없이 설정으로 이동
 * 3) granted → 아무 것도 안 함
 *
 * iOS는 no-op (`skipped`). 인앱 「알림 권한 설정 안내」는 Android 안내 버튼 전용.
 */
export async function requestNotificationPermissionThenOpenSettings(): Promise<SmsReceivePermissionFlowResult> {
  if (Platform.OS !== 'android') {
    return 'skipped';
  }

  const Notifications = getExpoNotifications();

  // Expo Go Android 등 — Notifications 모듈 없음 → PermissionsAndroid
  if (!Notifications) {
    const apiLevel =
      typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
    if (!Number.isFinite(apiLevel) || apiLevel < 33) {
      openAppNotificationSettings();
      return 'prompted';
    }

    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const alreadyGranted = await PermissionsAndroid.check(permission);
    if (alreadyGranted) {
      return 'granted';
    }

    await PermissionsAndroid.request(permission);
    openAppNotificationSettings();
    return 'prompted';
  }

  const before = await Notifications.getPermissionsAsync();
  if (before.status === 'granted') {
    return 'granted';
  }

  // undetermined / canAskAgain → OS 시스템 모달
  // denied + 다시 못 물음 → 모달 스킵 후 설정
  if (before.status !== 'denied' || before.canAskAgain === true) {
    await Notifications.requestPermissionsAsync();
  }

  openAppNotificationSettings();
  return 'prompted';
}

/**
 * Show alert to guide user to app settings
 */
export function showSettingsAlert(): void {
  Alert.alert(
    'A⋅Wallet에서 알림을 보내고자 합니다.',
    '소비 기록 알림과 챌린지 리마인더를 받기 위해 알림 권한이 필요합니다.',
    [
      {
        text: '허용 안 함',
        style: 'cancel',
      },
      {
        text: '허용',
        onPress: () => {
          openAppNotificationSettings();
        },
      },
    ]
  );
}

/**
 * OS 알림 권한이 granted가 아니면 앱 안 일반/챌린지 알림을 OFF로 맞춘다.
 * (기본 ON + 미허용 불일치 해소)
 */
export async function syncInAppNotificationSettingsWithOsPermission(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  const status = await getNotificationPermissionStatus();
  if (status === 'granted') {
    return status;
  }

  await Promise.all([
    setGeneralNotificationsEnabled(false),
    setChallengeNotificationsEnabled(false),
  ]);
  return status;
}

/**
 * 첫 실행(앱 설치 후 1회) 알림 권한 요청.
 * 완료 후 permissionChecked → ATT·알림 스케줄 부트스트랩이 이어짐.
 */
export function useFirstLaunchNotificationPermission() {
  const [permissionChecked, setPermissionChecked] = useState(false);

  useEffect(() => {
    const checkAndRequestPermission = async () => {
      try {
        const hasRequested = await hasRequestedPermission();
        if (!hasRequested) {
          await requestNotificationPermission();
          await markPermissionAsRequested();
        }
        await syncInAppNotificationSettingsWithOsPermission();
      } finally {
        setPermissionChecked(true);
      }
    };

    void checkAndRequestPermission();
  }, []);

  return { permissionChecked };
}

/**
 * Request permission when user enables notifications in settings
 * Returns true if should enable the setting, false if permission denied
 */
export async function handleNotificationToggle(newValue: boolean): Promise<boolean> {
  if (!newValue) {
    // Turning off - always allowed
    return true;
  }

  // Turning on - check permission

  const currentStatus = await getNotificationPermissionStatus();

  if (currentStatus === 'granted') {
    // Already have permission
    return true;
  }
  
  if (currentStatus === 'denied') {
    // Permission was denied - guide user to settings

    showSettingsAlert();
    return false;
  }
  
  // Permission not determined - request it

  const granted = await requestNotificationPermission();
  
  if (!granted) {

    return false;
  }

  return true;
}

