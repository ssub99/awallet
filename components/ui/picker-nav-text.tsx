import { typographyLayout } from '@/constants/typography';
import { Text, type TextProps, type TextStyle } from 'react-native';

type PickerNavTextVariant = 'regular' | 'medium' | 'bold';

const PICKER_NAV_VARIANTS: Record<PickerNavTextVariant, TextStyle> = {
  regular: typographyLayout.pickerNavRegular,
  medium: typographyLayout.pickerNavMedium,
  bold: typographyLayout.pickerNavBold,
};

type PickerNavTextProps = TextProps & {
  variant?: PickerNavTextVariant;
};

export function PickerNavText({ variant = 'regular', style, ...rest }: PickerNavTextProps) {
  return <Text style={[PICKER_NAV_VARIANTS[variant], style]} {...rest} />;
}
