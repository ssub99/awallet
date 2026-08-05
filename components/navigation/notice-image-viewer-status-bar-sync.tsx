import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransitionProgress } from 'react-native-screens';

function computeStatusBarCoverageThreshold(windowHeight: number, statusBarInset: number): number {
  if (windowHeight <= 0 || statusBarInset <= 0) {
    return 0.92;
  }
  return 1 - statusBarInset / windowHeight;
}

/** UIViewControllerBasedStatusBarAppearance=true — RN StatusBar.setBarStyle 금지, Native Stack options 사용 */
function applyStatusBarForViewerCoverage(
  navigation: NativeStackNavigationProp<Record<string, unknown>>,
  coversStatusBar: boolean,
) {
  navigation.setOptions({
    statusBarStyle: coversStatusBar ? 'light' : 'dark',
  });
}

/** iOS Native Stack — slide_from_bottom progress 기준으로 status bar 스타일 동기화 */
function NoticeImageViewerStatusBarSyncIos() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, unknown>>>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { progress } = useTransitionProgress();
  const coversStatusBarRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({ statusBarStyle: 'dark' });
  }, [navigation]);

  useEffect(() => {
    const threshold = computeStatusBarCoverageThreshold(windowHeight, insets.top);

    const syncFromProgress = (value: number) => {
      const coversStatusBar = value >= threshold;
      if (coversStatusBarRef.current === coversStatusBar) {
        return;
      }
      coversStatusBarRef.current = coversStatusBar;
      applyStatusBarForViewerCoverage(navigation, coversStatusBar);
    };

    const progressSubscription = progress.addListener(({ value }) => {
      syncFromProgress(value);
    });

    const transitionEndSubscription = navigation.addListener('transitionEnd', (event) => {
      const closing = event.data?.closing === true;
      coversStatusBarRef.current = !closing;
      applyStatusBarForViewerCoverage(navigation, !closing);
    });

    return () => {
      progress.removeListener(progressSubscription);
      transitionEndSubscription();
      coversStatusBarRef.current = false;
    };
  }, [insets.top, navigation, progress, windowHeight]);

  return null;
}

export function NoticeImageViewerStatusBarSync() {
  if (Platform.OS !== 'ios') {
    return null;
  }

  return <NoticeImageViewerStatusBarSyncIos />;
}
