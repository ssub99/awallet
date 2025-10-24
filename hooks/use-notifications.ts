/**
 * Use Notifications Hook
 * 
 * Manages notification permissions and settings
 * - Request permission on first app launch
 * - Check permission when user enables notifications in settings
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

const HAS_REQUESTED_PERMISSION_KEY = 'hasRequestedNotificationPermission';

/**
 * Request notification permission
 * Returns true if permission granted, false otherwise
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    let finalStatus = existingStatus;
    
    // If not determined yet, ask user
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    return finalStatus === 'granted';
  } catch (error) {

    return false;
  }
}

/**
 * Check if permission has been requested before
 */
export async function hasRequestedPermission(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(HAS_REQUESTED_PERMISSION_KEY);
    return value === 'true';
  } catch (error) {

    return false;
  }
}

/**
 * Mark permission as requested
 */
export async function markPermissionAsRequested(): Promise<void> {
  try {
    await AsyncStorage.setItem(HAS_REQUESTED_PERMISSION_KEY, 'true');

  } catch (error) {

  }
}

/**
 * Get current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status as 'granted' | 'denied' | 'undetermined';
  } catch (error) {

    return 'undetermined';
  }
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
          if (Platform.OS === 'ios') {
            Linking.openURL('app-settings:');
          } else {
            Linking.openSettings();
          }
        },
      },
    ]
  );
}

/**
 * Hook to manage notification permission on first app launch
 */
export function useFirstLaunchNotificationPermission() {
  const [permissionChecked, setPermissionChecked] = useState(false);

  useEffect(() => {
    const checkAndRequestPermission = async () => {
      try {
        // Check if we've already requested permission
        const hasRequested = await hasRequestedPermission();
        
        if (!hasRequested) {

          // Request permission
          const granted = await requestNotificationPermission();
          
          // Mark as requested (regardless of result)
          await markPermissionAsRequested();
          
          if (granted) {

          } else {

          }
        } else {

        }
        
        setPermissionChecked(true);
      } catch (error) {

        setPermissionChecked(true);
      }
    };

    checkAndRequestPermission();
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

