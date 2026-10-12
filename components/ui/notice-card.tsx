import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
import { NOTICE_CARD } from '@/constants/notice-card';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setSettingsTabPendingPush } from '@/utils/settings-tab-pending-push';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LAST_SHOWN_DATE_KEY = 'noticeCardLastShownDate';
const TOP_GAP = 16;
const CARD_HEIGHT = 72;
/** 카드 그림자(y 8, blur 32)까지 화면 밖으로 밀어내는 여유 */
const SHADOW_OUTSET = 40;
const SLIDE_DURATION = 300;
const SHOW_DELAY = 2000;
const HOLD_DURATION = 5000;
const SNAP_BACK_DURATION = 200;
const SWIPE_DISMISS_DISTANCE = 24;
const SWIPE_DISMISS_VELOCITY = 0.5;

function toLocalDateKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** 등장 → 5초 유지 → 퇴장. 위로 밀면 즉시 퇴장, 드래그 중에는 자동 숨김 타이머 정지 */
function createCardMotion(translateY: Animated.Value, hiddenY: number, onHidden: () => void) {
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let dragStartY = 0;
  const clearHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = null;
  };
  const slideOut = (easing = Easing.in(Easing.cubic)) => {
    clearHold();
    Animated.timing(translateY, {
      toValue: hiddenY,
      duration: SLIDE_DURATION,
      easing,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onHidden();
    });
  };
  const settleAndScheduleHide = (duration: number) => {
    Animated.timing(translateY, {
      toValue: 0,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      clearHold();
      holdTimer = setTimeout(() => slideOut(), HOLD_DURATION);
    });
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderGrant: () => {
      clearHold();
      translateY.stopAnimation((value) => {
        dragStartY = value;
      });
    },
    onPanResponderMove: (_, g) => {
      translateY.setValue(Math.min(0, dragStartY + g.dy));
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -SWIPE_DISMISS_DISTANCE || g.vy < -SWIPE_DISMISS_VELOCITY) {
        // 손을 뗀 속도를 이어가도록 감속 곡선으로 퇴장
        slideOut(Easing.out(Easing.cubic));
      } else {
        settleAndScheduleHide(SNAP_BACK_DURATION);
      }
    },
    onPanResponderTerminate: () => settleAndScheduleHide(SNAP_BACK_DURATION),
    onPanResponderTerminationRequest: () => false,
  });
  return {
    panHandlers: panResponder.panHandlers,
    enter: () => {
      translateY.setValue(hiddenY);
      settleAndScheduleHide(SLIDE_DURATION);
    },
    stop: () => {
      clearHold();
      translateY.stopAnimation();
    },
  };
}

/**
 * 기간 내 하루 한 번, 홈 렌더 2초 후 상단에서 내려와 5초 노출 후 같은 속도로 올라가며 사라지는 홈 상단 안내 카드.
 * 위로 밀면 바로 사라지고, 드래그 중에는 자동 숨김 타이머가 멈춘다.
 */
export function NoticeCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = colors[useColorScheme() ?? 'light'] as ColorPalette;
  const hiddenY = -(insets.top + TOP_GAP + CARD_HEIGHT + SHADOW_OUTSET);
  const [translateY] = useState(() => new Animated.Value(hiddenY));
  const [visible, setVisible] = useState(false);
  const notice = NOTICE_CARD;

  useFocusEffect(
    useCallback(() => {
      if (!notice) return;
      const today = toLocalDateKey(new Date());
      if (today < notice.startDate || today > notice.endDate) return;
      let cancelled = false;
      const timer = setTimeout(() => {
        void (async () => {
          try {
            if ((await AsyncStorage.getItem(LAST_SHOWN_DATE_KEY)) === today) return;
            if (cancelled) return;
            await AsyncStorage.setItem(LAST_SHOWN_DATE_KEY, today);
            if (!cancelled) setVisible(true);
          } catch (error) {
            console.warn('[NoticeCard] Failed to read last shown date:', error);
          }
        })();
      }, SHOW_DELAY);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [notice]),
  );

  const motion = useMemo(
    () => createCardMotion(translateY, hiddenY, () => setVisible(false)),
    [hiddenY, translateY],
  );

  useEffect(() => {
    if (!visible) return;
    motion.enter();
    return motion.stop;
  }, [motion, visible]);

  const handlePress = useCallback(() => {
    setVisible(false);
    setSettingsTabPendingPush('/settings-notice');
    router.navigate('/mypage');
  }, [router]);

  if (!notice || !visible) return null;

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + TOP_GAP, transform: [{ translateY }] }]}
      pointerEvents="box-none"
      {...motion.panHandlers}
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
