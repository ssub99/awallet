import { BlurView, type BlurViewProps } from 'expo-blur';
import { useMemo } from 'react';
import { UIManager, View } from 'react-native';

const canUseBlurView = () => {
  if (typeof UIManager.getViewManagerConfig !== 'function') {
    return false;
  }
  return !!UIManager.getViewManagerConfig('ExpoBlurView');
};

export function SafeBlurView(props: BlurViewProps) {
  const isSupported = useMemo(() => canUseBlurView(), []);

  if (!isSupported) {
    const { children, style } = props;
    return (
      <View style={style}>
        {children}
      </View>
    );
  }

  return <BlurView {...props} />;
}
