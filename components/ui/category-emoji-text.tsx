import { AppText, type CategoryEmojiVariant } from '@/components/ui/app-text';
import { type TextProps } from 'react-native';

type CategoryEmojiTextProps = TextProps & {
  variant?: CategoryEmojiVariant;
};

/** AppText thin wrapper — categoryEmoji context (카테고리 이모지 피커·미리보기) */
export function CategoryEmojiText({ variant = 'medium', ...rest }: CategoryEmojiTextProps) {
  return <AppText context="categoryEmoji" variant={variant} {...rest} />;
}
