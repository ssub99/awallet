/**
 * Quick Input Tip Box
 *
 * - TIP 태그 너비: 콘텐츠·폰트 스케일에 맞춰 onLayout 측정
 * - 한 번에 한 문장, 우→좌 자동 흐름(마키 1회) + 사용자 좌우 드래그
 * - 첫 문장: 랜덤 시작, 이후 교체는 배열 순서(예: 2번 → 3 → 4 → 1)
 * - 문장 교체: 다음(아래→위), 이전(위→아래) 전환
 * - 문장 상/하 스와이프로 이전/다음 문장 전환
 * - 우측 접기/펼치기 버튼 (Figma: icon/solid/arrowLeft, 24px 원형)
 * - 접기: 세로 문장 전환 중이면 전환 완료 후 박스 접기 / 좌우 흐름 중이면 즉시 접기
 */

import { Icon } from '@/components/ui/icon';
import { atomicColors } from '@/constants/atomic-colors';
import {
  pickInitialQuickInputTipIndex,
  QUICK_INPUT_TIPS,
  rememberQuickInputTipIndex,
  resolveSequentialTipIndex,
} from '@/constants/quick-input-tips';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  loadQuickInputTipBoxExpanded,
  saveQuickInputTipBoxExpanded,
} from '@/utils/quick-input-tip-preference';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

/** Figma Frame 262 fill — Atomic/Neutral/100 */
const TIP_BOX_BACKGROUND = atomicColors.neutral[100];
/** 어코디언 버튼 영역 배경 — Atomic/Neutral/100 */
const BUTTON_AREA_BACKGROUND = atomicColors.neutral[100];

const BOX_HEIGHT = 48;
const BOX_RADIUS = 12;
/** Figma Frame 262 — 좌우 패딩 12px (펼침/접힘 공통) */
const HORIZONTAL_PADDING = 12;
const COLLAPSED_HORIZONTAL_PADDING = HORIZONTAL_PADDING;
/** TIP 태그 ↔ 문장 간격 */
const BADGE_GAP = 8;
const BADGE_RADIUS = 5;
const BADGE_PADDING_H = 6;
const BADGE_PADDING_V = 2;
const CONTENT_ROW_HEIGHT = 24;
const COLLAPSE_BUTTON_SIZE = 24;
/** 어코디언 버튼 영역 좌측 여백 (문장과 버튼 사이 gap 대신 영역 내부 패딩) */
const BUTTON_AREA_LEFT_PADDING = HORIZONTAL_PADDING;
/**
 * 박스 우측 예약 — 버튼 영역 좌(12) + 버튼(24) + 박스 우측(12)
 * 문장과 버튼 영역 사이 별도 gap 없음
 */
const BUTTON_RESERVE_WIDTH =
  BUTTON_AREA_LEFT_PADDING + COLLAPSE_BUTTON_SIZE + HORIZONTAL_PADDING;
/** 접힘 박스 너비 계산 전 초기값 (측정 전 깜빡임 완화) */
const BADGE_WIDTH_FALLBACK = 31;
const EXPAND_COLLAPSE_MS = 280;
/**
 * ease-in — 천천히 시작 → 끝에서 급가속 (펼침·접힘 공통)
 * Easing.bezier(x1, y1, x2, y2): (0,0)→(1,1) 진행 곡선의 제어점
 * - x1↑ (0.42→0.65~0.8): 초반을 더 오래 느리게
 * - y2↓ (1→0.2~0.4): 막판 스냅을 더 강하게
 */
const EXPAND_COLLAPSE_EASING = Easing.bezier(0.7, 0, 1, 0.7);
const MARQUEE_SPEED_PX_PER_SEC = 48;
const MARQUEE_START_DELAY_MS = 1500;
const MARQUEE_END_HOLD_MS = 1500;
const VERTICAL_TRANSITION_MS = 280;
const AUTO_RESUME_AFTER_USER_MS = 500;
const SWIPE_VELOCITY_THRESHOLD = 0.25;
const SWIPE_DISTANCE_THRESHOLD = 20;
const VERTICAL_SWIPE_DISTANCE_THRESHOLD = 32;
const VERTICAL_SWIPE_VELOCITY_THRESHOLD = 0.35;
/** 측정용 호스트 — 부모 flex 제약 없이 텍스트 intrinsic width 확보 */
const MEASURE_HOST_WIDTH = 10000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

type TipTransitionDirection = 'next' | 'prev';

interface TipFlowingSentenceProps {
  text: string;
  textColor: string;
  contentWidth: number;
  viewportWidth: number;
  autoEnabled: boolean;
  onFlowComplete: () => void;
  onSwipeUpToNext: () => void;
  onSwipeDownToPrev: () => void;
  onUserInteract: () => void;
  onBindStopFlow?: (stop: (() => void) | null) => void;
}

function TipFlowingSentence({
  text,
  textColor,
  contentWidth,
  viewportWidth,
  autoEnabled,
  onFlowComplete,
  onSwipeUpToNext,
  onSwipeDownToPrev,
  onUserInteract,
  onBindStopFlow,
}: TipFlowingSentenceProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const autoAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const panStartXRef = useRef(0);
  const currentXRef = useRef(0);
  const minTranslateXRef = useRef(0);
  const maxTranslateXRef = useRef(0);
  const autoEnabledRef = useRef(autoEnabled);
  const startDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowCompleteDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeAfterUserRef = useRef(false);
  const gestureAxisRef = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const callbacksRef = useRef({
    onFlowComplete,
    onSwipeUpToNext,
    onSwipeDownToPrev,
    onUserInteract,
  });
  callbacksRef.current = {
    onFlowComplete,
    onSwipeUpToNext,
    onSwipeDownToPrev,
    onUserInteract,
  };

  autoEnabledRef.current = autoEnabled;

  const travelRange = useMemo(() => {
    if (contentWidth <= 0 || viewportWidth <= 0) {
      return { minX: 0, maxX: 0 };
    }

    const overflow = Math.max(0, contentWidth - viewportWidth);

    return {
      minX: -overflow,
      maxX: 0,
    };
  }, [contentWidth, viewportWidth]);

  minTranslateXRef.current = travelRange.minX;
  maxTranslateXRef.current = travelRange.maxX;

  const stopAuto = useCallback(() => {
    if (startDelayRef.current != null) {
      clearTimeout(startDelayRef.current);
      startDelayRef.current = null;
    }
    if (flowCompleteDelayRef.current != null) {
      clearTimeout(flowCompleteDelayRef.current);
      flowCompleteDelayRef.current = null;
    }
    autoAnimRef.current?.stop();
    autoAnimRef.current = null;
    translateX.stopAnimation((value) => {
      currentXRef.current = value;
    });
  }, [translateX]);

  useEffect(() => {
    onBindStopFlow?.(stopAuto);
    return () => {
      onBindStopFlow?.(null);
    };
  }, [onBindStopFlow, stopAuto]);

  const scheduleFlowComplete = useCallback(() => {
    if (flowCompleteDelayRef.current != null) {
      clearTimeout(flowCompleteDelayRef.current);
    }
    flowCompleteDelayRef.current = setTimeout(() => {
      flowCompleteDelayRef.current = null;
      if (autoEnabledRef.current) {
        callbacksRef.current.onFlowComplete();
      }
    }, MARQUEE_END_HOLD_MS);
  }, []);

  const runMarqueeFrom = useCallback(
    (fromX: number) => {
      const minX = minTranslateXRef.current;
      const maxX = maxTranslateXRef.current;
      const startX = clamp(fromX, minX, maxX);
      const remainingDistance = Math.max(0, startX - minX);

      if (!autoEnabledRef.current) return;

      if (remainingDistance <= 0) {
        scheduleFlowComplete();
        return;
      }

      translateX.setValue(startX);
      currentXRef.current = startX;

      autoAnimRef.current = Animated.timing(translateX, {
        toValue: minX,
        duration: Math.max(500, (remainingDistance / MARQUEE_SPEED_PX_PER_SEC) * 1000),
        easing: Easing.linear,
        useNativeDriver: true,
      });
      autoAnimRef.current.start(({ finished }) => {
        currentXRef.current = minX;
        if (finished && autoEnabledRef.current) {
          scheduleFlowComplete();
        }
      });
    },
    [scheduleFlowComplete, translateX]
  );

  const runMarquee = useCallback(() => {
    runMarqueeFrom(maxTranslateXRef.current);
  }, [runMarqueeFrom]);

  const resumeMarqueeFromCurrent = useCallback(() => {
    runMarqueeFrom(currentXRef.current);
  }, [runMarqueeFrom]);

  const startAutoFlow = useCallback(() => {
    stopAuto();
    translateX.setValue(travelRange.maxX);
    currentXRef.current = travelRange.maxX;

    const distance = Math.max(0, travelRange.maxX - travelRange.minX);
    if (distance <= 0) {
      startDelayRef.current = setTimeout(() => {
        startDelayRef.current = null;
        if (autoEnabledRef.current) {
          scheduleFlowComplete();
        }
      }, MARQUEE_START_DELAY_MS);
      return () => {
        if (startDelayRef.current != null) {
          clearTimeout(startDelayRef.current);
          startDelayRef.current = null;
        }
      };
    }

    startDelayRef.current = setTimeout(() => {
      startDelayRef.current = null;
      if (autoEnabledRef.current) {
        runMarquee();
      }
    }, MARQUEE_START_DELAY_MS);

    return () => {
      if (startDelayRef.current != null) {
        clearTimeout(startDelayRef.current);
        startDelayRef.current = null;
      }
    };
  }, [runMarquee, scheduleFlowComplete, stopAuto, travelRange.maxX, translateX]);

  useEffect(() => {
    translateX.setValue(travelRange.maxX);
    currentXRef.current = travelRange.maxX;
  }, [text, translateX, travelRange.maxX]);

  useEffect(() => {
    if (contentWidth <= 0 || viewportWidth <= 0 || !autoEnabled) return;

    if (resumeAfterUserRef.current) {
      resumeAfterUserRef.current = false;
      resumeMarqueeFromCurrent();
      return stopAuto;
    }

    const cleanup = startAutoFlow();
    return () => {
      cleanup?.();
      stopAuto();
    };
  }, [
    autoEnabled,
    contentWidth,
    resumeMarqueeFromCurrent,
    startAutoFlow,
    stopAuto,
    viewportWidth,
  ]);

  const handleVerticalSwipe = useCallback((dy: number, vy: number) => {
    const hasVerticalDistance = Math.abs(dy) >= VERTICAL_SWIPE_DISTANCE_THRESHOLD;
    const hasVerticalVelocity = Math.abs(vy) >= VERTICAL_SWIPE_VELOCITY_THRESHOLD;

    if (!hasVerticalDistance && !hasVerticalVelocity) {
      return;
    }

    if (dy < 0) {
      callbacksRef.current.onSwipeUpToNext();
      return;
    }
    if (dy > 0) {
      callbacksRef.current.onSwipeDownToPrev();
    }
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          const absDx = Math.abs(gesture.dx);
          const absDy = Math.abs(gesture.dy);
          if (absDx <= 2 && absDy <= 2) {
            return false;
          }
          if (absDy > absDx) {
            return absDy > VERTICAL_SWIPE_DISTANCE_THRESHOLD / 2;
          }
          return absDx > absDy;
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          gestureAxisRef.current = 'none';
          stopAuto();
          resumeAfterUserRef.current = true;
          callbacksRef.current.onUserInteract();
          translateX.stopAnimation((value) => {
            panStartXRef.current = value;
            currentXRef.current = value;
          });
        },
        onPanResponderMove: (_, gesture) => {
          if (gestureAxisRef.current === 'none') {
            if (
              Math.abs(gesture.dy) > Math.abs(gesture.dx) &&
              Math.abs(gesture.dy) > 8
            ) {
              gestureAxisRef.current = 'vertical';
            } else if (
              Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
              Math.abs(gesture.dx) > 8
            ) {
              gestureAxisRef.current = 'horizontal';
            }
          }

          if (gestureAxisRef.current === 'vertical') return;

          resumeAfterUserRef.current = true;
          const minX = minTranslateXRef.current;
          const maxX = maxTranslateXRef.current;
          const next = clamp(panStartXRef.current + gesture.dx, minX, maxX);
          currentXRef.current = next;
          translateX.setValue(next);
        },
        onPanResponderRelease: (_, gesture) => {
          callbacksRef.current.onUserInteract();

          if (gestureAxisRef.current === 'vertical') {
            resumeAfterUserRef.current = false;
            handleVerticalSwipe(gesture.dy, gesture.vy);
            gestureAxisRef.current = 'none';
            return;
          }

          resumeAfterUserRef.current = true;
          gestureAxisRef.current = 'none';
        },
      }),
    [handleVerticalSwipe, stopAuto, translateX]
  );

  return (
    <View style={styles.flowViewport} {...panResponder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.marqueeTrack,
          { width: contentWidth, transform: [{ translateX }] },
        ]}
      >
        <Text style={[styles.message, { width: contentWidth, color: textColor }]}>
          {text}
        </Text>
      </Animated.View>
    </View>
  );
}

export function QuickInputTipBox() {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [measuredForTip, setMeasuredForTip] = useState('');
  const [tipIndex, setTipIndex] = useState(() => {
    const initial = pickInitialQuickInputTipIndex();
    rememberQuickInputTipIndex(initial);
    return initial;
  });
  const tipIndexRef = useRef(tipIndex);
  tipIndexRef.current = tipIndex;
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const slideY = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(1)).current;
  const isExpandAnimatingRef = useRef(false);
  const pendingCollapseRef = useRef(false);
  const stopFlowRef = useRef<(() => void) | null>(null);
  const autoResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipWidthCacheRef = useRef<Partial<Record<string, number>>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [badgeWidth, setBadgeWidth] = useState(BADGE_WIDTH_FALLBACK);
  const badgeWidthRef = useRef(BADGE_WIDTH_FALLBACK);

  const currentTip = QUICK_INPUT_TIPS[tipIndex] ?? QUICK_INPUT_TIPS[0];
  const cachedTipWidth = tipWidthCacheRef.current[currentTip] ?? 0;
  const activeContentWidth =
    measuredForTip === currentTip ? contentWidth : cachedTipWidth || contentWidth;

  useEffect(() => {
    let cancelled = false;

    void loadQuickInputTipBoxExpanded().then((expanded) => {
      if (cancelled) return;

      setIsExpanded(expanded);
      expandAnim.setValue(expanded ? 1 : 0);
      if (!expanded) {
        setAutoEnabled(false);
      }
      setIsPreferenceLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [expandAnim]);

  const handleTextMeasured = useCallback((width: number, tip: string) => {
    if (width <= 0) return;
    tipWidthCacheRef.current[tip] = width;
    setContentWidth(width);
    setMeasuredForTip(tip);
  }, []);

  /** 배지 View onLayout 대신 글리프 너비 + 좌우 패딩으로 계산 (Android 말줄임·줄바꿈 방지) */
  const handleBadgeTextMeasured = useCallback((textWidth: number) => {
    if (textWidth <= 0) return;
    const width = Math.max(
      BADGE_WIDTH_FALLBACK,
      Math.ceil(textWidth) +
        BADGE_PADDING_H * 2 +
        (Platform.OS === 'android' ? 2 : 0),
    );
    if (Math.abs(width - badgeWidthRef.current) < 0.5) return;
    badgeWidthRef.current = width;
    setBadgeWidth(width);
  }, []);

  const clearAutoResumeTimer = useCallback(() => {
    if (autoResumeTimerRef.current != null) {
      clearTimeout(autoResumeTimerRef.current);
      autoResumeTimerRef.current = null;
    }
  }, []);

  const pauseAutoForUser = useCallback(() => {
    setAutoEnabled(false);
    clearAutoResumeTimer();
    autoResumeTimerRef.current = setTimeout(() => {
      setAutoEnabled(true);
    }, AUTO_RESUME_AFTER_USER_MS);
  }, [clearAutoResumeTimer]);

  const runExpandCollapseAnimation = useCallback(
    (toExpanded: boolean) => {
      expandAnim.stopAnimation();
      isExpandAnimatingRef.current = true;
      setIsExpanded(toExpanded);
      void saveQuickInputTipBoxExpanded(toExpanded);

      Animated.timing(expandAnim, {
        toValue: toExpanded ? 1 : 0,
        duration: EXPAND_COLLAPSE_MS,
        easing: EXPAND_COLLAPSE_EASING,
        useNativeDriver: false,
      }).start(({ finished }) => {
        isExpandAnimatingRef.current = false;
        if (!finished) {
          expandAnim.setValue(toExpanded ? 1 : 0);
        }
      });
    },
    [expandAnim]
  );

  const beginCollapse = useCallback(() => {
    pendingCollapseRef.current = false;
    stopFlowRef.current?.();
    clearAutoResumeTimer();
    setAutoEnabled(false);
    runExpandCollapseAnimation(false);
  }, [clearAutoResumeTimer, runExpandCollapseAnimation]);

  const tryCompletePendingCollapse = useCallback(() => {
    if (pendingCollapseRef.current) {
      beginCollapse();
    }
  }, [beginCollapse]);

  const handleToggleExpand = useCallback(() => {
    if (!isPreferenceLoaded) return;

    if (isExpanded) {
      // 세로 문장 전환 중 → 전환 완료 후 접기
      if (isTransitioning) {
        pendingCollapseRef.current = true;
        return;
      }
      // 좌우 흐름(마키) 중 → 즉시 접기
      beginCollapse();
      return;
    }

    pendingCollapseRef.current = false;
    setAutoEnabled(true);
    runExpandCollapseAnimation(true);
  }, [
    beginCollapse,
    isExpanded,
    isPreferenceLoaded,
    isTransitioning,
    runExpandCollapseAnimation,
  ]);

  useEffect(() => {
    if (isExpanded) {
      setAutoEnabled(true);
      return;
    }
    setAutoEnabled(false);
    clearAutoResumeTimer();
  }, [clearAutoResumeTimer, isExpanded]);

  useEffect(() => {
    rememberQuickInputTipIndex(tipIndex);
  }, [tipIndex]);

  useEffect(() => {
    return () => {
      rememberQuickInputTipIndex(tipIndexRef.current);
    };
  }, []);

  const transitionToTip = useCallback(
    (nextIndex: number, direction: TipTransitionDirection) => {
      if (isTransitioning) return;

      const normalized = resolveSequentialTipIndex(
        tipIndexRef.current,
        nextIndex,
        direction
      );

      const exitToValue =
        direction === 'next' ? -CONTENT_ROW_HEIGHT : CONTENT_ROW_HEIGHT;
      const enterFromValue =
        direction === 'next' ? CONTENT_ROW_HEIGHT : -CONTENT_ROW_HEIGHT;

      setIsTransitioning(true);

      Animated.timing(slideY, {
        toValue: exitToValue,
        duration: VERTICAL_TRANSITION_MS,
        easing: Easing.inOut(Easing.cubic),
        // overflow:hidden 클립이 native transform 레이어에 적용되지 않는 이슈 방지
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (!finished) {
          setIsTransitioning(false);
          slideY.setValue(0);
          tryCompletePendingCollapse();
          return;
        }

        tipIndexRef.current = normalized;
        setTipIndex(normalized);
        rememberQuickInputTipIndex(normalized);
        slideY.setValue(enterFromValue);

        Animated.timing(slideY, {
          toValue: 0,
          duration: VERTICAL_TRANSITION_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(({ finished: inFinished }) => {
          setIsTransitioning(false);
          if (!inFinished) {
            slideY.setValue(0);
            return;
          }
          tryCompletePendingCollapse();
        });
      });
    },
    [isTransitioning, slideY, tryCompletePendingCollapse]
  );

  const goToNextTip = useCallback(() => {
    transitionToTip(tipIndexRef.current + 1, 'next');
  }, [transitionToTip]);

  const goToPrevTip = useCallback(() => {
    transitionToTip(tipIndexRef.current - 1, 'prev');
  }, [transitionToTip]);

  const handleFlowComplete = useCallback(() => {
    if (pendingCollapseRef.current || !autoEnabled || isTransitioning) return;
    goToNextTip();
  }, [autoEnabled, goToNextTip, isTransitioning]);

  const handleManualNext = useCallback(() => {
    if (isTransitioning) return;
    pauseAutoForUser();
    goToNextTip();
  }, [goToNextTip, isTransitioning, pauseAutoForUser]);

  const handleManualPrev = useCallback(() => {
    if (isTransitioning) return;
    pauseAutoForUser();
    goToPrevTip();
  }, [goToPrevTip, isTransitioning, pauseAutoForUser]);

  useEffect(() => {
    return () => clearAutoResumeTimer();
  }, [clearAutoResumeTimer]);

  const hasContainerLayout = containerWidth > 0;
  const isMessageReady = hasContainerLayout && (isExpanded || viewportWidth > 0);
  const hasMeasuredCurrentTip =
    measuredForTip === currentTip && activeContentWidth > 0 && isMessageReady;
  const shouldRenderSentence =
    hasContainerLayout &&
    (isTransitioning || hasMeasuredCurrentTip || measuredForTip !== currentTip);

  const collapsedBoxWidth =
    HORIZONTAL_PADDING * 2 +
    badgeWidth +
    BUTTON_AREA_LEFT_PADDING +
    COLLAPSE_BUTTON_SIZE;
  const expandedBoxWidth = Math.max(collapsedBoxWidth, containerWidth);
  const contentLayerWidth = Math.max(0, expandedBoxWidth - BUTTON_RESERVE_WIDTH);
  const expandedMessageMaxWidth = Math.max(
    0,
    contentLayerWidth - HORIZONTAL_PADDING - badgeWidth - BADGE_GAP
  );

  const boxWidth = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [collapsedBoxWidth, expandedBoxWidth],
  });
  const arrowLeftOpacity = expandAnim;
  const arrowRightOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const buttonWellWidth = BUTTON_RESERVE_WIDTH;

  if (!isPreferenceLoaded) {
    return <View style={styles.root} pointerEvents="none" accessibilityElementsHidden />;
  }

  return (
    <View
      style={styles.root}
      pointerEvents="box-none"
      onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && width !== containerWidth) {
          setContainerWidth(width);
        }
      }}
    >
      {/* overflow:hidden 밖에서 측정 — flex 제약으로 Text/배지가 줄바꿈되는 문제 방지 */}
      <View style={styles.measureHost} pointerEvents="none">
        <Text
          style={[styles.badgeText, styles.measureBadgeText, { color: palette.staticWhite }]}
          onTextLayout={(event) => {
            const textWidth = event.nativeEvent.lines.reduce(
              (max, line) => Math.max(max, line.width),
              0,
            );
            handleBadgeTextMeasured(textWidth);
          }}
        >
          TIP
        </Text>
        <Text
          key={currentTip}
          style={[styles.message, { color: palette.text }]}
          onTextLayout={(event) => {
            const lineWidth = event.nativeEvent.lines.reduce(
              (max, line) => Math.max(max, line.width),
              0
            );
            handleTextMeasured(lineWidth, currentTip);
          }}
        >
          {currentTip}
        </Text>
      </View>

      <Animated.View
        style={[
          styles.box,
          { backgroundColor: TIP_BOX_BACKGROUND, width: boxWidth },
        ]}
        pointerEvents="box-none"
      >
        {/* 펼침 기준 고정 레이아웃 — 접을 때는 박스 width + overflow로만 오른쪽 클립 */}
        <View style={styles.boxInner} pointerEvents="box-none">
          <View
            style={[styles.contentLayer, { width: contentLayerWidth }]}
            pointerEvents="box-none"
          >
            <View style={styles.contentRow} pointerEvents="box-none">
              <View
                style={[
                  styles.badge,
                  { backgroundColor: palette.primary, width: badgeWidth },
                ]}
              >
                <Text style={[styles.badgeText, { color: palette.staticWhite }]}>TIP</Text>
              </View>

              {containerWidth > 0 && expandedMessageMaxWidth > 0 && (
                <View
                  style={[styles.messageGestureHost, { width: expandedMessageMaxWidth }]}
                  pointerEvents={isExpanded ? 'auto' : 'none'}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel={`간편입력 작성 팁 ${tipIndex + 1}번째, 총 ${QUICK_INPUT_TIPS.length}개: ${currentTip}`}
                  accessibilityHint="문장을 좌우로 드래그해 위치를 제어하고, 위로 스와이프하면 다음 팁, 아래로 스와이프하면 이전 팁으로 이동합니다."
                  accessibilityActions={[
                    { name: 'increment', label: '다음 팁' },
                    { name: 'decrement', label: '이전 팁' },
                  ]}
                  onAccessibilityAction={(event) => {
                    if (event.nativeEvent.actionName === 'increment') {
                      handleManualNext();
                    } else if (event.nativeEvent.actionName === 'decrement') {
                      handleManualPrev();
                    }
                  }}
                  onLayout={(event) => {
                    const width = event.nativeEvent.layout.width;
                    if (width > 0 && width !== viewportWidth) {
                      setViewportWidth(width);
                    }
                  }}
                >
                  {shouldRenderSentence && (
                    <View style={styles.messageClip}>
                      <Animated.View
                        style={[styles.sentenceSlot, { transform: [{ translateY: slideY }] }]}
                      >
                        <TipFlowingSentence
                          key={`${tipIndex}-${currentTip}`}
                          text={currentTip}
                          textColor={palette.text}
                          contentWidth={activeContentWidth}
                          viewportWidth={
                            expandedMessageMaxWidth > 0 ? expandedMessageMaxWidth : viewportWidth
                          }
                          autoEnabled={autoEnabled && !isTransitioning && hasMeasuredCurrentTip}
                          onFlowComplete={handleFlowComplete}
                          onSwipeUpToNext={handleManualNext}
                          onSwipeDownToPrev={handleManualPrev}
                          onUserInteract={pauseAutoForUser}
                          onBindStopFlow={(stop) => {
                            stopFlowRef.current = stop;
                          }}
                        />
                      </Animated.View>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          <Animated.View
            style={[
              styles.buttonWell,
              { backgroundColor: BUTTON_AREA_BACKGROUND, width: buttonWellWidth },
            ]}
            pointerEvents="none"
          />
          <Pressable
            style={styles.collapseButtonHitArea}
            pointerEvents="auto"
            onPress={handleToggleExpand}
            accessibilityRole="button"
            accessibilityLabel={isExpanded ? '팁 접기' : '팁 펼치기'}
            accessibilityState={{ expanded: isExpanded }}
          >
            <View
              style={[styles.collapseButton, { backgroundColor: BUTTON_AREA_BACKGROUND }]}
              pointerEvents="none"
            >
              <View style={styles.collapseIconLayer}>
                <Animated.View style={[styles.collapseIcon, { opacity: arrowLeftOpacity }]}>
                  <Icon
                    name="arrowLeft"
                    variant="solid"
                    size={COLLAPSE_BUTTON_SIZE}
                    color={palette.text}
                  />
                </Animated.View>
                <Animated.View style={[styles.collapseIcon, { opacity: arrowRightOpacity }]}>
                  <Icon
                    name="arrowRight"
                    variant="solid"
                    size={COLLAPSE_BUTTON_SIZE}
                    color={palette.text}
                  />
                </Animated.View>
              </View>
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    height: BOX_HEIGHT,
    alignItems: 'flex-start',
  },
  measureHost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: MEASURE_HOST_WIDTH,
    height: BOX_HEIGHT,
    opacity: 0,
    zIndex: -1,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  measureBadgeText: {
    alignSelf: 'flex-start',
  },
  box: {
    height: BOX_HEIGHT,
    borderRadius: BOX_RADIUS,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  boxInner: {
    width: '100%',
    height: BOX_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  contentLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: BOX_HEIGHT,
    overflow: 'hidden',
    zIndex: 0,
  },
  buttonWell: {
    position: 'absolute',
    right: 0,
    top: 0,
    height: BOX_HEIGHT,
    zIndex: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: BOX_HEIGHT,
    paddingLeft: HORIZONTAL_PADDING,
  },
  badge: {
    flexShrink: 0,
    flexGrow: 0,
    alignSelf: 'center',
    borderRadius: BADGE_RADIUS,
    paddingHorizontal: BADGE_PADDING_H,
    paddingVertical: BADGE_PADDING_V,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    ...typography.detail.r.bold,
    flexShrink: 0,
    textAlign: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  messageGestureHost: {
    height: BOX_HEIGHT,
    flexShrink: 1,
    marginLeft: BADGE_GAP,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  messageClip: {
    width: '100%',
    height: CONTENT_ROW_HEIGHT,
    overflow: 'hidden',
  },
  sentenceSlot: {
    height: CONTENT_ROW_HEIGHT,
    justifyContent: 'center',
  },
  flowViewport: {
    width: '100%',
    height: CONTENT_ROW_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  marqueeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: {
    ...typography.body1.l.regular,
    flexShrink: 0,
  },
  collapseButtonHitArea: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: BUTTON_RESERVE_WIDTH,
    height: BOX_HEIGHT,
    zIndex: 20,
    elevation: 20,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: HORIZONTAL_PADDING,
  },
  collapseButton: {
    width: COLLAPSE_BUTTON_SIZE,
    height: COLLAPSE_BUTTON_SIZE,
    borderRadius: COLLAPSE_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapseIconLayer: {
    width: COLLAPSE_BUTTON_SIZE,
    height: COLLAPSE_BUTTON_SIZE,
  },
  collapseIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
