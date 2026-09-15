import { Linking, PermissionsAndroid, Platform } from 'react-native';

export type AndroidSmsPermissionResult = 'granted' | 'denied' | 'blocked' | 'skipped';

export async function hasAndroidSmsReceivePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
}

export async function requestAndroidSmsReceivePermission(): Promise<AndroidSmsPermissionResult> {
  if (Platform.OS !== 'android') return 'skipped';
  if (await hasAndroidSmsReceivePermission()) return 'granted';

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
  );
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

export function openAndroidAppSettings(): void {
  if (Platform.OS === 'android') {
    void Linking.openSettings();
  }
}
