import { typographyLayout } from '@/constants/typography';
import { Text, type TextProps } from 'react-native';

type SectionTitleProps = TextProps;

/**
 * 고정 높이 섹션 제목 텍스트.
 * 화면에서는 role(SectionTitle)만 사용하고 uiLine 선택은 내부에 캡슐화한다.
 */
export function SectionTitle({ style, ...rest }: SectionTitleProps) {
  return <Text style={[typographyLayout.uiLineBody01Bold, style]} {...rest} />;
}

