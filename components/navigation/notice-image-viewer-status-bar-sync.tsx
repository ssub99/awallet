import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransitionProgress } from 'react-native-screens';

const canUseIosNativeStatusBarOptions = Constants.appOwnership !== 'expo';

function computeStatusBarCoverageThreshold(windowHeight: number, statusBarInset: number): number {
  if (windowHeight <= 0 || statusBarInset <= 0) {
    return 0.92;
  }
  return 1 - statusBarInset / windowHeight;
}

type NoticeImageViewerNavigation = NativeStackNavigationProp<ParamListBase>;

function applyStatusBarForViewerCoverage(
  navigation: NoticeImageViewerNavigation,
  coversStatusBar: boolean,
) {
  navigation.setOptions({
    statusBarStyle: coversStatusBar ? 'light' : 'dark',
  });
}

function NoticeImageViewerStatusBarSyncIos() {
  const navigation = useNavigation<NoticeImageViewerNavigation>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { progress } = useTransitionProgress();
  const coversStatusBarRef = useRef(false);

  useEffect(() => {
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

export function NoticeImageViewerStatusBarSync({
  isDismissing: _isDismissing = false,
}: {
  isDismissing?: boolean;
}) {
  if (Platform.OS === 'ios' && canUseIosNativeStatusBarOptions) {
    return <NoticeImageViewerStatusBarSyncIos />;
  }
  return null;
}
