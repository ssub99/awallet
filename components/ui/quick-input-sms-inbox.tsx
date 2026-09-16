/**
 * 간편입력 · 문자 수신함 오버레이
 * Figma baseline: home.month.quickInputSmsInbox ([Awallet]Home_month 2233:22555)
 *
 * 레이아웃 (원문↔기록카드 스왑, 페이저 고정):
 * - 닫기   @(16, 48) 48×48 · Frame 301 / smsInboxClose
 * - 원문   @(16, 112) h176 · 닫기 하단과 gap 16
 * - 스택   top/mid/bottom 간격 12 · 카드 h308 · 세로 스와이프
 * - 페이저 @(16, 724) h56 · 뒤 카드 최하단과 gap 16
 *
 * 스와이프 위 → 뒷번호(next), 아래 → 윗번호(prev)
 * 잔여 ≥3이면 항상 3장 · 롤링으로 슬롯 이동
 */

import { Icon } from '@/components/ui/icon';
import {
  QuickInputConfirmCard,
  type QuickInputConfirmCardData,
} from '@/components/ui/quick-input-confirm-card';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { SmsInboxItem } from '@/utils/sms-inbox-mock';
import { SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME } from '@/utils/sms-inbox-types';
import { logEvent } from '@/utils/analytics';
import { normalizeSmsOriginalBody } from '@/utils/sms-inbox-store';
import {
  buildStackFrame,
  SlotMotion,
  STACK_FRAME_CAPACITY,
  type SlotMotionValue,
  type StackTransition,
} from '@/utils/sms-inbox-stack-frame';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Animated as RNAnimated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  type AnimatedStyle,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

const FIGMA_STATUS_BAR = 44;
/** Figma 375 기준 inset — 실기기에서는 screenWidth - inset*2 로 폭 계산 */
const SLOT_INSETS = [16, 24, 32] as const;
const SLOT_TOP_OFFSETS = [0, 12, 24] as const;
const SLOT_Z = [3, 2, 1] as const;
const RECORD_CARD_HEIGHT = 308;
/** 뒤 카드 최하단부터 페이저 상단까지의 시각 여백 */
const STACK_PAGER_GAP = 16;
/** consume 시 맨 뒤로 들어오는 카드 시작 포즈 (bottom보다 더 작고 아래) */
const SLOT_INCOMING_INSET = 40;
const SLOT_INCOMING_EXTRA_Y = 16;

/** 원문 — 시안 Frame 296. 페이저는 Frame 293 유지. 닫기는 Frame 301 */
const FIGMA_CLOSE = { left: 16, top: 48, width: 48, height: 48 } as const;
/** baseline 2233:20949 — Frame 301 추가 후 원문 top 60→112 */
const FIGMA_ORIGINAL = { left: 16, top: 112, width: 343, height: 176 } as const;
/** 카드 padding16×2 + 발신 행24 + gap12 + divider1 + gap12 */
const ORIGINAL_BODY_CHROME_HEIGHT = 16 + 24 + 12 + 1 + 12 + 16;
const ORIGINAL_BODY_SCROLL_MAX = FIGMA_ORIGINAL.height - ORIGINAL_BODY_CHROME_HEIGHT;
const FIGMA_PAGER = { left: 16, top: 724, width: 343, height: 56 } as const;
/** Figma 812 기준 페이저 하단~스크린 하단 (= Frame 6 homeIndicator 구간, 학습 2233:20949) */
const FIGMA_SCREEN_HEIGHT = 812;
const FIGMA_PAGER_BOTTOM_GAP = FIGMA_SCREEN_HEIGHT - (FIGMA_PAGER.top + FIGMA_PAGER.height);

const SWIPE_COMMIT_VELOCITY = 800;
const ROLL_DURATION_MS = 320;
const ROLL_EASING = Easing.out(Easing.cubic);
const IS_ANDROID = Platform.OS === 'android';
/** 앞↔뒤 넘김이 보이도록 슬롯 간격(12px)보다 크게 띄움 */
const ROLL_LIFT_PX = 36;

/** 간편입력 확인 카드(QuickInputConfirmCard) 등장과 동일 */
const ENTER_SLIDE_OFFSET = 16;
const ENTER_DURATION_MS = 180;
const ENTER_EASING = Easing.inOut(Easing.cubic);

const CARD_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
  },
  android: {
    elevation: 8,
  },
  default: {},
});

export type SmsInboxConfirmResult = 'last' | 'continue' | 'abort';

export type QuickInputSmsInboxProps = {
  items: SmsInboxItem[];
  index: number;
  onIndexChange: (nextIndex: number) => void;
  /**
   * 모션 중/후 저장 훅. 토스트 타이밍은 호출측 참고.
   * - last: 스켈레톤 유지 중 저장 → 간편생성 메인 복귀 후 토스트
   * - continue: 제거·토스트는 onConfirmConsumed
   * - abort: 카드 복구
   */
  onConfirm: (item: SmsInboxItem) => Promise<SmsInboxConfirmResult>;
  /** 잔여 건 consume(퇴장+롤업) 종료 후 큐 제거 + 완료 토스트 */
  onConfirmConsumed: (item: SmsInboxItem) => void;
  onCancel: (item: SmsInboxItem) => void;
  onChange?: (item: SmsInboxItem) => void;
  /** 카테고리 미선택 플레이스홀더 탭 */
  onCategoryPress?: (item: SmsInboxItem) => void;
  /**
   * 추가 직전 동기 검증. false면 퇴장 모션 없이 중단.
   * 토스트 등은 호출측에서 처리.
   */
  onBeforeConfirm?: (item: SmsInboxItem) => boolean;
  /** 딤 영역 탭 → 간편입력 롱뷰로 복귀 */
  onDismiss?: () => void;
  addLoading?: boolean;
};

function formatPagerLabel(index: number, total: number): string {
  const current = String(index + 1).padStart(2, '0');
  const end = String(total).padStart(2, '0');
  return `${current}/${end}`;
}

function toCardData(item: SmsInboxItem): QuickInputConfirmCardData {
  const trimmed = item.card.category.trim();
  // 예전 목업/가기록 플레이스홀더 '미정' → 빈 값 (카드에서 '선택해 주세요.' 표시)
  return { ...item.card, category: trimmed === '미정' ? '' : trimmed };
}

const SKELETON_PULSE_HALF_MS = 500;

/** 원문 로딩 — Figma Frame 296 스켈레톤 (2241:31037 / 2250:31703) */
function OriginalMessageSkeleton({ boneColor, lineColor }: { boneColor: string; lineColor: string }) {
  const pulse = useRef(new RNAnimated.Value(0.45)).current;

  useEffect(() => {
    // RN Animated.loop — Reanimated withRepeat는 ReduceMotion.System이면 1회 후 종료됨
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, {
          toValue: 1,
          duration: SKELETON_PULSE_HALF_MS,
          useNativeDriver: true,
        }),
        RNAnimated.timing(pulse, {
          toValue: 0.45,
          duration: SKELETON_PULSE_HALF_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0.45);
    };
  }, [pulse]);

  return (
    <View style={styles.originalSkeleton} accessibilityLabel="원문 불러오는 중">
      <View style={styles.originalSkeletonHeader}>
        <RNAnimated.View
          style={[
            styles.originalSkeletonBoneHeader,
            { backgroundColor: boneColor, opacity: pulse },
          ]}
        />
        <View style={[styles.originalSkeletonHeaderLine, { backgroundColor: lineColor }]} />
      </View>
      <View style={styles.originalSkeletonBody}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.originalSkeletonRow}>
            <RNAnimated.View
              style={[
                styles.originalSkeletonBoneLabel,
                { backgroundColor: boneColor, opacity: pulse },
              ]}
            />
            <RNAnimated.View
              style={[
                styles.originalSkeletonBoneValue,
                { backgroundColor: boneColor, opacity: pulse },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * 한 프레임에 그릴 카드·모션은 buildStackFrame이 확정한다 (utils/sms-inbox-stack-frame).
 * 여기서는 motion 하나만 보고 궤적을 그리므로, 카드가 없는 슬롯의 모션은 생길 수 없다.
 *
 * progress: forward(+) = 다음·추가·취소 · backward(-) = 이전 · 0 = 정지
 * 모션마다 자기 방향의 진행도만 쓰므로 transition 상태가 한 프레임 늦어도 정지 포즈가 된다.
 */
function slotTopY(stackTop: number, slotIndex: 0 | 1 | 2): number {
  'worklet';
  return stackTop + SLOT_TOP_OFFSETS[slotIndex];
}

function slotWidth(screenWidth: number, slotIndex: 0 | 1 | 2): number {
  'worklet';
  return screenWidth - SLOT_INSETS[slotIndex] * 2;
}

function leftForWidth(centerX: number, width: number): number {
  'worklet';
  return centerX - width / 2;
}

function settledSlotStyle(
  stackTop: number,
  screenWidth: number,
  role: 0 | 1 | 2,
): ViewStyle {
  const width = slotWidth(screenWidth, role);
  return {
    position: 'absolute',
    left: leftForWidth(screenWidth / 2, width),
    top: slotTopY(stackTop, role),
    width,
    zIndex: SLOT_Z[role],
  };
}

function useMotionStyle(
  motion: SlotMotionValue | 0,
  progress: SharedValue<number>,
  stackTop: number,
  screenWidth: number,
) {
  return useAnimatedStyle(() => {
    const centerX = screenWidth / 2;
    const forward = Math.min(Math.max(progress.value, 0), 1);
    const backward = Math.min(Math.max(-progress.value, 0), 1);

    const topY = slotTopY(stackTop, 0);
    const midY = slotTopY(stackTop, 1);
    const botY = slotTopY(stackTop, 2);
    const topW = slotWidth(screenWidth, 0);
    const midW = slotWidth(screenWidth, 1);
    const botW = slotWidth(screenWidth, 2);
    const incomingW = screenWidth - SLOT_INCOMING_INSET * 2;
    const incomingY = botY + SLOT_INCOMING_EXTRA_Y;

    let top = topY;
    let width = topW;
    let zIndex: number = SLOT_Z[0];
    let liftY = 0;
    let opacity = 1;

    if (motion === SlotMotion.holdFront) {
      top = topY;
      width = topW;
      zIndex = SLOT_Z[0];
    } else if (motion === SlotMotion.holdMid) {
      top = midY;
      width = midW;
      zIndex = SLOT_Z[1];
    } else if (motion === SlotMotion.holdThird) {
      top = botY;
      width = botW;
      zIndex = SLOT_Z[2];
    } else if (motion === SlotMotion.exitUp) {
      top = topY;
      width = topW;
      liftY = interpolate(forward, [0, 1], [0, -ROLL_LIFT_PX * 1.25], Extrapolation.CLAMP);
      opacity = interpolate(forward, [0, 0.55, 1], [1, 0.35, 0], Extrapolation.CLAMP);
      zIndex = 6;
    } else if (motion === SlotMotion.midToFront) {
      top = interpolate(forward, [0, 1], [midY, topY], Extrapolation.CLAMP);
      width = interpolate(forward, [0, 1], [midW, topW], Extrapolation.CLAMP);
      liftY = interpolate(forward, [0, 0.45, 1], [0, -10, 0], Extrapolation.CLAMP);
      zIndex = 4;
    } else if (motion === SlotMotion.thirdToMid) {
      top = interpolate(forward, [0, 1], [botY, midY], Extrapolation.CLAMP);
      width = interpolate(forward, [0, 1], [botW, midW], Extrapolation.CLAMP);
      liftY = interpolate(forward, [0, 0.5, 1], [0, -6, 0], Extrapolation.CLAMP);
      zIndex = 2;
    } else if (motion === SlotMotion.enterFromBelow) {
      top = interpolate(forward, [0, 1], [incomingY, botY], Extrapolation.CLAMP);
      width = interpolate(forward, [0, 1], [incomingW, botW], Extrapolation.CLAMP);
      liftY = interpolate(forward, [0, 0.5, 1], [8, 2, 0], Extrapolation.CLAMP);
      opacity = interpolate(forward, [0, 0.25, 1], [0, 0.85, 1], Extrapolation.CLAMP);
      zIndex = 1;
    } else if (motion === SlotMotion.enterFromAbove) {
      // exitUp의 역재생
      top = topY;
      width = topW;
      liftY = interpolate(backward, [0, 1], [-ROLL_LIFT_PX * 1.25, 0], Extrapolation.CLAMP);
      opacity = interpolate(backward, [0, 0.45, 1], [0, 0.65, 1], Extrapolation.CLAMP);
      zIndex = 6;
    } else if (motion === SlotMotion.frontToMid) {
      top = interpolate(backward, [0, 1], [topY, midY], Extrapolation.CLAMP);
      width = interpolate(backward, [0, 1], [topW, midW], Extrapolation.CLAMP);
      liftY = interpolate(backward, [0, 0.45, 1], [0, 10, 0], Extrapolation.CLAMP);
      zIndex = 3;
    } else if (motion === SlotMotion.midToThird) {
      top = interpolate(backward, [0, 1], [midY, botY], Extrapolation.CLAMP);
      width = interpolate(backward, [0, 1], [midW, botW], Extrapolation.CLAMP);
      liftY = interpolate(backward, [0, 0.5, 1], [0, 6, 0], Extrapolation.CLAMP);
      zIndex = 2;
    } else if (motion === SlotMotion.exitDown) {
      // exitUp의 대칭
      top = botY;
      width = botW;
      liftY = interpolate(backward, [0, 1], [0, ROLL_LIFT_PX * 1.25], Extrapolation.CLAMP);
      opacity = interpolate(backward, [0, 0.55, 1], [1, 0.35, 0], Extrapolation.CLAMP);
      zIndex = 1;
    } else {
      opacity = 0;
      zIndex = 0;
    }

    return {
      position: 'absolute' as const,
      left: leftForWidth(centerX, width),
      top,
      width,
      zIndex,
      opacity,
      transform: [{ translateY: liftY }],
    };
  }, [motion, stackTop, screenWidth]);
}

function StackCard({
  item,
  interactive,
  onConfirm,
  onCancel,
  onChange,
  onCategoryPress,
  addLoading,
  contentLoading,
  style,
}: {
  item: SmsInboxItem;
  interactive: boolean;
  onConfirm?: (item: SmsInboxItem) => void;
  onCancel?: (item: SmsInboxItem) => void;
  onChange?: (item: SmsInboxItem) => void;
  onCategoryPress?: (item: SmsInboxItem) => void;
  addLoading?: boolean;
  /** 순서 전환 중 카드 콘텐츠 숨김 + 인디케이터 (원문 로딩과 동일 타이밍) */
  contentLoading?: boolean;
  style: StyleProp<AnimatedStyle<ViewStyle>>;
}) {
  return (
    <Animated.View
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={[styles.cardSlot, CARD_SHADOW, style]}
    >
      <QuickInputConfirmCard
        data={toCardData(item)}
        onConfirm={() => onConfirm?.(item)}
        onCancel={() => onCancel?.(item)}
        onChange={onChange ? () => onChange(item) : undefined}
        onCategoryPress={onCategoryPress ? () => onCategoryPress(item) : undefined}
        addLoading={interactive ? addLoading : false}
        contentLoading={contentLoading}
        deferExitAnimation={interactive}
        animateEntrance={false}
        actionButtonHeight={48}
      />
    </Animated.View>
  );
}

export function QuickInputSmsInbox({
  items,
  index,
  onIndexChange,
  onConfirm,
  onConfirmConsumed,
  onCancel,
  onChange,
  onCategoryPress,
  onBeforeConfirm,
  onDismiss,
  addLoading = false,
}: QuickInputSmsInboxProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const safeIndex = items.length === 0 ? 0 : Math.min(Math.max(index, 0), items.length - 1);
  const canGoPrev = safeIndex > 0;
  const canGoNext = safeIndex < items.length - 1;

  const progress = useSharedValue(0);
  const isRolling = useSharedValue(false);
  const canGoNextSV = useSharedValue(canGoNext);
  const canGoPrevSV = useSharedValue(canGoPrev);
  const stackOpacity = useSharedValue(1);
  /** next/prev 완료 시 현재 스택과 교대할 도착 순서의 정착 포즈 */
  const nextSettledOpacity = useSharedValue(0);
  const prevSettledOpacity = useSharedValue(0);
  /** 기록 카드: 위에서 아래로 */
  const cardEnterTranslateY = useSharedValue(-ENTER_SLIDE_OFFSET);
  const cardEnterOpacity = useSharedValue(0);
  /** 원문+핸들: 아래에서 위로 */
  const bottomEnterTranslateY = useSharedValue(ENTER_SLIDE_OFFSET);
  const bottomEnterOpacity = useSharedValue(0);
  const [transition, setTransition] = useState<StackTransition>('idle');
  const [stackEpoch, setStackEpoch] = useState(0);
  const [originalLoading, setOriginalLoading] = useState(false);
  const [isConsuming, setIsConsuming] = useState(false);
  const [frozenPagerIndex, setFrozenPagerIndex] = useState<number | null>(null);
  const pendingConsumeRef = useRef<{
    item: SmsInboxItem;
    action: 'confirm' | 'cancel';
  } | null>(null);

  const startOriginalLoading = useCallback(() => {
    setFrozenPagerIndex(safeIndex);
    setOriginalLoading(true);
  }, [safeIndex]);

  const stopOriginalLoading = useCallback(() => {
    setOriginalLoading(false);
    setFrozenPagerIndex(null);
  }, []);

  useEffect(() => {
    canGoNextSV.value = canGoNext;
    canGoPrevSV.value = canGoPrev;
  }, [canGoNext, canGoPrev, canGoNextSV, canGoPrevSV]);

  useEffect(() => {
    cardEnterTranslateY.value = -ENTER_SLIDE_OFFSET;
    cardEnterOpacity.value = 0;
    bottomEnterTranslateY.value = ENTER_SLIDE_OFFSET;
    bottomEnterOpacity.value = 0;

    cardEnterTranslateY.value = withTiming(0, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    cardEnterOpacity.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    bottomEnterTranslateY.value = withTiming(0, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
    bottomEnterOpacity.value = withTiming(1, {
      duration: ENTER_DURATION_MS,
      easing: ENTER_EASING,
    });
  }, [
    bottomEnterOpacity,
    bottomEnterTranslateY,
    cardEnterOpacity,
    cardEnterTranslateY,
  ]);

  const originalEnterStyle = useAnimatedStyle(() => ({
    opacity: cardEnterOpacity.value,
    transform: [{ translateY: cardEnterTranslateY.value }],
  }));

  const stackLayerStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value * stackOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  /** 페이저: 카드 스택과 같이 등장하되, consume 시 stackOpacity에 묶이지 않음 */
  const pagerEnterStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  const nextSettledLayerStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value * nextSettledOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  const prevSettledLayerStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value * prevSettledOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  /**
   * 지금 그릴 프레임. 추가/취소(consume)는 다음 넘김과 같은 forward 모션이고,
   * 커밋 방식만 다르다 (index 이동 vs 큐에서 제거).
   */
  const frame = useMemo(
    () => buildStackFrame(items.length, safeIndex, transition),
    [items.length, safeIndex, transition],
  );

  /** 전환 완료 시 교대할 도착 순서의 정지 프레임 */
  const nextSettledFrame = useMemo(
    () => buildStackFrame(items.length, (frozenPagerIndex ?? safeIndex) + 1, 'idle'),
    [frozenPagerIndex, items.length, safeIndex],
  );

  const prevSettledFrame = useMemo(
    () => buildStackFrame(items.length, (frozenPagerIndex ?? safeIndex) - 1, 'idle'),
    [frozenPagerIndex, items.length, safeIndex],
  );

  const commitNext = useCallback(() => {
    if (safeIndex >= items.length - 1) return;
    onIndexChange(safeIndex + 1);
  }, [items.length, onIndexChange, safeIndex]);

  const commitPrev = useCallback(() => {
    if (safeIndex <= 0) return;
    onIndexChange(safeIndex - 1);
  }, [onIndexChange, safeIndex]);

  const revealSettledStack = useCallback(() => {
    requestAnimationFrame(() => {
      stackOpacity.value = 1;
      nextSettledOpacity.value = 0;
      prevSettledOpacity.value = 0;
      isRolling.value = false;
      stopOriginalLoading();
    });
  }, [
    isRolling,
    nextSettledOpacity,
    prevSettledOpacity,
    stackOpacity,
    stopOriginalLoading,
  ]);

  /**
   * next/prev 종료: 도착 정착 오버레이가 보이는 상태에서
   * 데이터 커밋 + idle 포즈를 맞춘 뒤 메인 스택을 다시 켠다.
   * 스택 전체를 비우면 깜빡이므로 빈 프레임을 만들지 않는다.
   */
  const finishNextRoll = useCallback(() => {
    void logEvent('btn', {
      screen_name: SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME,
      target: 'receive-cardadd-order-next',
    });
    flushSync(() => {
      setTransition('idle');
      commitNext();
    });
    progress.value = 0;
    revealSettledStack();
  }, [commitNext, progress, revealSettledStack]);

  const finishPrevScrub = useCallback(() => {
    void logEvent('btn', {
      screen_name: SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME,
      target: 'receive-cardadd-order-prev',
    });
    flushSync(() => {
      setTransition('idle');
      commitPrev();
    });
    progress.value = 0;
    revealSettledStack();
  }, [commitPrev, progress, revealSettledStack]);

  const resetConsumeMotion = useCallback(() => {
    progress.value = 0;
    isRolling.value = false;
    setIsConsuming(false);
    setTransition('idle');
  }, [isRolling, progress]);

  const finishConsumeSharedValues = useCallback(() => {
    const reset = () => {
      progress.value = 0;
      isRolling.value = false;
    };
    if (IS_ANDROID) {
      requestAnimationFrame(reset);
      return;
    }
    reset();
  }, [isRolling, progress]);

  /** 잔여 추가: consume(퇴장+롤업) 종료 → 저장 훅 → 제거+토스트 */
  const finishConfirmConsume = useCallback(() => {
    const pending = pendingConsumeRef.current;
    if (!pending || pending.action !== 'confirm') {
      return;
    }
    void (async () => {
      let result: SmsInboxConfirmResult = 'abort';
      try {
        result = await onConfirm(pending.item);
      } catch {
        result = 'abort';
      }

      if (result === 'abort') {
        pendingConsumeRef.current = null;
        stopOriginalLoading();
        resetConsumeMotion();
        setStackEpoch((epoch) => epoch + 1);
        return;
      }

      pendingConsumeRef.current = null;
      flushSync(() => {
        if (result === 'continue') {
          onConfirmConsumed(pending.item);
        }
        setIsConsuming(false);
        setTransition('idle');
        if (!IS_ANDROID) {
          setStackEpoch((epoch) => epoch + 1);
        }
        setOriginalLoading(false);
        setFrozenPagerIndex(null);
      });
      finishConsumeSharedValues();
      if (result === 'last') {
        onDismiss?.();
      }
    })();
  }, [
    finishConsumeSharedValues,
    onConfirm,
    onConfirmConsumed,
    onDismiss,
    resetConsumeMotion,
    stopOriginalLoading,
  ]);

  /** 마지막 건 추가: 퇴장 없이 원문·카드 스켈레톤 → 저장 → 간편생성 메인 */
  const runConfirmLastWithSkeleton = useCallback(() => {
    const pending = pendingConsumeRef.current;
    if (!pending || pending.action !== 'confirm') {
      return;
    }
    void (async () => {
      let result: SmsInboxConfirmResult = 'abort';
      try {
        result = await onConfirm(pending.item);
      } catch {
        result = 'abort';
      }
      if (result === 'abort') {
        pendingConsumeRef.current = null;
        setOriginalLoading(false);
        setFrozenPagerIndex(null);
        resetConsumeMotion();
        setStackEpoch((epoch) => epoch + 1);
        return;
      }
      pendingConsumeRef.current = null;
      // 저장·큐 제거는 onConfirm. 토스트는 간편생성 메인 전환 후 호출측에서.
      if (result === 'last') {
        onDismiss?.();
      }
      resetConsumeMotion();
    })();
  }, [onConfirm, onDismiss, resetConsumeMotion]);

  /** 취소(잔여): consume 종료 → 큐 소진(토스트 없음 · 수신함 유지) */
  const finishCancelConsume = useCallback(() => {
    const pending = pendingConsumeRef.current;
    pendingConsumeRef.current = null;
    flushSync(() => {
      if (pending?.action === 'cancel') {
        onCancel(pending.item);
      }
      setIsConsuming(false);
      setTransition('idle');
      if (!IS_ANDROID) {
        setStackEpoch((epoch) => epoch + 1);
      }
      setOriginalLoading(false);
      setFrozenPagerIndex(null);
    });
    finishConsumeSharedValues();
  }, [finishConsumeSharedValues, onCancel]);

  /** 마지막 건 취소: 추가와 동일 — 퇴장 롤 없이 스켈레톤 → 간편생성 메인(토스트 없음) */
  const runCancelLastWithSkeleton = useCallback(() => {
    const pending = pendingConsumeRef.current;
    if (!pending || pending.action !== 'cancel') {
      return;
    }
    pendingConsumeRef.current = null;
    // 추가는 저장 await 동안 스켈레톤이 보임. 취소는 페인트 한 뒤 메인으로.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onCancel(pending.item);
        resetConsumeMotion();
        onDismiss?.();
      });
    });
  }, [onCancel, onDismiss, resetConsumeMotion]);

  const requestConsume = useCallback(
    (item: SmsInboxItem, action: 'confirm' | 'cancel') => {
      if (isRolling.value || isConsuming) {
        return;
      }
      if (action === 'confirm' && onBeforeConfirm && !onBeforeConfirm(item)) {
        return;
      }
      void logEvent('btn', {
        screen_name: SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME,
        target:
          action === 'confirm' ? 'receive-cardadd-confirm' : 'receive-cardadd-cancel',
      });
      pendingConsumeRef.current = { item, action };
      setIsConsuming(true);

      const isLast = items.length <= 1;

      // 마지막 건 추가/취소: 퇴장 롤 없이 스켈레톤 → 메인(추가는 저장·토스트, 취소는 토스트 없음)
      if (isLast) {
        setFrozenPagerIndex(safeIndex);
        setOriginalLoading(true);
        if (action === 'confirm') {
          runConfirmLastWithSkeleton();
        } else {
          runCancelLastWithSkeleton();
        }
        return;
      }

      setTransition('forward');
      isRolling.value = true;
      progress.value = 0;
      setFrozenPagerIndex(safeIndex);
      setOriginalLoading(true);

      const onFinished = action === 'confirm' ? finishConfirmConsume : finishCancelConsume;

      progress.value = withTiming(
        1,
        { duration: ROLL_DURATION_MS, easing: ROLL_EASING },
        (finished) => {
          if (finished) {
            runOnJS(onFinished)();
          }
        },
      );
    },
    [
      finishCancelConsume,
      finishConfirmConsume,
      isConsuming,
      isRolling,
      items.length,
      onBeforeConfirm,
      progress,
      runCancelLastWithSkeleton,
      runConfirmLastWithSkeleton,
      safeIndex,
    ],
  );

  const handlePrev = useCallback(() => {
    if (!canGoPrev || isRolling.value) return;
    startOriginalLoading();
    setTransition('backward');
    isRolling.value = true;
    progress.value = 0;
    progress.value = withTiming(-1, { duration: ROLL_DURATION_MS, easing: ROLL_EASING }, (finished) => {
      if (finished) {
        prevSettledOpacity.value = 1;
        stackOpacity.value = 0;
        runOnJS(finishPrevScrub)();
      }
    });
  }, [
    canGoPrev,
    finishPrevScrub,
    isRolling,
    prevSettledOpacity,
    progress,
    stackOpacity,
    startOriginalLoading,
  ]);

  const handleNext = useCallback(() => {
    if (!canGoNext || isRolling.value) return;
    startOriginalLoading();
    setTransition('forward');
    isRolling.value = true;
    progress.value = 0;
    progress.value = withTiming(1, { duration: ROLL_DURATION_MS, easing: ROLL_EASING }, (finished) => {
      if (finished) {
        nextSettledOpacity.value = 1;
        stackOpacity.value = 0;
        runOnJS(finishNextRoll)();
      }
    });
  }, [
    canGoNext,
    finishNextRoll,
    isRolling,
    nextSettledOpacity,
    progress,
    stackOpacity,
    startOriginalLoading,
  ]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          if (isRolling.value) return;
          const raw = event.translationY;
          let nextProgress = interpolate(raw, [-180, 0, 180], [1, 0, -1], Extrapolation.CLAMP);
          if (nextProgress > 0 && !canGoNextSV.value) {
            nextProgress *= 0.2;
          }
          if (nextProgress < 0 && !canGoPrevSV.value) {
            nextProgress *= 0.2;
          }
          if (nextProgress > 0.02) {
            runOnJS(setTransition)('forward');
          } else if (nextProgress < -0.02) {
            runOnJS(setTransition)('backward');
          } else {
            runOnJS(setTransition)('idle');
          }
          progress.value = nextProgress;
        })
        .onEnd((event) => {
          if (isRolling.value) return;
          const shouldNext =
            canGoNextSV.value &&
            (progress.value > 0.35 ||
              (event.velocityY < -SWIPE_COMMIT_VELOCITY && progress.value > 0.1));
          const shouldPrev =
            canGoPrevSV.value &&
            (progress.value < -0.35 ||
              (event.velocityY > SWIPE_COMMIT_VELOCITY && progress.value < -0.1));

          if (shouldNext) {
            isRolling.value = true;
            runOnJS(startOriginalLoading)();
            runOnJS(setTransition)('forward');
            progress.value = withTiming(
              1,
              { duration: ROLL_DURATION_MS, easing: ROLL_EASING },
              (finished) => {
                if (finished) {
                  nextSettledOpacity.value = 1;
                  stackOpacity.value = 0;
                  runOnJS(finishNextRoll)();
                }
              },
            );
            return;
          }
          if (shouldPrev) {
            isRolling.value = true;
            runOnJS(startOriginalLoading)();
            runOnJS(setTransition)('backward');
            progress.value = withTiming(
              -1,
              { duration: ROLL_DURATION_MS, easing: ROLL_EASING },
              (finished) => {
                if (finished) {
                  prevSettledOpacity.value = 1;
                  stackOpacity.value = 0;
                  runOnJS(finishPrevScrub)();
                }
              },
            );
            return;
          }
          progress.value = withTiming(0, { duration: 180, easing: ROLL_EASING }, (finished) => {
            if (finished) {
              runOnJS(setTransition)('idle');
            }
          });
        }),
    [
        canGoNextSV,
      canGoPrevSV,
      finishNextRoll,
      finishPrevScrub,
      isRolling,
      nextSettledOpacity,
      prevSettledOpacity,
      progress,
      stackOpacity,
      startOriginalLoading,
    ],
  );

  const topOffset = insets.top;
  // Nested overlay에서 Android bottom inset이 0으로 올 수 있어 window metrics 폴백
  // (ModalBottomsheetBottomInset과 동일)
  const safeBottom =
    insets.bottom > 0 ? insets.bottom : (initialWindowMetrics?.insets.bottom ?? 0);
  // 학습 baseline 2233:20949:
  // - Frame 293(페이저) bottom = 724+56 = 780
  // - Frame 6(homeIndicator) top = 778 → 스크린 하단까지 32(FIGMA_PAGER_BOTTOM_GAP)
  // iOS: 홈 인디케이터 구역이 곧 그 32이므로 safeBottom만 맞춤.
  // Android: 내비 inset 위에 시안 32를 더해 핸들↔OS 인디케이터 여백을 시안과 동일하게.
  const handleScreenPrev = useCallback(() => {
    void logEvent('btn', {
      screen_name: SMS_HISTORY_RECORD_ANALYTICS_SCREEN_NAME,
      target: 'receive-cardadd-screen-prev',
    });
    onDismiss?.();
  }, [onDismiss]);

  // inset이 0이면 edge-to-edge 3-button 폴백(48)+시안 32.
  const pagerBottom =
    Platform.OS === 'android'
      ? (safeBottom > 0 ? safeBottom : 48) + FIGMA_PAGER_BOTTOM_GAP
      : Math.max(safeBottom, FIGMA_PAGER_BOTTOM_GAP);
  const pagerTop = windowHeight - pagerBottom - FIGMA_PAGER.height;
  const stackTop =
    pagerTop -
    STACK_PAGER_GAP -
    RECORD_CARD_HEIGHT -
    SLOT_TOP_OFFSETS[SLOT_TOP_OFFSETS.length - 1];
  const motionOf = (slot: number): SlotMotionValue | 0 => frame[slot]?.motion ?? 0;
  const style0 = useMotionStyle(motionOf(0), progress, stackTop, windowWidth);
  const style1 = useMotionStyle(motionOf(1), progress, stackTop, windowWidth);
  const style2 = useMotionStyle(motionOf(2), progress, stackTop, windowWidth);
  const style3 = useMotionStyle(motionOf(3), progress, stackTop, windowWidth);
  const slotStyles = [style0, style1, style2, style3] as const;
  const nextSettledSlotStyles = useMemo(
    () =>
      ([0, 1, 2] as const).map((role) =>
        settledSlotStyle(stackTop, windowWidth, role),
      ),
    [stackTop, windowWidth],
  );

  const originalTop = topOffset + (FIGMA_ORIGINAL.top - FIGMA_STATUS_BAR);

  const current = items[safeIndex];
  if (!current) {
    return null;
  }

  const displayedPagerIndex =
    originalLoading && frozenPagerIndex != null ? frozenPagerIndex : safeIndex;

  return (
    <View style={styles.root} pointerEvents="box-none">
      {onDismiss ? (
        <Pressable
          style={styles.dismissHitArea}
          onPress={handleScreenPrev}
          accessibilityRole="button"
          accessibilityLabel="문자 수신함 닫기"
        />
      ) : null}

      {onDismiss ? (
        <Animated.View
          style={[
            styles.closeButton,
            {
              top: topOffset + (FIGMA_CLOSE.top - FIGMA_STATUS_BAR),
              left: FIGMA_CLOSE.left,
              backgroundColor: palette.staticWhite,
            },
            originalEnterStyle,
          ]}
        >
          <Pressable
            onPress={handleScreenPrev}
            accessibilityRole="button"
            accessibilityLabel="이전"
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
        </Animated.View>
      ) : null}

      <Animated.View
        style={[
          styles.originalBlock,
          { top: originalTop, left: FIGMA_ORIGINAL.left, right: FIGMA_ORIGINAL.left },
          originalEnterStyle,
        ]}
        pointerEvents="box-none"
      >
        <View style={[styles.originalCard, { backgroundColor: palette.backgroundAlt }]}>
          {originalLoading ? (
            <OriginalMessageSkeleton
              boneColor={atomicColors.neutral[200]}
              lineColor={palette.border}
            />
          ) : (
            <View style={styles.originalContent}>
              <View style={styles.originalHeaderRow}>
                <View style={styles.originalSenderSlot}>
                  <Text
                    style={[typography.body01.bold, { color: palette.textNeutral }]}
                    numberOfLines={1}
                  >
                    {current.senderLabels[0] ?? ''}
                  </Text>
                </View>
                {current.senderLabels[1] ? (
                  <View style={styles.originalSenderSlot}>
                    <Text
                      style={[typography.body01.bold, { color: palette.textNeutral }]}
                      numberOfLines={1}
                    >
                      {current.senderLabels[1]}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.originalSenderSlotSpacer} />
                )}
              </View>
              <View style={[styles.originalDivider, { backgroundColor: palette.border }]} />
              <ScrollView
                style={styles.originalBodyScroll}
                contentContainerStyle={styles.originalBodyScrollContent}
                showsVerticalScrollIndicator
                bounces={false}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                <Text
                  style={[
                    typography.body01.medium,
                    { color: palette.textNeutral },
                  ]}
                >
                  {normalizeSmsOriginalBody(current.originalBody)
                    .split('\n')
                    .map((line, index, lines) => (
                      <Text key={`sms-line-${index}`}>
                        {line.length > 0 ? line : ' '}
                        {index < lines.length - 1 ? '\n' : null}
                      </Text>
                    ))}
                </Text>
              </ScrollView>
            </View>
          )}
        </View>
      </Animated.View>

      <Animated.View style={[styles.stackLayer, stackLayerStyle]} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <Animated.View
            key={stackEpoch}
            style={styles.stackGestureLayer}
            pointerEvents="box-none"
          >
            {frame.map((slot, position) => {
              const item = items[slot.itemIndex];
              if (!item || position >= STACK_FRAME_CAPACITY) return null;
              const isTopInteractive =
                slot.motion === SlotMotion.holdFront && !originalLoading && !isConsuming;
              // 앞카드였던 카드만 실데이터 — 뒤 카드·유입/복귀 카드는 스켈레톤 유지
              const showsContent =
                slot.motion === SlotMotion.holdFront ||
                slot.motion === SlotMotion.exitUp ||
                slot.motion === SlotMotion.frontToMid;
              return (
                <StackCard
                  key={item.id}
                  item={item}
                  interactive={isTopInteractive}
                  onConfirm={
                    isTopInteractive
                      ? (target) => requestConsume(target, 'confirm')
                      : undefined
                  }
                  onCancel={
                    isTopInteractive
                      ? (target) => requestConsume(target, 'cancel')
                      : undefined
                  }
                  onChange={isTopInteractive ? onChange : undefined}
                  onCategoryPress={isTopInteractive ? onCategoryPress : undefined}
                  addLoading={isTopInteractive ? addLoading : false}
                  contentLoading={!showsContent || originalLoading}
                  style={slotStyles[position as 0 | 1 | 2 | 3]}
                />
              );
            })}
          </Animated.View>
        </GestureDetector>
      </Animated.View>

      <Animated.View
        style={[styles.stackLayer, nextSettledLayerStyle]}
        pointerEvents="none"
      >
        <View style={styles.stackGestureLayer}>
          {nextSettledFrame.map((slot, position) => {
            const item = items[slot.itemIndex];
            return item ? (
              <StackCard
                key={`next-settled-${item.id}`}
                item={item}
                interactive={false}
                contentLoading
                style={nextSettledSlotStyles[position as 0 | 1 | 2]}
              />
            ) : null;
          })}
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.stackLayer, prevSettledLayerStyle]}
        pointerEvents="none"
      >
        <View style={styles.stackGestureLayer}>
          {prevSettledFrame.map((slot, position) => {
            const item = items[slot.itemIndex];
            return item ? (
              <StackCard
                key={`prev-settled-${item.id}`}
                item={item}
                interactive={false}
                contentLoading
                style={nextSettledSlotStyles[position as 0 | 1 | 2]}
              />
            ) : null;
          })}
        </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.pager,
          {
            bottom: pagerBottom,
            left: FIGMA_PAGER.left,
            right: FIGMA_PAGER.left,
            backgroundColor: palette.background,
          },
          pagerEnterStyle,
        ]}
      >
        <Pressable
          onPress={handlePrev}
          disabled={!canGoPrev}
          accessibilityRole="button"
          accessibilityLabel="이전 문자"
          hitSlop={8}
          style={styles.pagerButton}
        >
          <Icon
            name="arrowLeft"
            variant="line"
            size={24}
            color={!canGoPrev ? palette.textDisabled : palette.staticBlack}
          />
        </Pressable>
        <Text style={[typography.body02.bold, { color: palette.textNeutral }]}>
          {formatPagerLabel(displayedPagerIndex, items.length)}
        </Text>
        <Pressable
          onPress={handleNext}
          disabled={!canGoNext}
          accessibilityRole="button"
          accessibilityLabel="다음 문자"
          hitSlop={8}
          style={styles.pagerButton}
        >
          <Icon
            name="arrowRight"
            variant="line"
            size={24}
            color={!canGoNext ? palette.textDisabled : palette.staticBlack}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
  },
  dismissHitArea: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  closeButton: {
    position: 'absolute',
    width: FIGMA_CLOSE.width,
    height: FIGMA_CLOSE.height,
    borderRadius: FIGMA_CLOSE.width / 2,
    zIndex: 4,
  },
  closeButtonPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  stackGestureLayer: {
    ...StyleSheet.absoluteFill,
  },
  cardSlot: {
    borderRadius: 20,
    overflow: 'visible',
  },
  originalBlock: {
    position: 'absolute',
    zIndex: 1,
  },
  originalCard: {
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: FIGMA_ORIGINAL.height,
    position: 'relative',
  },
  originalContent: {
    padding: 16,
    gap: 12,
    maxHeight: FIGMA_ORIGINAL.height,
  },
  originalHeaderRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexShrink: 0,
  },
  originalSenderSlot: {
    flexShrink: 1,
    minHeight: 24,
    justifyContent: 'center',
  },
  originalSenderSlotSpacer: {
    width: 43,
    height: 24,
  },
  originalDivider: {
    height: 1,
    width: '100%',
    flexShrink: 0,
  },
  originalBodyScroll: {
    maxHeight: ORIGINAL_BODY_SCROLL_MAX,
    flexGrow: 0,
  },
  originalBodyScrollContent: {
    flexGrow: 0,
  },
  originalSkeleton: {
    minHeight: FIGMA_ORIGINAL.height,
  },
  originalSkeletonHeader: {
    height: 48,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  originalSkeletonBoneHeader: {
    width: 215,
    height: 20,
    borderRadius: 8,
  },
  originalSkeletonHeaderLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 0,
    height: 1,
  },
  originalSkeletonBody: {
    paddingHorizontal: 24,
    paddingTop: 26,
    gap: 8,
  },
  originalSkeletonRow: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  originalSkeletonBoneLabel: {
    width: 64,
    height: 20,
    borderRadius: 8,
  },
  originalSkeletonBoneValue: {
    width: 215,
    height: 20,
    borderRadius: 8,
  },
  pager: {
    position: 'absolute',
    height: FIGMA_PAGER.height,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    zIndex: 3,
  },
  pagerButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
