/**
 * Quick Input Field Component
 * 
 * 간편입력 인풋 필드 컴포넌트
 * 피그마 디자인에 맞춘 간편입력 UI
 */

import { Icon } from '@/components/ui/icon';
import { Colors, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { logEvent } from '@/utils/analytics';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import { QuickInputStar } from '@/components/ui/quick-input-star';

export interface QuickInputFieldProps extends Omit<TextInputProps, 'style'> {
  /**
   * 입력값
   */
  value?: string;
  
  /**
   * 값 변경 핸들러
   */
  onChangeText?: (text: string) => void;
  
  /**
   * 전송 버튼 클릭 핸들러
   */
  onSend?: () => void;
  
  /**
   * 취소 버튼 클릭 핸들러
   */
  onCancel?: () => void;
  
  /**
   * 플레이스홀더 텍스트
   */
  placeholder?: string;

  /**
   * 별 아이콘 스케일 애니메이션 값 (선택)
   * - 제공 시 short/long 모두 동일 애니메이션 공유
   */
  starScale?: Animated.Value;

  /**
   * 별 아이콘 회전 애니메이션 값 (선택)
   */
  starRotate?: Animated.Value;

  /**
   * 전송 중 로딩 여부. true일 때 보내기 버튼에 로딩 인디케이터 표시
   */
  sendLoading?: boolean;

  /**
   * 보내기 버튼 비활성화 여부. true면 확인 카드 등으로 기록 생성 후 추가 전송 방지
   */
  sendDisabled?: boolean;
}

/**
 * Quick Input Field Component
 */
export const QuickInputField = forwardRef<TextInput, QuickInputFieldProps>(
  function QuickInputField(
    {
      value = '',
      onChangeText,
      onSend,
      onCancel,
      placeholder = '메세지 입력',
      starScale,
      starRotate,
      sendLoading = false,
      sendDisabled = false,
      ...textInputProps
    },
    ref
  ) {
    const colorScheme = useColorScheme();
    const colors = Colors[colorScheme ?? 'light'] as typeof Colors.light;

    const inputRef = useRef<TextInput>(null);
    
    // 외부 ref를 내부 inputRef에 연결
    useImperativeHandle(ref, () => inputRef.current as TextInput);
    
    const hasValue = value && value.length > 0;
    
    return (
      <View style={styles.container}>
        {/* Input Field */}
        <View style={[styles.inputField, { backgroundColor: colors.staticWhite }]}>
          {/* 왼쪽: 아이콘 + 텍스트 */}
          <View style={styles.leftContent}>
            {/* Star 아이콘 배경 (그라데이션 원) - 롱버전 기준 20x20 */}
            <QuickInputStar size={20} starScale={starScale} starRotate={starRotate} />
            
            {/* TextInput + 커스텀 플레이스홀더 (입력 텍스트와 동일한 스타일/위치로 싱크) */}
            <View style={styles.inputWrap}>
              <TextInput
                ref={inputRef}
                style={[styles.input, { color: colors.text }]}
                value={value}
                onChangeText={onChangeText}
                placeholder=""
                placeholderTextColor={colors.textAssistive}
                keyboardType="default"
                returnKeyType="send"
                // 쿼티 키패드 전송 버튼도 컴포넌트 내 보내기 버튼과 동일하게 처리
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  onSend?.();
                }}
                textAlignVertical="center"
                {...textInputProps}
              />
              {!hasValue && (
                <View style={styles.placeholderWrap} pointerEvents="none">
                  <Text
                    style={[styles.placeholder, { color: colors.textAssistive }]}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                  >
                    {placeholder}
                  </Text>
                </View>
              )}
            </View>
          </View>
          
          {/* 오른쪽: Cancel 버튼 */}
          {hasValue && (
            <Pressable
              style={styles.cancelButton}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="취소"
            >
              <View style={[styles.cancelIconBg, { backgroundColor: colors.fillStrong }]}>
                <Icon name="cancel" variant="solid" size={24} />
              </View>
            </Pressable>
          )}
        </View>
        
        {/* Send Button - 입력 여부/로딩/확인 카드 표시 시 disabled */}
        <View style={[styles.sendButtonWrapper, { backgroundColor: colors.staticWhite }]}>
          <View
            style={[
              styles.sendButton,
              {
                backgroundColor: hasValue && !sendDisabled ? colors.primary : colors.fillDisabled,
              },
            ]}
          >
            <Pressable
              style={styles.sendButtonContent}
              onPress={() => {
                if (!hasValue || sendLoading || sendDisabled) return;
                void logEvent('btn', {
                  screen_name: '/home',
                  target: 'sentence',
                });
                onSend?.();
              }}
              disabled={!hasValue || sendLoading || sendDisabled}
              accessibilityRole="button"
              accessibilityLabel={sendLoading ? '전송 중' : '전송'}
              accessibilityState={{ disabled: !hasValue || sendLoading || sendDisabled }}
            >
              {sendLoading ? (
                <ActivityIndicator
                  size={Platform.OS === 'android' ? 20 : 'small'}
                  color={colors.staticWhite}
                />
              ) : (
                <Icon
                  name="send"
                  variant="line"
                  size={24}
                  color={hasValue && !sendDisabled ? colors.staticWhite : colors.textDisabled}
                />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputField: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  leftContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    minHeight: 28,
  },
  placeholderWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  placeholder: {
    ...Typography.body1.l.regular,
  },
  input: {
    flex: 1,
    ...Typography.body1.l.regular,
    // TextInput에서 커서/텍스트 라인 박스가 하단으로 밀리는 문제 방지용
    // (otp-inputs와 동일 패턴: lineHeight를 0으로 덮어써서 캐럿이 중앙에 오도록 맞춤)
    lineHeight: 0,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  cancelButton: {
    width: 24,
    height: 24,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelIconBg: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sendButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
