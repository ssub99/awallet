/**
 * 앱 전역 · 기록 수신 안내 카드 (NoticeCard와 별도)
 * 포그라운드 알림 ingest 후 schedule → 어느 화면에서든 노출.
 * 탭: 홈 pending 예약 + 홈 이동 → 홈에서 간편입력·수신함 오픈 (경로 큐).
 */

import { Icon } from '@/components/ui/icon';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { setHomePendingOpenRecordInbox } from '@/utils/home-open-record-inbox-pending';
import {
  subscribeRecordReceiveGuideCard,
  type RecordReceiveGuideCardPayload,
} from '@/utils/record-receive-guide-card-event';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TOP_GAP = 16;
const CARD_HEIGHT = 72;
const SHADOW_OUTSET = 40;
const SLIDE_DURATION = 300;
/** NoticeCard와 동일 — 등장 후 유지 시간 */
const HOLD_DURATION = 5000;
const SNAP_BACK_DURATION = 200;
const SWIPE_DISMISS_DISTANCE = 24;
const SWIPE_DISMISS_VELOCITY = 0.5;
/** Figma icon wrap — DS 미등록 (#FFFAEA) */
const ICON_WRAP_BG = '#FFFAEA';

/** 등장 → 5초 유지 → 퇴장. 위로 밀면 즉시 퇴장, 드래그 중에는 자동 숨김 타이머 정지 */
function createCardMotion(
  translateY: Animated.Value,
  hiddenY: number,
  onHidden: () => void,
) {
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
    onMoveShouldSetPanResponderCapture: (_, g) =>
      Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
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

export function RecordReceiveGuideCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = colors[useColorScheme() ?? 'light'] as ColorPalette;
  const hiddenY = -(insets.top + TOP_GAP + CARD_HEIGHT + SHADOW_OUTSET);
  const [translateY] = useState(() => new Animated.Value(hiddenY));
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(1);

  useEffect(() => {
    return subscribeRecordReceiveGuideCard((payload: RecordReceiveGuideCardPayload) => {
      setCount(payload.count);
      setVisible(true);
    });
  }, []);

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
    void logEvent('ui', { screen_name: '/home', target: 'record-receive-guide-card' });
    setVisible(false);
    // pending 먼저 → 홈 이동(replace 금지). 스택에 쌓인 화면은 걷고, 아니면 push.
    setHomePendingOpenRecordInbox();
    if (router.canDismiss()) {
      router.dismissTo('/home');
    } else {
      router.push('/home');
    }
  }, [router]);

  if (!visible) return null;

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
        accessibilityLabel={`기록 수신 안내, ${count}건의 기록을 수신하였습니다.`}
        accessibilityHint="기록 수신함을 엽니다. 위로 밀면 닫힙니다"
      >
        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: ICON_WRAP_BG }]}>
            <Icon name="notification" variant="solid" size={24} />
          </View>
          <View style={styles.texts}>
            <Text style={[typography.body02.bold, { color: palette.text }]} numberOfLines={1}>
              기록 수신 안내
            </Text>
            <Text
              style={[typography.body02.regular, { color: palette.textNeutral }]}
              numberOfLines={1}
            >
              {`${count}건의 기록을 수신하였습니다.`}
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: 2,
  },
});
