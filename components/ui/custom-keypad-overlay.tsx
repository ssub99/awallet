import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { EdgeInsets, useSafeAreaInsets } from 'react-native-safe-area-context';

type CustomKeypadOverlayProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Android system navigation bar inset (gesture / 3-button / minimized — native value).
 * iOS overlays that embed a Figma home-indicator zone in the child should use 0 here.
 */
export function getAndroidNavigationBarInset(insets: Pick<EdgeInsets, 'bottom'>): number {
  return Platform.OS === 'android' ? insets.bottom : 0;
}

/**
 * iOS home indicator / generic bottom system inset for shells without an embedded indicator UI.
 */
export function getIosSystemBottomInset(insets: Pick<EdgeInsets, 'bottom'>): number {
  return Platform.OS === 'ios' ? insets.bottom : 0;
}

/**
 * Full-screen overlay that slides the custom keypad from the bottom.
 * Android: sit above system navigation bar (Figma has no home-indicator zone).
 * iOS: flush to screen bottom; CustomKeypad includes home-indicator area internally.
 */
export function CustomKeypadOverlay({ children, style }: CustomKeypadOverlayProps) {
  const insets = useSafeAreaInsets();
  const navigationBarInset = getAndroidNavigationBarInset(insets);

  return (
    <View
      style={[styles.overlay, { paddingBottom: navigationBarInset }, style]}
      pointerEvents="box-none"
    >
      {children}
    </View>
  );
}

/** ScrollView paddingBottom when custom keypad is open */
export function getCustomKeypadScrollPaddingBottom(
  keypadHeight: number,
  safeAreaBottom: number
): number {
  if (Platform.OS === 'android') {
    return keypadHeight + 16 + safeAreaBottom;
  }
  return keypadHeight + 16 - safeAreaBottom;
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    justifyContent: 'flex-end',
    zIndex: 100,
    elevation: 100,
  },
});
