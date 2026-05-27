import { AppText, type PickerNavVariant } from '@/components/ui/app-text';
import { type TextProps } from 'react-native';

type PickerNavTextProps = TextProps & {
  variant?: PickerNavVariant;
};

/** AppText thin wrapper — pickerNav context */
export function PickerNavText({ variant = 'regular', ...rest }: PickerNavTextProps) {
  return <AppText context="pickerNav" variant={variant} {...rest} />;
}
