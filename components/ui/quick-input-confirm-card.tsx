/**
 * Quick Input Confirm Card
 *
 * 간편입력 전송 시 사용자에게 기록 내용 확인을 요청하는 카드
 * 피그마 Chat_left 시안 기반
 */

import { colors, typography, type ColorPalette } from '@/constants/theme';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCallback, useEffect, useState } from 'react';
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
  /** 반복 설정: 1. 정기/할부/일반, 2. 기록 단위, 3. 주말 옵션 */
  repeatOption1?: string;
  repeatOption2?: string;
  repeatOption3?: string;
}

export interface QuickInputConfirmCardProps {
  data: QuickInputConfirmCardData;
  onConfirm: () => void;
  onCancel: () => void;
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

const CARD_SLIDE_OFFSET = 400;
const CARD_ANIMATION_DURATION = 500;

export function QuickInputConfirmCard({ data, onConfirm, onCancel, addLoading = false }: QuickInputConfirmCardProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const translateY = useSharedValue(-CARD_SLIDE_OFFSET);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    translateY.value = withTiming(0, {
      duration: CARD_ANIMATION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [translateY]);

  const buttonsDisabled = isExiting || addLoading;

  const handleCancel = useCallback(() => {
    if (isExiting || addLoading) return;
    setIsExiting(true);
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
  }, [isExiting, addLoading, onCancel, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
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
    <Animated.View style={[styles.card, { backgroundColor: palette.staticWhite }, animatedStyle]}>
      <Text style={[styles.title, { color: palette.textNeutral }]}>{title}</Text>
      <View style={[styles.divider, { backgroundColor: palette.border }]} />
      <View style={styles.content}>
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
          onPress={onConfirm}
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
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  title: {
    ...typography.headline4.r.bold,
  },
  divider: {
    height: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  content: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 24,
  },
  label: {
    ...typography.body1.l.regular,
    width: 64,
  },
  value: {
    ...typography.body1.l.medium,
    marginLeft: 8,
    flex: 1,
    textAlign: 'left',
  },
  valueNoMarginLeft: {
    marginLeft: 0,
  },
  valueWithIndicator: {
    marginLeft: 8,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentDot: {
    width: 16,
    height: 16,
    borderRadius: 99,
    borderWidth: 1,
  },
  paymentEmoji: typographyLayout.fieldLine,
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  button: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.body1.l.medium,
  },
});
