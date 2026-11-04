import * as SplashScreen from 'expo-splash-screen';

/**
 * SDK 58 expo-router는 Content 마운트 후 `internalMaybeHideAsync`로 스플래시를 숨긴다.
 * 그 API는 앱이 `preventAutoHideAsync`로 `userControlledAutoHideEnabled`를 켠 뒤에만 스킵된다.
 * (`internalPreventAutoHideAsync`만으로는 막히지 않음.)
 * 엔트리에서 renderRootComponent보다 먼저 호출해야 한다.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});
