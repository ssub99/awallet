import { AppText, type UiLineVariant } from '@/components/ui/app-text';
import { type TextProps } from 'react-native';

type UiLineTextProps = TextProps & {
  variant?: UiLineVariant;
};

/**
 * 고정 높이 한 줄 UI 텍스트 프리미티브.
 * 화면에서는 variant만 선택하고 uiLine 토큰은 AppText 내부에서 매핑한다.
 */
export function UiLineText({ variant = 'body01Regular', ...rest }: UiLineTextProps) {
  return <AppText context="uiLine" variant={variant} {...rest} />;
}
