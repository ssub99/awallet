import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
import { FEATURE_LAUNCH_NOTICE } from '@/constants/feature-launch-notice';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LAST_SHOWN_DATE_KEY = 'featureLaunchNoticeLastShownDate';
const TOP_GAP = 16;
const CARD_HEIGHT = 72;
/** 카드 그림자(y 8, blur 32)까지 화면 밖으로 밀어내는 여유 */
const SHADOW_OUTSET = 40;
const SLIDE_DURATION = 300;
const HOLD_DURATION = 3000;

function toLocalDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 기간 내 하루 한 번, 상단에서 내려와 3초 노출 후 같은 속도로 올라가며 사라지는 기능 런칭 카드 */
export function FeatureLaunchNoticeCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = colors[useColorScheme() ?? 'light'] as ColorPalette;
  const hiddenY = -(insets.top + TOP_GAP + CARD_HEIGHT + SHADOW_OUTSET);
  const [translateY] = useState(() => new Animated.Value(hiddenY));
  const [visible, setVisible] = useState(false);
  const notice = FEATURE_LAUNCH_NOTICE;

  useFocusEffect(
    useCallback(() => {
      if (!notice) return;
      const today = toLocalDateKey(new Date());
      if (today < notice.startDate || today > notice.endDate) return;
      let cancelled = false;
      void (async () => {
        try {
          if ((await AsyncStorage.getItem(LAST_SHOWN_DATE_KEY)) === today || cancelled) return;
          await AsyncStorage.setItem(LAST_SHOWN_DATE_KEY, today);
          if (!cancelled) setVisible(true);
        } catch (error) {
          console.warn('[FeatureLaunchNoticeCard] Failed to read last shown date:', error);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [notice]),
  );

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(hiddenY);
    const animation = Animated.sequence([
      Animated.timing(translateY, {
        toValue: 0,
        duration: SLIDE_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_DURATION),
      Animated.timing(translateY, {
        toValue: hiddenY,
        duration: SLIDE_DURATION,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) setVisible(false);
    });
    return () => animation.stop();
  }, [hiddenY, translateY, visible]);

  const handlePress = useCallback(() => {
    setVisible(false);
    router.navigate('/mypage');
    router.push('/settings-notice');
  }, [router]);

  if (!notice || !visible) return null;

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + TOP_GAP, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={handlePress}
        style={[styles.card, { backgroundColor: palette.background }]}
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}. ${notice.description}`}
        accessibilityHint="공지사항으로 이동합니다"
      >
        <View style={styles.content}>
          <View style={styles.iconCircle}>
            <Icon name={notice.icon} variant="solid" size={24} />
          </View>
          <View style={styles.texts}>
            <Text style={[typography.body02.bold, { color: palette.text }]} numberOfLines={1}>
              {notice.title}
            </Text>
            <Text style={[typography.body02.regular, { color: palette.textNeutral }]} numberOfLines={1}>
              {notice.description}
            </Text>
          </View>
        </View>
        <Icon name="arrowRight" size={24} color={palette.staticBlack} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100000,
    elevation: 12,
  },
  card: {
    height: CARD_HEIGHT,
    borderRadius: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 23,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: atomicColors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
