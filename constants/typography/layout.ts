import type { TextStyle } from 'react-native';

import { inputSectionTitleText, inputTypographyLayout } from './layout-input';

import { singleRowCenteredTextStyle } from './variants';
import { typography } from './typography-tree';

const sharedTypographyLayout = {
  pickerNavRegular: singleRowCenteredTextStyle(typography.pickerNav.nav.regular),
  pickerNavMedium: singleRowCenteredTextStyle(typography.pickerNav.nav.medium),
  pickerNavBold: singleRowCenteredTextStyle(typography.pickerNav.nav.bold),
  infoCardTitle: typography.headline4.r.bold,
  infoCardMeta: typography.body2.r.regular,
  sectionTitle: inputSectionTitleText,
  categoryEmojiMedium: typography.categoryEmoji.m.regular,
  categoryEmojiLarge: typography.categoryEmoji.l.regular,
} as const satisfies Record<string, TextStyle>;

/**
 * UI 맥락별 타이포 프리셋 (OS 분기는 createTypographyStyle·variants·layout-input에서만).
 */
export const typographyLayout = {
  ...inputTypographyLayout,
  ...sharedTypographyLayout,
} as const;
