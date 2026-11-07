import Constants from 'expo-constants';
import { Platform } from 'react-native';

const canUseIosNativeStatusBarOptions = Constants.appOwnership !== 'expo';

/**
 * 루트·탭 소유 Stack 공통 옵션.
 * Android: Expo 58 이전 JS Stack(`forHorizontalIOS`)과 동일하게 가로 슬라이드 복구.
 * statusBarStyle: Native Stack·중첩 Stack용. 루트 Android JS Stack Screen에는 옵션이 안 넘어가며,
 * 미설정 시 RNS 기본은 패치로 `"dark"`(patches/react-native-screens) — upstream은 `"light"`.
 * iOS: UIViewControllerBasedStatusBarAppearance=true — RN StatusBar 대신 이 옵션 사용.
 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  /** 가려진 스크린 freeze — 뒤로가기 제스처 중 아래 화면 실시간 합성 비용 감소 */
  freezeOnBlur: true,
  ...(Platform.OS === 'android'
    ? ({
        animation: 'slide_from_right' as const,
        /** Expo 58 이전 JS Stack의 gestureEnabled — 가장자리 스와이프로 pop */
        gestureEnabled: true,
      } as const)
    : null),
  ...(canUseIosNativeStatusBarOptions ? { statusBarStyle: 'dark' as const } : null),
} as const;
