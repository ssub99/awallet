import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';

/** iOS는 Native Stack route option, Android는 화면 mounted 동안 Expo StatusBar로 제어한다. */
export function NoticeImageViewerStatusBarSync() {
  if (Platform.OS !== 'android') {
    return null;
  }

  return <ExpoStatusBar style="light" translucent backgroundColor="transparent" />;
}
