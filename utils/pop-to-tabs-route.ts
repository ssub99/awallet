import { StackActions } from "expo-router/react-navigation";

type NavigationWithStackState = {
  getState: () => { routes: { name: string }[] } | undefined;
  dispatch: (action: ReturnType<typeof StackActions.pop>) => void;
  getParent?: () => NavigationWithStackState | undefined;
};

/** 루트 스택에서 (tabs)까지 pop — reset 없이 기존 탭 인스턴스 유지 */
export function popToTabsRoute(navigation: NavigationWithStackState): boolean {
  let current: NavigationWithStackState | undefined = navigation;

  while (current) {
    const state = current.getState();
    if (state?.routes?.length) {
      const tabsIndex = state.routes.findIndex((route) => route.name === "(tabs)");
      if (tabsIndex >= 0) {
        const popCount = state.routes.length - 1 - tabsIndex;
        if (popCount > 0) {
          current.dispatch(StackActions.pop(popCount));
        }
        return true;
      }
    }
    current = current.getParent?.();
  }

  return false;
}
