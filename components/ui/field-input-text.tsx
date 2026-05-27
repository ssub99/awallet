import { typographyLayout } from '@/constants/typography';
import { Text, View, type TextProps, type TextStyle, type ViewProps, type ViewStyle } from 'react-native';

type FieldInputTextVariant = 'line' | 'placeholder' | 'number';

const FIELD_INPUT_TEXT_VARIANTS: Record<FieldInputTextVariant, TextStyle> = {
  line: typographyLayout.fieldInputLine,
  placeholder: typographyLayout.fieldInputPlaceholder,
  number: typographyLayout.fieldInputNumber,
};

type FieldInputTextProps = TextProps & {
  variant?: FieldInputTextVariant;
};

/**
 * Input 맥락 텍스트 프리미티브.
 * 화면에서는 variant만 선택하고 fieldInput 토큰은 내부에서 매핑한다.
 */
export function FieldInputText({ variant = 'line', style, ...rest }: FieldInputTextProps) {
  return <Text style={[FIELD_INPUT_TEXT_VARIANTS[variant], style]} {...rest} />;
}

type FieldInputLineWrapProps = ViewProps;

/**
 * Input line 높이(48) 내 텍스트 정렬용 래퍼.
 */
export function FieldInputLineWrap({ style, ...rest }: FieldInputLineWrapProps) {
  return <View style={[typographyLayout.fieldInputLineWrap as ViewStyle, style]} {...rest} />;
}
