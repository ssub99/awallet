import { useThemeColor } from '@/hooks/use-theme-color';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ImageSourcePropType, StyleSheet, View } from 'react-native';

const ICON_FADE_DURATION = 2500;
const ICON_POSITION_DURATION = 1500;
const HOLD_DURATION = 500;
const OVERLAY_FADE_DURATION_OUT = 200;
const INITIAL_ICON_OFFSET = 40;

const SplashVisibilityContext = createContext(true);

export const useSplashVisibility = () => useContext(SplashVisibilityContext);

interface AnimatedSplashOverlayProps {
  children: React.ReactNode;
  onFinish?: () => void;
}

export const AnimatedSplashOverlay: React.FC<AnimatedSplashOverlayProps> = ({ children, onFinish }) => {
  const [overlayVisible, setOverlayVisible] = useState(true);

  const translateY = useRef(new Animated.Value(INITIAL_ICON_OFFSET)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  const backgroundColor = useThemeColor({}, 'background');

  const splashImageSource = useMemo<ImageSourcePropType>(() => {
    return require('../../assets/images/splash-icon.png');
  }, []);

  useEffect(() => {
    const easing = Easing.bezier(0.22, 0.61, 0.36, 1);

    Animated.parallel([
      Animated.timing(iconOpacity, {
        toValue: 1,
        duration: ICON_FADE_DURATION,
        easing,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: ICON_POSITION_DURATION,
        easing,
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: OVERLAY_FADE_DURATION_OUT,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setOverlayVisible(false);
        onFinish?.();
      });
    });
  }, [iconOpacity, onFinish, overlayOpacity, translateY]);

  return (
    <SplashVisibilityContext.Provider value={overlayVisible}>
      <View style={styles.flexOne}>
        {children}
        {overlayVisible ? (
          <Animated.View
            pointerEvents="auto"
            style={[
              StyleSheet.absoluteFillObject,
              styles.overlay,
              { backgroundColor, opacity: overlayOpacity },
            ]}
          >
            <Animated.Image
              source={splashImageSource}
              accessibilityLabel="앱 시작 중"
              style={[styles.icon, { opacity: iconOpacity, transform: [{ translateY }] }]}
              resizeMode="contain"
            />
          </Animated.View>
        ) : null}
      </View>
    </SplashVisibilityContext.Provider>
  );
};

const styles = StyleSheet.create({
  flexOne: {
    flex: 1,
  },
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: 112,
    height: 112,
  },
});

