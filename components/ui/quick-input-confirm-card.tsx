/**
 * Quick Input Confirm Card
 *
 * 간편입력 전송 시 사용자에게 기록 내용 확인을 요청하는 카드
 * 피그마 Chat_left 시안 기반
 */

import { Icon } from '@/components/ui/icon';
import { Tooltip, TOOLTIP_BODY_MAX_WIDTH } from '@/components/ui/tooltip';
import { colors, typography, type ColorPalette } from '@/constants/theme';
import { spacing } from '@/constants/spacing';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
  /** 추가 버튼 로딩 여부. true면 추가 버튼에 인디케이터, 취소 버튼 비활성화 */
  addLoading?: boolean;
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

type MemoButtonRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function ConfirmRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ColorPalette;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.textAssistive }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
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

export function QuickInputConfirmCard({
  data,
  onConfirm,
  onCancel,
  onChange,
  addLoading = false,
}: QuickInputConfirmCardProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const translateY = useSharedValue(-CARD_SLIDE_OFFSET);
  const opacity = useSharedValue(0);
  const cardRef = useRef<View>(null);
  const memoButtonWrapRef = useRef<View>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [memoTooltipVisible, setMemoTooltipVisible] = useState(false);
  const [memoButtonRect, setMemoButtonRect] = useState<MemoButtonRect | null>(null);

  const memoText = typeof data.memo === 'string' ? data.memo.trim() : '';
  const hasMemo = memoText.length > 0;
  const memoTooltipText = hasMemo ? memoText : MEMO_EMPTY_TOOLTIP_TEXT;

  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
    opacity.value = withTiming(1, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [opacity, translateY]);

  useEffect(() => {
    setMemoTooltipVisible(false);
  }, [data.memo, data.category, data.amount, data.date]);

  const handleMemoButtonWrapLayout = useCallback(() => {
    const card = cardRef.current;
    const memoWrap = memoButtonWrapRef.current;
    if (!card || !memoWrap) return;

    memoWrap.measureLayout(
      card,
      (x, y, width, height) => {
        setMemoButtonRect({ x, y, width, height });
      },
      () => {
        setMemoButtonRect(null);
      },
    );
  }, []);

  const buttonsDisabled = isExiting || addLoading;

  const dismissMemoTooltip = useCallback(() => {
    setMemoTooltipVisible(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (isExiting || addLoading) return;
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
          runOnJS(onCancel)();
        }
      }
    );
    opacity.value = withTiming(0, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [isExiting, addLoading, onCancel, opacity, translateY]);

  const handleChangePress = useCallback(() => {
    if (buttonsDisabled || !onChange) return;
    dismissMemoTooltip();
    onChange();
  }, [buttonsDisabled, dismissMemoTooltip, onChange]);

  const handleMemoPress = useCallback(() => {
    if (buttonsDisabled) return;
    if (memoTooltipVisible) {
      dismissMemoTooltip();
      return;
    }
    handleMemoButtonWrapLayout();
    setMemoTooltipVisible(true);
  }, [buttonsDisabled, dismissMemoTooltip, handleMemoButtonWrapLayout, memoTooltipVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const categoryDisplay = data.categoryEmoji
    ? `${data.categoryEmoji} ${data.category}`
    : data.category;

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
      ref={cardRef}
      style={[styles.card, { backgroundColor: palette.staticWhite }, animatedStyle]}
      onLayout={handleMemoButtonWrapLayout}
    >
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
          <View ref={memoButtonWrapRef} style={styles.memoButtonWrap} onLayout={handleMemoButtonWrapLayout}>
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
      {memoTooltipVisible && memoButtonRect ? (
        <View
          style={[
            styles.memoTooltipAnchor,
            {
              top: memoButtonRect.y + memoButtonRect.height + spacing[100],
              left: memoButtonRect.x + memoButtonRect.width / 2 - TOOLTIP_BODY_MAX_WIDTH / 2,
            },
          ]}
          pointerEvents="none"
        >
          <Tooltip text={memoTooltipText} placement="top" />
        </View>
      ) : null}
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
        <ConfirmRow label={ROW_LABELS.category} value={categoryDisplay} colors={palette} />
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
          style={[styles.button, { backgroundColor: palette.fillStrong }]}
          onPress={() => {
            dismissMemoTooltip();
            onConfirm();
          }}
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
            { backgroundColor: buttonsDisabled ? palette.fillDisabled : palette.fillStrong },
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
    gap: spacing[200],
    overflow: 'visible',
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  memoTooltipAnchor: {
    position: 'absolute',
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
