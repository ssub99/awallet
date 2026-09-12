/**
 * Quick Input Confirm Card
 *
 * 간편입력 전송 시 사용자에게 기록 내용 확인을 요청하는 카드
 * 피그마 Chat_left 시안 기반
 */

import { Icon } from '@/components/ui/icon';
import { Tooltip, TOOLTIP_BODY_MAX_WIDTH } from '@/components/ui/tooltip';
import { atomicColors } from '@/constants/atomic-colors';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { spacing } from '@/constants/spacing';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export interface QuickInputConfirmCardData {
  recordType?: 'expense' | 'income';
  category: string;
  categoryEmoji?: string;
  date: string;
  amount: string;
  paymentType?: string;
  paymentTypeColor?: string;
  paymentTypeEmoji?: string;
  memo?: string;
  /** 반복 설정: 1. 정기/할부/일반, 2. 기록 단위, 3. 주말 옵션 */
  repeatOption1?: string;
  repeatOption2?: string;
  repeatOption3?: string;
}

export interface QuickInputConfirmCardProps {
  data: QuickInputConfirmCardData;
  onConfirm: () => void;
  onCancel: () => void;
  onChange?: () => void;
  /** 카테고리 미선택 플레이스홀더 탭 (문자 수신함 등) */
  onCategoryPress?: () => void;
  /** 추가 버튼 로딩 여부. true면 추가 버튼에 인디케이터, 취소 버튼 비활성화 */
  addLoading?: boolean;
  /** false면 등장 슬라이드/페이드 생략 (문자 수신함 스택 등) */
  animateEntrance?: boolean;
  /** 하단 추가/취소 버튼 높이. 시안 기본 40, 문자 수신함 카드는 48 */
  actionButtonHeight?: number;
  /** true면 카드 콘텐츠 대신 스켈레톤 표기 */
  contentLoading?: boolean;
  /**
   * true면 추가/취소 탭 시 카드 자체 퇴장 모션 없이 콜백만 호출.
   * 문자 수신함처럼 부모 스택이 퇴장+롤업을 담당할 때 사용.
   */
  deferExitAnimation?: boolean;
}

const ROW_LABELS = {
  category: '카테고리',
  date: '날짜',
  amount: '금액',
  paymentType: '결제 유형',
  repeatOption1: '반복 설정',
} as const;

const MEMO_BUTTON_SIZE = 32;
const MEMO_ICON_SIZE = 24;
const MEMO_EMPTY_TOOLTIP_TEXT = '메모 없음';

const CATEGORY_EMPTY_PLACEHOLDER = '선택해 주세요.';

/** 빈 값 · 예전 플레이스홀더('미정') → 미선택 */
function isCategoryUnset(category: string): boolean {
  const trimmed = category.trim();
  return trimmed.length === 0 || trimmed === '미정';
}

function ConfirmRow({
  label,
  value,
  colors,
  valueColor,
  valuePrefix,
  valueUnderline,
  onValuePress,
  valueAccessibilityLabel,
}: {
  label: string;
  value: string;
  colors: ColorPalette;
  /** 미지정 시 Semantic/Label/Normal(`colors.text`) */
  valueColor?: string;
  /** 이모지 등 — 언더라인 대상에서 제외 */
  valuePrefix?: string;
  valueUnderline?: boolean;
  onValuePress?: () => void;
  valueAccessibilityLabel?: string;
}) {
  const valueColorStyle = { color: valueColor ?? colors.text };
  const textNode = (
    <Text
      style={[
        valuePrefix || onValuePress ? styles.valueInPressable : styles.value,
        valueColorStyle,
        valueUnderline ? styles.valueUnderline : null,
      ]}
      numberOfLines={1}
    >
      {value}
    </Text>
  );
  const valueContent = valuePrefix ? (
    <View style={onValuePress ? styles.valuePressableInner : styles.valueWithPrefix}>
      <Text style={[styles.categoryEmoji, valueColorStyle]}>{valuePrefix} </Text>
      {textNode}
    </View>
  ) : (
    textNode
  );

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textAssistive }]}>{label}</Text>
      {onValuePress ? (
        <Pressable
          onPress={onValuePress}
          accessibilityRole="button"
          accessibilityLabel={valueAccessibilityLabel ?? value}
          hitSlop={8}
          style={styles.valuePressable}
        >
          {valueContent}
        </Pressable>
      ) : valuePrefix ? (
        valueContent
      ) : (
        textNode
      )}
    </View>
  );
}

function PaymentTypeRow({
  label,
  value,
  color,
  emoji,
  colors,
}: {
  label: string;
  value: string;
  color?: string;
  emoji?: string;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textAssistive }]}>{label}</Text>
      <View style={styles.valueWithIndicator}>
        {emoji ? (
          <Text style={[styles.paymentEmoji, { color: colors.text }]}>{emoji}</Text>
        ) : (
          <View style={[styles.paymentDot, { backgroundColor: color ?? colors.primary, borderColor: colors.border }]} />
        )}
        <Text style={[styles.value, styles.valueNoMarginLeft, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const CARD_SLIDE_OFFSET = 16;
const CARD_ANIMATION_DURATION = 180;
/** 원문 스켈레톤과 동일 — 왕복 0.7초 */
const SKELETON_PULSE_HALF_MS = 500;

/** 기록 카드 로딩 — Figma Frame 172 (2241:31518) */
function ConfirmCardSkeleton({
  boneColor,
  lineColor,
  actionButtonHeight,
}: {
  boneColor: string;
  lineColor: string;
  actionButtonHeight: number;
}) {
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
    <View style={styles.skeleton} accessibilityLabel="기록 불러오는 중">
      <View style={styles.skeletonTitleRow}>
        <RNAnimated.View
          style={[styles.skeletonTitleBone, { backgroundColor: boneColor, opacity: pulse }]}
        />
      </View>
      <View style={[styles.skeletonDivider, { backgroundColor: lineColor }]} />
      <View style={styles.skeletonRows}>
        {[0, 1, 2, 3, 4].map((row) => (
          <View key={row} style={styles.skeletonRow}>
            <RNAnimated.View
              style={[styles.skeletonLabelBone, { backgroundColor: boneColor, opacity: pulse }]}
            />
            <RNAnimated.View
              style={[styles.skeletonValueBone, { backgroundColor: boneColor, opacity: pulse }]}
            />
          </View>
        ))}
      </View>
      <View style={styles.skeletonButtonRow}>
        <RNAnimated.View
          style={[
            styles.skeletonButtonBone,
            { height: actionButtonHeight, backgroundColor: boneColor, opacity: pulse },
          ]}
        />
        <RNAnimated.View
          style={[
            styles.skeletonButtonBone,
            { height: actionButtonHeight, backgroundColor: boneColor, opacity: pulse },
          ]}
        />
      </View>
    </View>
  );
}

export function QuickInputConfirmCard({
  data,
  onConfirm,
  onCancel,
  onChange,
  onCategoryPress,
  addLoading = false,
  animateEntrance = true,
  actionButtonHeight = 40,
  contentLoading = false,
  deferExitAnimation = false,
}: QuickInputConfirmCardProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const translateY = useSharedValue(animateEntrance ? -CARD_SLIDE_OFFSET : 0);
  const opacity = useSharedValue(animateEntrance ? 0 : 1);
  const [isExiting, setIsExiting] = useState(false);
  const [memoTooltipVisible, setMemoTooltipVisible] = useState(false);

  const memoText = typeof data.memo === 'string' ? data.memo.trim() : '';
  const hasMemo = memoText.length > 0;
  const memoTooltipText = hasMemo ? memoText : MEMO_EMPTY_TOOLTIP_TEXT;

  useEffect(() => {
    if (!animateEntrance) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }
    translateY.value = withTiming(0, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
    opacity.value = withTiming(1, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [animateEntrance, opacity, translateY]);

  useEffect(() => {
    setMemoTooltipVisible(false);
  }, [data.memo, data.category, data.amount, data.date]);

  useEffect(() => {
    if (contentLoading) {
      setMemoTooltipVisible(false);
    }
  }, [contentLoading]);

  const buttonsDisabled = isExiting || addLoading || contentLoading;

  const dismissMemoTooltip = useCallback(() => {
    setMemoTooltipVisible(false);
  }, []);

  const playExitThen = useCallback(
    (then: () => void) => {
      if (isExiting || addLoading || contentLoading) return;
      setIsExiting(true);
      setMemoTooltipVisible(false);
      translateY.value = withTiming(
        -CARD_SLIDE_OFFSET,
        {
          duration: CARD_ANIMATION_DURATION,
          easing: Easing.inOut(Easing.cubic),
        },
        (finished) => {
          if (finished) {
            runOnJS(then)();
          }
        },
      );
      opacity.value = withTiming(0, {
        duration: CARD_ANIMATION_DURATION,
        easing: Easing.inOut(Easing.cubic),
      });
    },
    [addLoading, contentLoading, isExiting, opacity, translateY],
  );

  const handleCancel = useCallback(() => {
    if (deferExitAnimation) {
      dismissMemoTooltip();
      onCancel();
      return;
    }
    playExitThen(onCancel);
  }, [deferExitAnimation, dismissMemoTooltip, onCancel, playExitThen]);

  const handleConfirmPress = useCallback(() => {
    dismissMemoTooltip();
    if (deferExitAnimation) {
      onConfirm();
      return;
    }
    onConfirm();
  }, [dismissMemoTooltip, deferExitAnimation, onConfirm]);

  const handleChangePress = useCallback(() => {
    if (buttonsDisabled || !onChange) return;
    dismissMemoTooltip();
    onChange();
  }, [buttonsDisabled, dismissMemoTooltip, onChange]);

  const handleCategoryPress = useCallback(() => {
    if (buttonsDisabled || !onCategoryPress) return;
    dismissMemoTooltip();
    onCategoryPress();
  }, [buttonsDisabled, dismissMemoTooltip, onCategoryPress]);

  const handleMemoPress = useCallback(() => {
    if (buttonsDisabled) return;
    if (memoTooltipVisible) {
      dismissMemoTooltip();
      return;
    }
    setMemoTooltipVisible(true);
  }, [buttonsDisabled, dismissMemoTooltip, memoTooltipVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const isCategoryEmpty = isCategoryUnset(data.category);
  const categoryDisplay = isCategoryEmpty
    ? CATEGORY_EMPTY_PLACEHOLDER
    : data.category;
  const categoryEmojiPrefix =
    !isCategoryEmpty && data.categoryEmoji ? data.categoryEmoji : undefined;

  const title =
    data.recordType === 'income'
      ? '수입 기록 생성'
      : data.repeatOption1 === '정기 기록'
      ? '정기 기록 생성'
      : data.repeatOption1 === '할부 기록'
        ? '할부 기록 생성'
        : '일반 기록 생성';

  return (
    <Animated.View
      style={[styles.card, { backgroundColor: palette.staticWhite }, animatedStyle]}
    >
      {contentLoading ? (
        <ConfirmCardSkeleton
          boneColor={atomicColors.neutral[200]}
          lineColor={palette.border}
          actionButtonHeight={actionButtonHeight}
        />
      ) : (
      <View>
        <View style={styles.titleRow}>
          <View style={styles.titleLeading}>
            <Pressable
              onPress={dismissMemoTooltip}
              disabled={!memoTooltipVisible}
              style={styles.titlePressable}
            >
              <Text style={[styles.title, { color: palette.textNeutral }]} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
            <View style={styles.memoButtonWrap}>
              <Pressable
                style={[styles.memoButton, { backgroundColor: palette.fill }]}
                onPress={handleMemoPress}
                disabled={buttonsDisabled}
                accessibilityRole="button"
                accessibilityLabel={hasMemo ? '메모 보기' : '메모 없음'}
                accessibilityState={{ disabled: buttonsDisabled, expanded: memoTooltipVisible }}
              >
                <Icon
                  name="memo"
                  variant="line"
                  size={MEMO_ICON_SIZE}
                  color={palette.textNeutral}
                />
              </Pressable>
              {memoTooltipVisible ? (
                <View style={styles.memoTooltipAnchor} pointerEvents="none">
                  <Tooltip text={memoTooltipText} placement="top" />
                </View>
              ) : null}
            </View>
          </View>
          <Pressable
            onPress={handleChangePress}
            disabled={buttonsDisabled || !onChange}
            accessibilityRole="button"
            accessibilityLabel="변경"
            accessibilityState={{ disabled: buttonsDisabled || !onChange }}
            hitSlop={8}
          >
            <Text style={[styles.changeText, { color: palette.textAssistive }]}>변경</Text>
          </Pressable>
        </View>
        <Pressable onPress={dismissMemoTooltip} disabled={!memoTooltipVisible}>
          <View style={[styles.divider, { backgroundColor: palette.border }]} />
        </Pressable>
        <View style={styles.content}>
          {memoTooltipVisible ? (
            <Pressable
              style={styles.contentDismissOverlay}
              onPress={dismissMemoTooltip}
              accessibilityRole="button"
              accessibilityLabel="메모 툴팁 닫기"
            />
          ) : null}
          <ConfirmRow
            label={ROW_LABELS.category}
            value={categoryDisplay}
            valuePrefix={categoryEmojiPrefix}
            colors={palette}
            valueColor={isCategoryEmpty ? palette.textAssistive : undefined}
            valueUnderline={Boolean(onCategoryPress)}
            onValuePress={
              onCategoryPress && !buttonsDisabled ? handleCategoryPress : undefined
            }
            valueAccessibilityLabel={isCategoryEmpty ? '카테고리 선택' : '카테고리 변경'}
          />
          <ConfirmRow label={ROW_LABELS.date} value={data.date} colors={palette} />
          <ConfirmRow label={ROW_LABELS.amount} value={data.amount} colors={palette} />
          {data.recordType !== 'income' ? (
            <>
              <PaymentTypeRow
                label={ROW_LABELS.paymentType}
                value={data.paymentType ?? ''}
                color={data.paymentTypeColor}
                emoji={data.paymentTypeEmoji}
                colors={palette}
              />
              <ConfirmRow
                label={ROW_LABELS.repeatOption1}
                value={[data.repeatOption1, data.repeatOption2, data.repeatOption3]
                  .filter(Boolean)
                  .join(' · ')}
                colors={palette}
              />
            </>
          ) : null}
        </View>
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.button, { height: actionButtonHeight, backgroundColor: palette.fillStrong }]}
            onPress={handleConfirmPress}
            disabled={buttonsDisabled}
            accessibilityRole="button"
            accessibilityLabel={addLoading ? '추가 중' : '추가'}
            accessibilityState={{ disabled: buttonsDisabled }}
          >
            {addLoading ? (
              <ActivityIndicator
                size={Platform.OS === 'android' ? 20 : 'small'}
                color={palette.textNeutral}
              />
            ) : (
              <Text style={[styles.buttonText, { color: palette.textNeutral }]}>추가</Text>
            )}
          </Pressable>
          <Pressable
            style={[
              styles.button,
              {
                height: actionButtonHeight,
                backgroundColor: buttonsDisabled ? palette.fillDisabled : palette.fillStrong,
              },
            ]}
            onPress={handleCancel}
            disabled={buttonsDisabled}
            accessibilityRole="button"
            accessibilityLabel="취소"
            accessibilityState={{ disabled: buttonsDisabled }}
          >
            <Text
              style={[styles.buttonText, { color: buttonsDisabled ? palette.textDisabled : palette.textNeutral }]}
            >
              취소
            </Text>
          </Pressable>
        </View>
      </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    paddingHorizontal: spacing[600],
    paddingVertical: spacing[500],
    overflow: 'visible',
    position: 'relative',
  },
  skeleton: {
    gap: spacing[300],
  },
  skeletonTitleRow: {
    height: 32,
    justifyContent: 'center',
  },
  skeletonTitleBone: {
    width: 215,
    height: 24,
    borderRadius: 8,
  },
  skeletonDivider: {
    height: 1,
    width: '100%',
  },
  skeletonRows: {
    gap: spacing[200],
  },
  skeletonRow: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[400],
  },
  skeletonLabelBone: {
    width: 64,
    height: 24,
    borderRadius: 8,
  },
  skeletonValueBone: {
    width: 215,
    height: 24,
    borderRadius: 8,
  },
  skeletonButtonRow: {
    flexDirection: 'row',
    gap: spacing[200],
  },
  skeletonButtonBone: {
    flex: 1,
    borderRadius: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    gap: spacing[200],
    overflow: 'visible',
    zIndex: 2,
  },
  titleLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[200],
    minWidth: 0,
    overflow: 'visible',
    position: 'relative',
  },
  title: {
    ...typography.headline04.bold,
    flexShrink: 1,
  },
  titlePressable: {
    flexShrink: 1,
    minWidth: 0,
  },
  memoButtonWrap: {
    position: 'relative',
    overflow: 'visible',
  },
  memoButton: {
    width: MEMO_BUTTON_SIZE,
    height: MEMO_BUTTON_SIZE,
    borderRadius: MEMO_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentDismissOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
  },
  memoTooltipAnchor: {
    position: 'absolute',
    top: MEMO_BUTTON_SIZE + spacing[100],
    left: MEMO_BUTTON_SIZE / 2 - TOOLTIP_BODY_MAX_WIDTH / 2,
    width: TOOLTIP_BODY_MAX_WIDTH,
    alignItems: 'center',
    zIndex: 20,
    elevation: 20,
  },
  changeText: {
    ...typographyLayout.uiLineBody01Regular,
    textDecorationLine: 'underline',
  },
  divider: {
    height: 1,
    marginTop: spacing[300],
    marginBottom: spacing[300],
  },
  content: {
    gap: spacing[200],
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  label: {
    ...typographyLayout.uiLineBody01Regular,
    width: 64,
  },
  value: {
    ...typographyLayout.uiLineBody01Medium,
    marginLeft: spacing[200],
    flex: 1,
    textAlign: 'left',
  },
  valueInPressable: {
    ...typographyLayout.uiLineBody01Medium,
    textAlign: 'left',
    flexShrink: 1,
  },
  valueUnderline: {
    textDecorationLine: 'underline',
  },
  valuePressable: {
    flex: 1,
    marginLeft: spacing[200],
    minWidth: 0,
  },
  valuePressableInner: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flexShrink: 1,
  },
  valueWithPrefix: {
    marginLeft: spacing[200],
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  categoryEmoji: typographyLayout.uiLineBody01Regular,
  valueNoMarginLeft: {
    marginLeft: 0,
  },
  valueWithIndicator: {
    marginLeft: spacing[200],
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[200],
  },
  paymentDot: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  paymentEmoji: typographyLayout.uiLineBody01Regular,
  buttonRow: {
    flexDirection: 'row',
    gap: spacing[200],
    marginTop: spacing[300],
  },
  button: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typographyLayout.uiLineBody01Medium,
  },
});
