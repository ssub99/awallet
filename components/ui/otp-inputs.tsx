import { Colors } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface OtpInputsProps {
  length?: 6 | 4;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  /** 접근성 레이블 */
  accessibilityLabel?: string;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'maxLength' | 'keyboardType'>;
}

export function OtpInputs({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
  accessibilityLabel = '인증코드 입력',
  inputProps,
}: OtpInputsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

  const refs = useRef<Array<TextInput | null>>(Array.from({ length }, () => null));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const safeValue = useMemo(() => value.replace(/\D/g, '').slice(0, length), [value, length]);

  const setDigit = useCallback(
    (index: number, char: string) => {
      const next = safeValue.split('');
      next[index] = char;
      const joined = next.join('').replace(/\D/g, '').slice(0, length);
      onChange(joined);
      if (char && index < length - 1) {
        refs.current[index + 1]?.focus();
      }
      if (joined.length === length) {
        onComplete?.(joined);
      }
    },
    [length, onChange, onComplete, safeValue]
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      if (key === 'Backspace') {
        const char = safeValue[index] ?? '';
        if (!char && index > 0) {
          // 현재 칸이 비어있으면 이전 칸으로 이동
          refs.current[index - 1]?.focus();
        }
      }
    },
    [safeValue]
  );

  return (
    <View accessibilityLabel={accessibilityLabel} accessible>
      <View style={styles.row}>
        {Array.from({ length }).map((_, i) => {
          const char = safeValue[i] ?? '';
          const active = i === safeValue.length && safeValue.length < length;
          return (
            <Pressable
              key={i}
              onPress={() => refs.current[i]?.focus()}
              style={[
                styles.cellBox,
                { borderColor: colors.border, backgroundColor: colors.staticWhite },
                active && { borderColor: colors.borderStrong },
                focusedIndex === i && { borderColor: colors.primary },
                error && { borderColor: colors.statusNegative },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}번째 숫자 입력칸`}
            >
              <TextInput
                ref={(el) => (refs.current[i] = el)}
                value={char}
                onChangeText={(t) => {
                  const onlyDigit = t.replace(/\D/g, '').slice(0, 1);
                  setDigit(i, onlyDigit);
                }}
                onKeyPress={(e) => handleKeyPress(i, e.nativeEvent.key)}
                onFocus={() => setFocusedIndex(i)}
                onBlur={() => setFocusedIndex((prev) => (prev === i ? null : prev))}
                keyboardType="number-pad"
                maxLength={1}
                style={styles.input}
                textAlign="center"
                {...inputProps}
                // 접근성
                accessibilityLabel={`${i + 1}번째 숫자`}
                accessibilityHint="숫자를 입력하세요"
                blurOnSubmit={false}
              />
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text style={[styles.errorText, { color: colors.statusNegative }]}>인증코드가 올바르지 않습니다.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  cellBox: {
    width: 44,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    // Text-only style; container handles centering
    minWidth: 0,
    paddingTop: 0,
    paddingBottom: 0,
    ...Typography.headline3.m.bold,
    // 라인박스가 하단으로 밀리는 문제를 방지하기 위해 0으로 덮어쓰기
    lineHeight: 0,
    textAlignVertical: 'center', // Android
  },
  errorText: {
    marginTop: 8,
    ...Typography.body2.r.regular,
    textAlign: 'center',
  },
});

export default OtpInputs;


