import { AppText, type CardVariant } from '@/components/ui/app-text';
import { type TextProps } from 'react-native';

type CardTextProps = TextProps & {
  variant?: CardVariant;
};

/** AppText thin wrapper — card context */
export function CardText({ variant = 'meta', ...rest }: CardTextProps) {
  return <AppText context="card" variant={variant} {...rest} />;
}
