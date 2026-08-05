import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, StatusBar, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransitionProgress } from 'react-native-screens';

function computeStatusBarCoverageThreshold(windowHeight: number, statusBarInset: number): number {
  if (windowHeight <= 0 || statusBarInset <= 0) {
    return 0.92;
  }
  return 1 - statusBarInset / windowHeight;
}

function applyStatusBarForViewerCoverage(coversStatusBar: boolean) {
  StatusBar.setBarStyle(coversStatusBar ? 'light-content' : 'dark-content', true);
}

/** iOS Native Stack — slide_from_bottom progress 기준으로 status bar 스타일 동기화 */
function NoticeImageViewerStatusBarSyncIos() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { progress } = useTransitionProgress();
  const coversStatusBarRef = useRef(false);

  useEffect(() => {
    const threshold = computeStatusBarCoverageThreshold(windowHeight, insets.top);

    const syncFromProgress = (value: number) => {
      const coversStatusBar = value >= threshold;
      if (coversStatusBarRef.current === coversStatusBar) {
        return;
      }
      coversStatusBarRef.current = coversStatusBar;
      applyStatusBarForViewerCoverage(coversStatusBar);
    };

    const progressSubscription = progress.addListener(({ value }) => {
      syncFromProgress(value);
    });

    const transitionEndSubscription = navigation.addListener('transitionEnd', (event) => {
      const closing = event.data?.closing === true;
      coversStatusBarRef.current = !closing;
      applyStatusBarForViewerCoverage(!closing);
    });

    return () => {
      progress.removeListener(progressSubscription);
      transitionEndSubscription();
      coversStatusBarRef.current = false;
      applyStatusBarForViewerCoverage(false);
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
