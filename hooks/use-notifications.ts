/**
 * Use Notifications Hook
 *
 * - 알림 권한 OS 모달은 사용자 액션(문자 수신 ON / 알림 설정 토글)에서만 요청
 * - 첫 실행에서 미리 요청하지 않음 (undetermined 소진 방지)
 */

import { useEffect, useState } from 'react';

import { getExpoNotifications } from '@/utils/expo-notifications-client';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

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
 * 부트스트랩용 — 알림 스케줄 정리 타이밍만 맞춤.
 * OS 권한 모달은 여기서 요청하지 않음 (문자 수신 ON / 알림 설정에서 요청).
 */
export function useFirstLaunchNotificationPermission() {
  const [permissionChecked, setPermissionChecked] = useState(false);

  useEffect(() => {
    setPermissionChecked(true);
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

