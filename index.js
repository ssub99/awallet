// `@expo/metro-runtime` MUST be first (expo-router entry contract).
import '@expo/metro-runtime';
// Before renderRootComponent: win the race against expo-router's maybeHideSplashScreen.
import './utils/prevent-splash-autohide';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { enableFreeze } from 'react-native-screens';

// 스택 위 화면(타임라인 등) 뒤의 홈·탭을 freeze — 인터랙티브 pop 스크럽 버벅임 완화
enableFreeze(true);

renderRootComponent(App);
