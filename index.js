// `@expo/metro-runtime` MUST be first (expo-router entry contract).
import '@expo/metro-runtime';
// Before renderRootComponent: win the race against expo-router's maybeHideSplashScreen.
import './utils/prevent-splash-autohide';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

renderRootComponent(App);
