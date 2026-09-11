/**
 * 간편입력 · 문자 수신함 오버레이
 * Figma baseline: home.month.quickInputSmsInbox ([Awallet]Home_month 2233:22555)
 *
 * 레이아웃 (원문↔기록카드 스왑, 페이저 고정):
 * - 원문   @(16, 60) h176
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Platform,
  Pressable,
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
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

/** 원문 — 시안 Frame 296. 페이저는 Frame 293 유지 */
const FIGMA_ORIGINAL = { left: 16, top: 60, width: 343, height: 176 } as const;
const FIGMA_PAGER = { left: 16, top: 724, width: 343, height: 56 } as const;
const FIGMA_SCREEN_HEIGHT = 812;

const SWIPE_COMMIT_VELOCITY = 800;
const ROLL_DURATION_MS = 380;
const ROLL_EASING = Easing.out(Easing.cubic);
/** 앞↔뒤 넘김이 보이도록 슬롯 간격(12px)보다 크게 띄움 */
const ROLL_LIFT_PX = 88;

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
   * 모션 중/후 저장 훅. 토스트 타이밍은 아래 참고.
   * - last: 수신함 닫힘 + 완료 토스트
   * - continue: 제거·토스트는 onConfirmConsumed
   * - abort: 카드 복구
   */
  onConfirm: (item: SmsInboxItem) => Promise<SmsInboxConfirmResult>;
  /** 잔여 건 consume(퇴장+롤업) 종료 후 큐 제거 + 완료 토스트 */
  onConfirmConsumed: (item: SmsInboxItem) => void;
  onCancel: (item: SmsInboxItem) => void;
  onChange?: (item: SmsInboxItem) => void;
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

/** 원문 로딩 — Figma Frame 296 스켈레톤 (2241:31037 / 2250:31703) */
function OriginalMessageSkeleton({ boneColor, lineColor }: { boneColor: string; lineColor: string }) {
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, {
        // 왕복 0.7초 (반주기)
        duration: 350,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [pulse]);

  const bonePulseStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={styles.originalSkeleton} accessibilityLabel="원문 불러오는 중">
      <View style={styles.originalSkeletonHeader}>
        <Animated.View
          style={[
            styles.originalSkeletonBoneHeader,
            { backgroundColor: boneColor },
            bonePulseStyle,
          ]}
        />
        <View style={[styles.originalSkeletonHeaderLine, { backgroundColor: lineColor }]} />
      </View>
      <View style={styles.originalSkeletonBody}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.originalSkeletonRow}>
            <Animated.View
              style={[
                styles.originalSkeletonBoneLabel,
                { backgroundColor: boneColor },
                bonePulseStyle,
              ]}
            />
            <Animated.View
              style={[
                styles.originalSkeletonBoneValue,
                { backgroundColor: boneColor },
                bonePulseStyle,
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * role 0/1/2 = 윈도우 top/mid/bottom · role 3 = consume 시 뒤에서 들어오는 다음 카드
 * animKind: 0 idle · 1 next · 2 prevEnter · 3 consume(퇴장+롤업+유입) · 4 lastExit
 * progress: idle scrub / 그 외 0→1
 *
 * 추가/취소(잔여): 로딩 + top퇴장 · mid→top · bottom→mid · next→bottom
 * 추가/취소(마지막): 퇴장만 → 메인 복귀 (추가만 토스트)
 * next(마지막 직전→마지막): top 퇴장 + mid→top (bottom 쌓임 없음)
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

function useSlotAnimatedStyle(
  role: 0 | 1 | 2 | 3,
  progress: SharedValue<number>,
  animKind: SharedValue<number>,
  nextToLastSV: SharedValue<boolean>,
  stackTop: number,
  screenWidth: number,
) {
  return useAnimatedStyle(() => {
    const kind = animKind.value;
    const p = progress.value;
    const centerX = screenWidth / 2;

    const topY = slotTopY(stackTop, 0);
    const midY = slotTopY(stackTop, 1);
    const botY = slotTopY(stackTop, 2);
    const topW = slotWidth(screenWidth, 0);
    const midW = slotWidth(screenWidth, 1);
    const botW = slotWidth(screenWidth, 2);
    const incomingW = screenWidth - SLOT_INCOMING_INSET * 2;
    const incomingY = botY + SLOT_INCOMING_EXTRA_Y;

    let top = role <= 2 ? slotTopY(stackTop, role as 0 | 1 | 2) : botY;
    let width = role <= 2 ? slotWidth(screenWidth, role as 0 | 1 | 2) : botW;
    let zIndex = role <= 2 ? SLOT_Z[role as 0 | 1 | 2] : 0;
    let liftY = 0;
    let opacity = 1;

    if (kind === 3 || kind === 4) {
      const t = Math.min(Math.max(p, 0), 1);
      const exitOnly = kind === 4;
      if (role === 3) {
        if (exitOnly) {
          opacity = 0;
          zIndex = 0;
        } else {
          // 맨 뒤에서 bottom 슬롯으로 쌓임
          width = interpolate(t, [0, 1], [incomingW, botW], Extrapolation.CLAMP);
          top = interpolate(t, [0, 1], [incomingY, botY], Extrapolation.CLAMP);
          opacity = interpolate(t, [0, 0.25, 1], [0, 0.85, 1], Extrapolation.CLAMP);
          liftY = interpolate(t, [0, 0.5, 1], [8, 2, 0], Extrapolation.CLAMP);
          zIndex = 0;
        }
      } else if (role === 0) {
        width = topW;
        top = topY;
        liftY = interpolate(t, [0, 1], [0, -ROLL_LIFT_PX * 1.25], Extrapolation.CLAMP);
        opacity = interpolate(t, [0, 0.55, 1], [1, 0.35, 0], Extrapolation.CLAMP);
        zIndex = 6;
      } else if (role === 1) {
        if (exitOnly) {
          width = midW;
          top = midY;
          zIndex = 2;
        } else {
          width = interpolate(t, [0, 1], [midW, topW], Extrapolation.CLAMP);
          top = interpolate(t, [0, 1], [midY, topY], Extrapolation.CLAMP);
          liftY = interpolate(t, [0, 0.45, 1], [0, -10, 0], Extrapolation.CLAMP);
          zIndex = t < 0.35 ? 2 : 4;
        }
      } else if (exitOnly) {
        width = botW;
        top = botY;
        zIndex = 1;
      } else {
        width = interpolate(t, [0, 1], [botW, midW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [botY, midY], Extrapolation.CLAMP);
        liftY = interpolate(t, [0, 0.5, 1], [0, -6, 0], Extrapolation.CLAMP);
        zIndex = 2;
      }
    } else if (role === 3) {
      opacity = 0;
      zIndex = 0;
    } else if (kind === 2) {
      // prevEnter: 이미 새 rest 윈도우. role0(이전 카드)이 뒤→앞으로.
      const t = Math.min(Math.max(p, 0), 1);
      if (role === 0) {
        width = interpolate(t, [0, 1], [botW, topW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [botY, topY], Extrapolation.CLAMP);
        liftY = interpolate(t, [0, 0.4, 1], [0, -ROLL_LIFT_PX, 0], Extrapolation.CLAMP);
        zIndex = t < 0.28 ? 1 : 5;
      } else if (role === 1) {
        width = interpolate(t, [0, 1], [topW, midW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [topY, midY], Extrapolation.CLAMP);
        liftY = interpolate(t, [0, 0.4, 1], [0, 8, 0], Extrapolation.CLAMP);
        zIndex = t < 0.4 ? 3 : 2;
      } else {
        width = interpolate(t, [0, 1], [midW, botW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [midY, botY], Extrapolation.CLAMP);
        zIndex = 1;
      }
    } else if (kind === 1 || p > 0) {
      // next · 마지막 직전→마지막은 top이 bottom에 쌓이지 않고 퇴장만
      const t = Math.min(p, 1);
      if (t > 0) {
        const toLast = nextToLastSV.value;
        if (role === 0) {
          if (toLast) {
            width = topW;
            top = topY;
            liftY = interpolate(t, [0, 1], [0, -ROLL_LIFT_PX * 1.25], Extrapolation.CLAMP);
            opacity = interpolate(t, [0, 0.55, 1], [1, 0.35, 0], Extrapolation.CLAMP);
            zIndex = 6;
          } else {
            width = interpolate(t, [0, 1], [topW, botW], Extrapolation.CLAMP);
            top = interpolate(t, [0, 1], [topY, botY], Extrapolation.CLAMP);
            liftY = interpolate(t, [0, 0.35, 1], [0, -ROLL_LIFT_PX, 0], Extrapolation.CLAMP);
            zIndex = t < 0.42 ? 5 : 1;
          }
        } else if (role === 1) {
          width = interpolate(t, [0, 1], [midW, topW], Extrapolation.CLAMP);
          top = interpolate(t, [0, 1], [midY, topY], Extrapolation.CLAMP);
          liftY = interpolate(t, [0, 0.45, 1], [0, -10, 0], Extrapolation.CLAMP);
          zIndex = t < 0.42 ? 2 : 4;
        } else {
          width = interpolate(t, [0, 1], [botW, midW], Extrapolation.CLAMP);
          top = interpolate(t, [0, 1], [botY, midY], Extrapolation.CLAMP);
          liftY = interpolate(t, [0, 0.5, 1], [0, -6, 0], Extrapolation.CLAMP);
          zIndex = 2;
        }
      }
    } else if (p < 0) {
      // prev scrub (제스처)
      const t = Math.min(-p, 1);
      if (role === 0) {
        width = interpolate(t, [0, 1], [topW, midW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [topY, midY], Extrapolation.CLAMP);
        liftY = interpolate(t, [0, 0.4, 1], [0, 8, 0], Extrapolation.CLAMP);
        zIndex = t < 0.4 ? 3 : 2;
      } else if (role === 1) {
        width = interpolate(t, [0, 1], [midW, botW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [midY, botY], Extrapolation.CLAMP);
        zIndex = 1;
      } else {
        width = interpolate(t, [0, 1], [botW, topW], Extrapolation.CLAMP);
        top = interpolate(t, [0, 1], [botY, topY], Extrapolation.CLAMP);
        liftY = interpolate(t, [0, 0.4, 1], [0, -ROLL_LIFT_PX, 0], Extrapolation.CLAMP);
        zIndex = t < 0.28 ? 1 : 5;
      }
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
  });
}

function StackCard({
  item,
  interactive,
  onConfirm,
  onCancel,
  onChange,
  addLoading,
  contentLoading,
  style,
}: {
  item: SmsInboxItem;
  interactive: boolean;
  onConfirm?: (item: SmsInboxItem) => void;
  onCancel?: (item: SmsInboxItem) => void;
  onChange?: (item: SmsInboxItem) => void;
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
  /** next로 마지막 카드에 도착하는 전환 (9→10 등) — bottom 쌓임 생략 */
  const isNextToLast = canGoNext && safeIndex === items.length - 2;

  const progress = useSharedValue(0);
  /** 0 idle · 1 next · 2 prevEnter · 3 consume(퇴장+롤업) · 4 confirmLastExit */
  const animKind = useSharedValue(0);
  const isRolling = useSharedValue(false);
  const canGoNextSV = useSharedValue(canGoNext);
  const canGoPrevSV = useSharedValue(canGoPrev);
  const nextToLastSV = useSharedValue(isNextToLast);
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
  const [renderMode, setRenderMode] = useState<'rest' | 'prev'>('rest');
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
    nextToLastSV.value = isNextToLast;
  }, [canGoNext, canGoPrev, canGoNextSV, canGoPrevSV, isNextToLast, nextToLastSV]);

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

  const nextSettledLayerStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value * nextSettledOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  const prevSettledLayerStyle = useAnimatedStyle(() => ({
    opacity: bottomEnterOpacity.value * prevSettledOpacity.value,
    transform: [{ translateY: bottomEnterTranslateY.value }],
  }));

  const restWindow = useMemo((): [
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
  ] => {
    return [
      items[safeIndex] ?? null,
      items[safeIndex + 1] ?? null,
      items[safeIndex + 2] ?? null,
    ];
  }, [items, safeIndex]);

  /** prev 롤링: role2에 이전 카드를 고정(filter 금지 — 끝 인덱스에서 role이 밀림) */
  const prevWindow = useMemo((): [
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
  ] => {
    if (safeIndex <= 0) return restWindow;
    return [
      items[safeIndex] ?? null,
      items[safeIndex + 1] ?? null,
      items[safeIndex - 1] ?? null,
    ];
  }, [items, restWindow, safeIndex]);

  /**
   * consume(잔여): top/mid/bottom + 뒤에서 들어올 다음 카드(role3)
   * 제거 전 큐 기준 items[i+3]가 새 bottom이 된다.
   */
  const consumeWindow = useMemo((): [
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
  ] => {
    return [
      items[safeIndex] ?? null,
      items[safeIndex + 1] ?? null,
      items[safeIndex + 2] ?? null,
      items[safeIndex + 3] ?? null,
    ];
  }, [items, safeIndex]);

  const nextSettledWindow = useMemo((): [
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
  ] => {
    const baseIndex = frozenPagerIndex ?? safeIndex;
    return [
      items[baseIndex + 1] ?? null,
      items[baseIndex + 2] ?? null,
      items[baseIndex + 3] ?? null,
    ];
  }, [frozenPagerIndex, items, safeIndex]);

  /** prev 완료 시 도착 rest 윈도우 (base-1 / base / base+1) */
  const prevSettledWindow = useMemo((): [
    SmsInboxItem | null,
    SmsInboxItem | null,
    SmsInboxItem | null,
  ] => {
    const baseIndex = frozenPagerIndex ?? safeIndex;
    if (baseIndex <= 0) {
      return [items[0] ?? null, items[1] ?? null, items[2] ?? null];
    }
    return [
      items[baseIndex - 1] ?? null,
      items[baseIndex] ?? null,
      items[baseIndex + 1] ?? null,
    ];
  }, [frozenPagerIndex, items, safeIndex]);

  const windowItems: Array<SmsInboxItem | null> =
    isConsuming && items.length > 1
      ? consumeWindow
      : renderMode === 'prev'
        ? prevWindow
        : restWindow;

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
    flushSync(() => {
      setRenderMode('rest');
      commitNext();
    });
    animKind.value = 0;
    progress.value = 0;
    revealSettledStack();
  }, [animKind, commitNext, progress, revealSettledStack]);

  const finishPrevScrub = useCallback(() => {
    flushSync(() => {
      setRenderMode('rest');
      commitPrev();
    });
    animKind.value = 0;
    progress.value = 0;
    revealSettledStack();
  }, [animKind, commitPrev, progress, revealSettledStack]);

  const resetConsumeMotion = useCallback(() => {
    animKind.value = 0;
    progress.value = 0;
    isRolling.value = false;
    setIsConsuming(false);
    setRenderMode('rest');
  }, [animKind, isRolling, progress]);

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
        setRenderMode('rest');
        setStackEpoch((epoch) => epoch + 1);
        setOriginalLoading(false);
        setFrozenPagerIndex(null);
      });
      animKind.value = 0;
      progress.value = 0;
      isRolling.value = false;
    })();
  }, [
    animKind,
    isRolling,
    onConfirm,
    onConfirmConsumed,
    progress,
    resetConsumeMotion,
    stopOriginalLoading,
  ]);

  /** 마지막 건: 퇴장만 → 메인 복귀 + 토스트 */
  const finishConfirmLastExit = useCallback(() => {
    const pending = pendingConsumeRef.current;
    if (!pending || pending.action !== 'confirm') {
      return;
    }
    void (async () => {
      try {
        await onConfirm(pending.item);
      } catch {
        pendingConsumeRef.current = null;
        resetConsumeMotion();
        setStackEpoch((epoch) => epoch + 1);
        return;
      }
      pendingConsumeRef.current = null;
      resetConsumeMotion();
    })();
  }, [onConfirm, resetConsumeMotion]);

  /** 취소(잔여): consume 종료 → 큐 소진(토스트 없음) */
  const finishCancelConsume = useCallback(() => {
    const pending = pendingConsumeRef.current;
    pendingConsumeRef.current = null;
    flushSync(() => {
      if (pending?.action === 'cancel') {
        onCancel(pending.item);
      }
      setIsConsuming(false);
      setRenderMode('rest');
      setStackEpoch((epoch) => epoch + 1);
      setOriginalLoading(false);
      setFrozenPagerIndex(null);
    });
    animKind.value = 0;
    progress.value = 0;
    isRolling.value = false;
  }, [animKind, isRolling, onCancel, progress]);

  /** 취소(마지막): 퇴장만 → 메인 복귀 */
  const finishCancelLastExit = useCallback(() => {
    const pending = pendingConsumeRef.current;
    pendingConsumeRef.current = null;
    if (pending?.action === 'cancel') {
      onCancel(pending.item);
    }
    resetConsumeMotion();
  }, [onCancel, resetConsumeMotion]);

  const requestConsume = useCallback(
    (item: SmsInboxItem, action: 'confirm' | 'cancel') => {
      if (isRolling.value || isConsuming) {
        return;
      }
      if (action === 'confirm' && onBeforeConfirm && !onBeforeConfirm(item)) {
        return;
      }
      pendingConsumeRef.current = { item, action };
      setIsConsuming(true);
      setRenderMode('rest');
      isRolling.value = true;
      progress.value = 0;

      const isLast = items.length <= 1;
      const onFinished = isLast
        ? action === 'confirm'
          ? finishConfirmLastExit
          : finishCancelLastExit
        : action === 'confirm'
          ? finishConfirmConsume
          : finishCancelConsume;

      if (!isLast) {
        setFrozenPagerIndex(safeIndex);
        setOriginalLoading(true);
      }

      animKind.value = isLast ? 4 : 3;
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
      animKind,
      finishCancelConsume,
      finishCancelLastExit,
      finishConfirmConsume,
      finishConfirmLastExit,
      isConsuming,
      isRolling,
      items.length,
      onBeforeConfirm,
      progress,
      safeIndex,
    ],
  );

  const handlePrev = useCallback(() => {
    if (!canGoPrev || isRolling.value) return;
    startOriginalLoading();
    setRenderMode('prev');
    isRolling.value = true;
    animKind.value = 0;
    progress.value = 0;
    progress.value = withTiming(-1, { duration: ROLL_DURATION_MS, easing: ROLL_EASING }, (finished) => {
      if (finished) {
        prevSettledOpacity.value = 1;
        stackOpacity.value = 0;
        runOnJS(finishPrevScrub)();
      }
    });
  }, [
    animKind,
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
    setRenderMode('rest');
    isRolling.value = true;
    animKind.value = 1;
    progress.value = 0;
    progress.value = withTiming(1, { duration: ROLL_DURATION_MS, easing: ROLL_EASING }, (finished) => {
      if (finished) {
        nextSettledOpacity.value = 1;
        stackOpacity.value = 0;
        runOnJS(finishNextRoll)();
      }
    });
  }, [
    animKind,
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
          if (nextProgress < -0.02 && canGoPrevSV.value) {
            runOnJS(setRenderMode)('prev');
          } else if (nextProgress >= 0) {
            runOnJS(setRenderMode)('rest');
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
            animKind.value = 1;
            runOnJS(startOriginalLoading)();
            runOnJS(setRenderMode)('rest');
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
            runOnJS(setRenderMode)('prev');
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
              runOnJS(setRenderMode)('rest');
            }
          });
        }),
    [
      animKind,
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
  const pagerBottom = Math.max(
    insets.bottom,
    FIGMA_SCREEN_HEIGHT - (FIGMA_PAGER.top + FIGMA_PAGER.height),
  );
  const pagerTop = windowHeight - pagerBottom - FIGMA_PAGER.height;
  const stackTop =
    pagerTop -
    STACK_PAGER_GAP -
    RECORD_CARD_HEIGHT -
    SLOT_TOP_OFFSETS[SLOT_TOP_OFFSETS.length - 1];
  const style0 = useSlotAnimatedStyle(0, progress, animKind, nextToLastSV, stackTop, windowWidth);
  const style1 = useSlotAnimatedStyle(1, progress, animKind, nextToLastSV, stackTop, windowWidth);
  const style2 = useSlotAnimatedStyle(2, progress, animKind, nextToLastSV, stackTop, windowWidth);
  const style3 = useSlotAnimatedStyle(3, progress, animKind, nextToLastSV, stackTop, windowWidth);
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
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="문자 수신함 닫기"
        />
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
              <Text
                style={[
                  typography.body01.medium,
                  { color: palette.textNeutral },
                ]}
              >
                {current.originalBody}
              </Text>
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
            {windowItems.map((item, role) => {
              if (role > 3 || item == null) return null;
              const isTopInteractive =
                role === 0 && renderMode === 'rest' && !originalLoading && !isConsuming;
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
                  addLoading={isTopInteractive ? addLoading : false}
                  contentLoading={originalLoading}
                  style={slotStyles[role as 0 | 1 | 2 | 3]}
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
          {nextSettledWindow.map((item, role) =>
            item ? (
              <StackCard
                key={`next-settled-${item.id}`}
                item={item}
                interactive={false}
                contentLoading
                style={nextSettledSlotStyles[role as 0 | 1 | 2]}
              />
            ) : null,
          )}
        </View>
      </Animated.View>

      <Animated.View
        style={[styles.stackLayer, prevSettledLayerStyle]}
        pointerEvents="none"
      >
        <View style={styles.stackGestureLayer}>
          {prevSettledWindow.map((item, role) =>
            item ? (
              <StackCard
                key={`prev-settled-${item.id}`}
                item={item}
                interactive={false}
                contentLoading
                style={nextSettledSlotStyles[role as 0 | 1 | 2]}
              />
            ) : null,
          )}
        </View>
      </Animated.View>

      <View
        style={[
          styles.pager,
          {
            bottom: pagerBottom,
            left: FIGMA_PAGER.left,
            right: FIGMA_PAGER.left,
            backgroundColor: palette.background,
          },
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
      </View>
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
    minHeight: FIGMA_ORIGINAL.height,
    position: 'relative',
  },
  originalContent: {
    padding: 16,
    gap: 12,
  },
  originalHeaderRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
