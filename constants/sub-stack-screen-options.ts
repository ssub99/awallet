/** iOS UIViewControllerBasedStatusBarAppearance=true — RN StatusBar 대신 Native Stack options 사용 */
export const SUB_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  statusBarStyle: 'dark' as const,
} as const;

export const SUB_STACK_SCREEN_GESTURE_OPTIONS = {
  ...SUB_STACK_SCREEN_OPTIONS,
  gestureEnabled: true,
} as const;
