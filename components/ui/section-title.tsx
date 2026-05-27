import { AppText } from '@/components/ui/app-text';
import { type TextProps } from 'react-native';

type SectionTitleProps = TextProps;

/**
 * 고정 높이 섹션 제목 텍스트.
 * 화면에서는 role(SectionTitle)만 사용하고 uiLine 선택은 AppText 내부에 캡슐화한다.
 */
export function SectionTitle({ style, ...rest }: SectionTitleProps) {
  return <AppText context="uiLine" variant="body01Bold" style={style} {...rest} />;
}
