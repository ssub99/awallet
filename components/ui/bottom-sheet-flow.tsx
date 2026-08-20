import { atomicColors } from '@/constants/atomic-colors';
import { colors } from '@/constants/theme';
import { Icon } from '@/components/ui/icon';
import { ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type EasingFunction,
} from 'react-native';

export type BottomSheetFlowScreen = {
  key: string;
  title: string;
  left: 'close' | 'back';
  backKey?: string;
  onLeftPress: () => void;
  right?: {
    label: string;
    onPress: () => void;
  };
  showHandle?: boolean;
  swipeBackEnabled?: boolean;
  content: ReactNode;
  footer?: ReactNode;
};

export type BottomSheetFlowProps = {
  activeKey: string;
  screens: BottomSheetFlowScreen[];
  duration?: number;
  easing?: EasingFunction;
};

const DEFAULT_DURATION = 350;
const DEFAULT_EASING = Easing.bezier(0.42, 0, 0.58, 1);

export function BottomSheetFlow({
  activeKey,
  screens,
  duration = DEFAULT_DURATION,
  easing = DEFAULT_EASING,
}: BottomSheetFlowProps) {
  const { width } = useWindowDimensions();
  const previousActiveKeyRef = useRef(activeKey);
  const suppressNextAnimationRef = useRef(false);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const translateXMapRef = useRef<Record<string, Animated.Value>>({});

  screens.forEach((screen, index) => {
    if (!translateXMapRef.current[screen.key]) {
      translateXMapRef.current[screen.key] = new Animated.Value(screen.key === activeKey ? 0 : width * (index > 0 ? 1 : -1));
    }
  });

  const activeIndex = screens.findIndex((screen) => screen.key === activeKey);
  const activeScreen = activeIndex >= 0 ? screens[activeIndex] : screens[0];
  const previousScreen = activeScreen?.backKey
    ? screens.find((screen) => screen.key === activeScreen.backKey)
    : activeIndex > 0
      ? screens[activeIndex - 1]
      : undefined;

  useEffect(() => {
    const previousKey = previousActiveKeyRef.current;
    if (previousKey === activeKey) {
      return;
    }

    const previousIndex = screens.findIndex((screen) => screen.key === previousKey);
    const nextIndex = screens.findIndex((screen) => screen.key === activeKey);
    const previousValue = translateXMapRef.current[previousKey];
    const nextValue = translateXMapRef.current[activeKey];

    previousActiveKeyRef.current = activeKey;

    if (!previousValue || !nextValue || previousIndex < 0 || nextIndex < 0) {
      return;
    }

    animationRef.current?.stop();

    screens.forEach((screen, index) => {
      if (screen.key === previousKey || screen.key === activeKey) {
        return;
      }
      translateXMapRef.current[screen.key]?.setValue(index > nextIndex ? width : -width);
    });

    if (suppressNextAnimationRef.current) {
      suppressNextAnimationRef.current = false;
      previousValue.setValue(nextIndex > previousIndex ? -width : width);
      nextValue.setValue(0);
      return;
    }

    const isPush = nextIndex > previousIndex;
    nextValue.setValue(isPush ? width : -width);

    animationRef.current = Animated.parallel([
      Animated.timing(previousValue, {
        toValue: isPush ? -width : width,
        duration,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(nextValue, {
        toValue: 0,
        duration,
        easing,
        useNativeDriver: true,
      }),
    ]);

    animationRef.current.start();
  }, [activeKey, duration, easing, screens, width]);

  const activeTranslateX = activeScreen ? translateXMapRef.current[activeScreen.key] : undefined;
  const previousTranslateX = previousScreen ? translateXMapRef.current[previousScreen.key] : undefined;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (!activeScreen?.swipeBackEnabled || activeScreen.left !== 'back' || !previousScreen || !activeTranslateX || !previousTranslateX) {
            return false;
          }
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          return absDx > 12 && absDx > absDy * 1.2;
        },
        onPanResponderGrant: () => {
          animationRef.current?.stop();
        },
        onPanResponderMove: (_, gestureState) => {
          if (!activeTranslateX || !previousTranslateX) return;
          const dragX = Math.max(0, gestureState.dx);
          activeTranslateX.setValue(dragX);
          previousTranslateX.setValue(-width + dragX);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!activeScreen || !activeTranslateX || !previousTranslateX) return;

          const shouldGoBack = gestureState.dx > Math.min(width * 0.25, 96) || gestureState.vx > 0.45;
          const toCurrent = shouldGoBack ? width : 0;
          const toPrevious = shouldGoBack ? 0 : -width;

          animationRef.current = Animated.parallel([
            Animated.timing(activeTranslateX, {
              toValue: toCurrent,
              duration,
              easing,
              useNativeDriver: true,
            }),
            Animated.timing(previousTranslateX, {
              toValue: toPrevious,
              duration,
              easing,
              useNativeDriver: true,
            }),
          ]);
          animationRef.current.start(({ finished }) => {
            if (finished && shouldGoBack) {
              suppressNextAnimationRef.current = true;
              activeScreen.onLeftPress();
            }
          });
        },
        onPanResponderTerminate: () => {
          if (!activeTranslateX || !previousTranslateX) return;
          animationRef.current = Animated.parallel([
            Animated.timing(activeTranslateX, {
              toValue: 0,
              duration,
              easing,
              useNativeDriver: true,
            }),
            Animated.timing(previousTranslateX, {
              toValue: -width,
              duration,
              easing,
              useNativeDriver: true,
            }),
          ]);
          animationRef.current.start();
        },
      }),
    [activeScreen, activeTranslateX, duration, easing, previousScreen, previousTranslateX, width],
  );

  return (
    <View style={styles.root}>
      {screens.map((screen) => {
        const translateX = translateXMapRef.current[screen.key];
        const isActive = screen.key === activeKey;
        const isPrevious = screen.key === previousScreen?.key;

        return (
          <Animated.View
            key={screen.key}
            pointerEvents={isActive ? 'auto' : 'none'}
            {...(isActive ? panResponder.panHandlers : null)}
            style={[
              styles.screen,
              {
                zIndex: isActive ? 2 : isPrevious ? 1 : 0,
                transform: [{ translateX }],
              },
            ]}
          >
            <View style={styles.navigation}>
              {screen.showHandle ? (
                <View style={styles.handleWrap} pointerEvents="none">
                  <View style={styles.handle} />
                </View>
              ) : null}
              <View style={styles.navContent}>
                <View style={styles.navSide}>
                  <Pressable
                    onPress={screen.onLeftPress}
                    style={styles.navIconButton}
                    accessibilityRole="button"
                    accessibilityLabel={screen.left === 'back' ? '이전' : '닫기'}
                  >
                    <Icon name={screen.left === 'back' ? 'arrowLeft' : 'close'} variant="line" size={24} color={atomicColors.neutral[900]} />
                  </Pressable>
                </View>
                <View style={styles.titleContainer}>
                  <Text style={styles.title}>{screen.title}</Text>
                </View>
                <View style={[styles.navSide, styles.navRight]}>
                  {screen.right ? (
                    <Pressable
                      onPress={screen.right.onPress}
                      style={styles.confirmButton}
                      accessibilityRole="button"
                      accessibilityLabel={screen.right.label}
                    >
                      <Text style={styles.confirmText}>{screen.right.label}</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.navEmpty} />
                  )}
                </View>
              </View>
              <View style={styles.divider} />
            </View>
            <View style={styles.content}>{screen.content}</View>
            {screen.footer}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    overflow: 'hidden',
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    minHeight: 0,
  },
  navigation: {
    backgroundColor: atomicColors.common[0],
  },
  handleWrap: {
    position: 'absolute',
    top: 4,
    left: 0,
    right: 0,
    height: 44,
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 1,
  },
  handle: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: atomicColors.neutral[300],
  },
  navContent: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navSide: {
    width: 80,
    alignItems: 'flex-start',
  },
  navRight: {
    alignItems: 'flex-end',
  },
  navIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: atomicColors.neutral[900],
    fontFamily: 'Pretendard-Bold',
    fontSize: 16,
    lineHeight: 24,
    includeFontPadding: false,
  },
  confirmButton: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: atomicColors.blue[500],
  },
  confirmText: {
    color: atomicColors.common[0],
    fontFamily: 'Pretendard-Bold',
    fontSize: 14,
    lineHeight: 21,
    includeFontPadding: false,
  },
  navEmpty: {
    width: 32,
    height: 32,
  },
  divider: {
    height: 1,
    backgroundColor: colors.light.border,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
});
