import { Platform, type TextStyle } from 'react-native';

import { pretendardTextStyle, type PretendardWeight } from '@/constants/fonts';

import type { TypographyScaleKey } from './typography.base';
import { androidTextMetrics, typographyScale } from './merge';

export function createTypographyStyle(scale: TypographyScaleKey, weight: PretendardWeight): TextStyle {
  const sizes =
    Platform.OS === 'android' ? typographyScale[scale].android : typographyScale[scale].ios;
  return {
    ...pretendardTextStyle(weight),
    fontSize: sizes.fontSize,
    lineHeight: sizes.lineHeight,
    ...androidTextMetrics(),
  };
}
