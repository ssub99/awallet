import Constants from 'expo-constants';

const canUseIosNativeStatusBarOptions = Constants.appOwnership !== 'expo';

/** iOS UIViewControllerBasedStatusBarAppearance=true — RN StatusBar 대신 Native Stack options 사용 */
export const ROOT_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  ...(canUseIosNativeStatusBarOptions ? { statusBarStyle: 'dark' as const } : null),
} as const;
