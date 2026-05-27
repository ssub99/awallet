import { colors, type ColorPalette } from '@/constants/theme';
import { typography, typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

interface OtpInputsProps {
  length?: 6 | 4;
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  error?: boolean;
  /** 보더만 붉게 표시할지 여부 (에러 캡션과 분리 제어) */
  errorBorder?: boolean;
  /** 접근성 레이블 */
  accessibilityLabel?: string;
  /** 에러 캡션 커스텀 메시지 */
  errorMessage?: string;
  inputProps?: Omit<TextInputProps, 'value' | 'onChangeText' | 'maxLength' | 'keyboardType'>;
}

export function OtpInputs({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
  errorBorder = false,
  accessibilityLabel = '인증코드 입력',
  errorMessage = '인증번호가 일치하지 않습니다.',
  inputProps,
}: OtpInputsProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;

  const refs = useRef<(TextInput | null)[]>(Array.from({ length }, () => null));
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
          
          // 첫 번째 박스(i=0)를 삭제하고 두 번째 박스(i=1)와 동일하게 재생성
          if (i === 0) {
            return (
              <Pressable
                key={i}
                onPress={() => refs.current[i]?.focus()}
                style={[
                  styles.cellBox,
                  { borderColor: palette.border, backgroundColor: palette.staticWhite },
                  focusedIndex === i && { borderColor: palette.primary },
                  errorBorder && { borderColor: palette.statusNegative },
                ]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`${i + 1}번째 숫자 입력칸`}
              >
                <TextInput
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
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
          }
          
          return (
            <Pressable
              key={i}
              onPress={() => refs.current[i]?.focus()}
              style={[
                styles.cellBox,
                { borderColor: palette.border, backgroundColor: palette.staticWhite },
                focusedIndex === i && { borderColor: palette.primary },
                errorBorder && { borderColor: palette.statusNegative },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`${i + 1}번째 숫자 입력칸`}
            >
              <TextInput
                ref={(el) => {
                  refs.current[i] = el;
                }}
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
        <Text style={[styles.errorText, { color: palette.statusNegative }]}>{errorMessage}</Text>
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
    ...typographyLayout.uiLineHeadline03Bold,
    textAlignVertical: 'center',
  },
  errorText: {
    marginTop: 24,
    ...typography.body02.regular,
    textAlign: 'center',
  },
});

export default OtpInputs;


