import { typographyLayout } from '@/constants/typography';
import { Text, type TextProps, type TextStyle } from 'react-native';

type CardTextVariant = 'title' | 'meta';

const CARD_TEXT_VARIANTS: Record<CardTextVariant, TextStyle> = {
  title: typographyLayout.cardTitle,
  meta: typographyLayout.cardMeta,
};

type CardTextProps = TextProps & {
  variant?: CardTextVariant;
};

export function CardText({ variant = 'meta', style, ...rest }: CardTextProps) {
  return <Text style={[CARD_TEXT_VARIANTS[variant], style]} {...rest} />;
}
