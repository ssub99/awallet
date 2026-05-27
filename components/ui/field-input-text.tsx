import { AppText, type FieldInputVariant } from '@/components/ui/app-text';
import { typographyLayout } from '@/constants/typography';
import { View, type TextProps, type ViewProps, type ViewStyle } from 'react-native';

type FieldInputTextProps = TextProps & {
  variant?: FieldInputVariant;
};

/**
 * Input 맥락 텍스트 프리미티브.
 * 화면에서는 variant만 선택하고 fieldInput 토큰은 AppText 내부에서 매핑한다.
 */
export function FieldInputText({ variant = 'line', ...rest }: FieldInputTextProps) {
  return <AppText context="fieldInput" variant={variant} {...rest} />;
}

type FieldInputLineWrapProps = ViewProps;

/**
 * Input line 높이(48) 내 텍스트 정렬용 래퍼.
 */
export function FieldInputLineWrap({ style, ...rest }: FieldInputLineWrapProps) {
  return <View style={[typographyLayout.fieldInputLineWrap as ViewStyle, style]} {...rest} />;
}
