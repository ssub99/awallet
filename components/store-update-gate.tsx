import { Button } from '@/components/ui/button';
import { Colors } from '@/constants/theme';
import { TypographyPresets } from '@/constants/typography';
import Constants from 'expo-constants';
import { useCallback, useEffect } from 'react';
import {
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface StoreUpdateGateProps {
  forceUpdate: boolean;
  message: string;
  onDismissOptional: () => void;
}

function getStoreListingUrl(): string | null {
  const ios = Constants.expoConfig?.ios?.appStoreUrl;
  const android = Constants.expoConfig?.android?.playStoreUrl;
  if (Platform.OS === 'ios') {
    return typeof ios === 'string' && ios.length > 0 ? ios : null;
  }
  return typeof android === 'string' && android.length > 0 ? android : null;
}

export function StoreUpdateGate({ forceUpdate, message, onDismissOptional }: StoreUpdateGateProps) {
  const insets = useSafeAreaInsets();
  const colors = Colors.light;

  const openStore = useCallback(async () => {
    const url = getStoreListingUrl();
    if (url == null) return;
    try {
      await Linking.openURL(url);
    } catch {
      // 스토어 링크 실패 시 무시
    }
  }, []);

  useEffect(() => {
    if (!forceUpdate || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [forceUpdate]);

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}
      accessibilityViewIsModal
    >
      <View style={styles.content}>
        <Text style={[TypographyPresets.h2, { color: colors.textStrong }]}>
          업데이트 안내
        </Text>
        <Text
          style={[TypographyPresets.bodyLarge, styles.bodySpacer, { color: colors.text }]}
          accessibilityRole="text"
        >
          {message}
        </Text>
        <Button variant="primary" type="solid" size="large" onPress={openStore} accessibilityLabel="업데이트">
          업데이트
        </Button>
        {!forceUpdate ? (
          <Button
            variant="assistive"
            type="line"
            size="large"
            onPress={onDismissOptional}
            accessibilityLabel="나중에 하기"
          >
            나중에
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    gap: 16,
  },
  bodySpacer: {
    marginBottom: 8,
  },
});
