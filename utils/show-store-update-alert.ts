import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';

const ALERT_TITLE = '업데이트 안내';

function getStoreListingUrl(): string | null {
  const ios = Constants.expoConfig?.ios?.appStoreUrl;
  const android = Constants.expoConfig?.android?.playStoreUrl;
  if (Platform.OS === 'ios') {
    return typeof ios === 'string' && ios.length > 0 ? ios : null;
  }
  return typeof android === 'string' && android.length > 0 ? android : null;
}

async function openStoreListing(): Promise<void> {
  const url = getStoreListingUrl();
  if (url == null) return;
  try {
    await Linking.openURL(url);
  } catch {
    // 스토어 링크 실패 시 무시
  }
}

/**
 * iOS/Android 시스템 알림으로 스토어 업데이트 유도.
 * 스토어 URL은 앱 번들(`app.json`) 값만 사용.
 */
export function showStoreUpdateAlert(
  forceUpdate: boolean,
  message: string,
  onDismissOptional: () => void,
): void {
  const updateButton = {
    text: '업데이트',
    onPress: () => {
      void openStoreListing();
    },
  };

  const buttons = forceUpdate
    ? [updateButton]
    : [
        updateButton,
        {
          text: '나중에',
          style: 'cancel' as const,
          onPress: onDismissOptional,
        },
      ];

  Alert.alert(ALERT_TITLE, message, buttons, {
    cancelable: !forceUpdate,
    ...(forceUpdate ? {} : { onDismiss: onDismissOptional }),
  });
}
