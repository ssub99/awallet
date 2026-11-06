/**
 * 간편입력 메인 · 체험하기 진입로
 * Figma: home.month.quickInputEntry — tutorialEntryCards / tutorialEntryChip / smsInboxClose
 *
 * 레이아웃 (Figma 375×812, statusBar 44):
 * - 닫기   @(16, 48) 48×48 · arrowLeft
 * - 칩     @(258, 48) HUG×48 · 「체험하기」+ arrow (펼침↑ / 접힘↓)
 * - 카드   @(16, 104) 343×124 · 기록수신 / 간편기록생성 (펼침일 때만)
 *
 * 등장 모션: 기록 수신함 상단(이전+원문)과 동일 — 위→아래 16px + fade 180ms
 * 퇴장 모션: 등장 역방향 — 아래→위 16px + fade out 180ms (수신함·계산기·카테고리 설정 동일)
 * (quick-input-record-inbox ENTER_* / originalEnterStyle)
 *
 * 「기록 수신 기능 체험하기」→ onReceivePress (안내 카드).
 * 「간편 기록 생성 체험하기」→ onCreatePress (이후 연결).
 */

import { Icon } from '@/components/ui/icon';
import { colors, typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const FIGMA_STATUS_BAR = 44;
const FIGMA_CLOSE = { left: 16, top: 48, width: 48, height: 48 } as const;
const FIGMA_CHIP = { top: 48, height: 48, right: 16 } as const;
const FIGMA_CARDS = { left: 16, top: 104, height: 124, gap: 8 } as const;
const CARD_RADIUS = 24;
const CARD_PAD = 16;
const CARD_ICON_SIZE = 36;

/** 기록 수신함 상단 등장과 동일 · 퇴장은 역방향 */
const ENTER_SLIDE_OFFSET = 16;
export const TUTORIAL_ENTRY_MOTION_DURATION_MS = 180;
const ENTER_DURATION_MS = TUTORIAL_ENTRY_MOTION_DURATION_MS;
const ENTER_EASING = Easing.inOut(Easing.cubic);

export type QuickInputTutorialEntryProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  onClose: () => void;
  onReceivePress?: () => void;
  onCreatePress?: () => void;
  /** true면 등장 역방향 퇴장 후 onExitComplete */
  exiting?: boolean;
  onExitComplete?: () => void;
};

export function QuickInputTutorialEntry({
  expanded,
  onToggleExpanded,
  onClose,
  onReceivePress,
  onCreatePress,
  exiting = false,
  onExitComplete,
}: QuickInputTutorialEntryProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const topOffset = insets.top;
  const onExitCompleteRef = useRef(onExitComplete);
  onExitCompleteRef.current = onExitComplete;

  const enterTranslateY = useSharedValue(-ENTER_SLIDE_OFFSET);
  const enterOpacity = useSharedValue(0);

  useEffect(() => {
    enterTranslateY.value = -ENTER_SLIDE_OFFSET;
    enterOpacity.value = 0;
    enterTranslateY.value = withTiming(0, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    enterOpacity.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
  }, [enterOpacity, enterTranslateY]);

  useEffect(() => {
    if (!exiting) {
      return;
    }
    const notifyExitComplete = () => {
      onExitCompleteRef.current?.();
    };
    const timing = {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    } as const;
    enterTranslateY.value = withTiming(-ENTER_SLIDE_OFFSET, timing, (finished) => {
      if (finished) {
        runOnJS(notifyExitComplete)();
      }
    });
    enterOpacity.value = withTiming(0, timing);
  }, [enterOpacity, enterTranslateY, exiting]);

  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterTranslateY.value }],
  }));

  return (
    <View
      style={styles.root}
      pointerEvents={exiting ? 'none' : 'box-none'}
      collapsable={false}
    >
      <Animated.View
        style={[styles.bundle, enterStyle]}
        pointerEvents={exiting ? 'none' : 'box-none'}
        collapsable={false}
      >
        <View
          style={[
            styles.closeButton,
            {
              top: topOffset + (FIGMA_CLOSE.top - FIGMA_STATUS_BAR),
              left: FIGMA_CLOSE.left,
              backgroundColor: palette.staticWhite,
            },
          ]}
          collapsable={false}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            hitSlop={8}
            style={styles.closeButtonPress}
          >
            <Icon
              name="arrowLeft"
              variant="line"
              size={24}
              color={palette.staticBlack}
            />
          </Pressable>
        </View>

        <Pressable
          style={[
            styles.chip,
            {
              top: topOffset + (FIGMA_CHIP.top - FIGMA_STATUS_BAR),
              right: FIGMA_CHIP.right,
              backgroundColor: palette.staticWhite,
            },
          ]}
          onPress={onToggleExpanded}
          accessibilityRole="button"
          accessibilityLabel={expanded ? '체험하기 접기' : '체험하기 펼치기'}
          accessibilityState={{ expanded }}
        >
          <Text style={[typography.body02.medium, styles.chipLabel, { color: palette.staticBlack }]}>
            체험하기
          </Text>
          <Icon
            name={expanded ? 'arrowUp' : 'arrowDown'}
            variant="line"
            size={16}
            color={palette.staticBlack}
          />
        </Pressable>

        {expanded ? (
          <View
            style={[
              styles.cardsRow,
              {
                top: topOffset + (FIGMA_CARDS.top - FIGMA_STATUS_BAR),
                left: FIGMA_CARDS.left,
                right: FIGMA_CARDS.left,
              },
            ]}
          >
            <Pressable
              style={[styles.card, { backgroundColor: palette.staticWhite }]}
              onPress={onReceivePress}
              accessibilityRole="button"
              accessibilityLabel="기록 수신 기능 체험하기"
            >
              <Text style={[typography.body01.bold, styles.cardLabel, { color: palette.staticBlack }]}>
                {'기록 수신 기능\n체험하기'}
              </Text>
              <Icon name="receive" variant="solid" size={CARD_ICON_SIZE} style={styles.cardIcon} />
            </Pressable>

            <Pressable
              style={[styles.card, { backgroundColor: palette.staticWhite }]}
              onPress={onCreatePress}
              accessibilityRole="button"
              accessibilityLabel="간편 기록 생성 체험하기"
            >
              <Text style={[typography.body01.bold, styles.cardLabel, { color: palette.staticBlack }]}>
                {'간편 기록 생성\n체험하기'}
              </Text>
              <Icon name="simplicity" variant="solid" size={CARD_ICON_SIZE} style={styles.cardIcon} />
            </Pressable>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  bundle: {
    ...StyleSheet.absoluteFillObject,
  },
  closeButton: {
    position: 'absolute',
    width: FIGMA_CLOSE.width,
    height: FIGMA_CLOSE.height,
    borderRadius: FIGMA_CLOSE.width / 2,
  },
  closeButtonPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
    height: FIGMA_CHIP.height,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  chipLabel: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cardsRow: {
    position: 'absolute',
    height: FIGMA_CARDS.height,
    flexDirection: 'row',
    gap: FIGMA_CARDS.gap,
  },
  card: {
    flex: 1,
    height: FIGMA_CARDS.height,
    borderRadius: CARD_RADIUS,
    padding: CARD_PAD,
    overflow: 'hidden',
  },
  cardLabel: {
    includeFontPadding: false,
  },
  cardIcon: {
    position: 'absolute',
    right: CARD_PAD,
    bottom: CARD_PAD,
  },
});
