import Constants from 'expo-constants';

const canUseIosNativeStatusBarOptions = Constants.appOwnership !== 'expo';

/** iOS UIViewControllerBasedStatusBarAppearance=true — RN StatusBar 대신 Native Stack options 사용 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  /** 가려진 스크린 freeze — 뒤로가기 제스처 중 아래 화면 실시간 합성 비용 감소 */
  freezeOnBlur: true,
  ...(canUseIosNativeStatusBarOptions ? { statusBarStyle: 'dark' as const } : null),
} as const;
