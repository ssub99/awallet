import { StackActions } from '@react-navigation/native';

type NavigationWithStackState = {
  getState: () => { routes: { name: string }[] } | undefined;
  dispatch: (action: ReturnType<typeof StackActions.pop>) => void;
};

/** 루트 스택에서 (tabs)까지 pop — reset 없이 기존 홈 인스턴스 유지 */
export function popToTabsRoute(navigation: NavigationWithStackState): boolean {
  const state = navigation.getState();
  if (!state?.routes?.length) {
    return false;
  }

  const tabsIndex = state.routes.findIndex((route) => route.name === '(tabs)');
  if (tabsIndex < 0) {
    return false;
  }

  const popCount = state.routes.length - 1 - tabsIndex;
  if (popCount <= 0) {
    return true;
  }

  navigation.dispatch(StackActions.pop(popCount));
  return true;
}
