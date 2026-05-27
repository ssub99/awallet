import { typographyLayout } from '@/constants/typography';
import { Text, type TextProps, type TextStyle } from 'react-native';

type UiLineTextVariant =
  | 'body01Regular'
  | 'body01Medium'
  | 'body01Bold'
  | 'body02Regular'
  | 'body02Medium'
  | 'body02Bold'
  | 'button01Medium'
  | 'button02Regular'
  | 'button02Medium'
  | 'detailBold'
  | 'detailMedium'
  | 'headline03Bold';

const UI_LINE_VARIANTS: Record<UiLineTextVariant, TextStyle> = {
  body01Regular: typographyLayout.uiLineBody01Regular,
  body01Medium: typographyLayout.uiLineBody01Medium,
  body01Bold: typographyLayout.uiLineBody01Bold,
  body02Regular: typographyLayout.uiLineBody02Regular,
  body02Medium: typographyLayout.uiLineBody02Medium,
  body02Bold: typographyLayout.uiLineBody02Bold,
  button01Medium: typographyLayout.uiLineButton01Medium,
  button02Regular: typographyLayout.uiLineButton02Regular,
  button02Medium: typographyLayout.uiLineButton02Medium,
  detailBold: typographyLayout.uiLineDetailBold,
  detailMedium: typographyLayout.uiLineDetailMedium,
  headline03Bold: typographyLayout.uiLineHeadline03Bold,
};

type UiLineTextProps = TextProps & {
  variant?: UiLineTextVariant;
};

/**
 * 고정 높이 한 줄 UI 텍스트 프리미티브.
 * 화면에서는 variant만 선택하고 uiLine 토큰은 내부에서 매핑한다.
 */
export function UiLineText({ variant = 'body01Regular', style, ...rest }: UiLineTextProps) {
  return <Text style={[UI_LINE_VARIANTS[variant], style]} {...rest} />;
}

