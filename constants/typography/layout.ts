import type { TextStyle } from 'react-native';

import { singleRowCenteredTextStyle } from './merge';
import { inputSectionTitleText, inputTypographyLayout } from './layout-input';
import { typography } from './typography-tree';

/** 동일 singleRow 메트릭 — 컴포넌트별 키는 의미 유지, 값은 alias */
const rowBody1Medium = singleRowCenteredTextStyle(typography.body1.l.medium);
const rowBody2Medium = singleRowCenteredTextStyle(typography.body2.r.medium);
const rowButton2Medium = singleRowCenteredTextStyle(typography.button2.r.medium);

/**
 * UI 컴포넌트별 singleRow 프리셋 — components/ui/* StyleSheet에서만 참조.
 * (scale 이름 rowBody1 대신 실제 컴포넌트·용도 기준)
 */
const componentSingleRowLayout = {
  buttonTextLarge: singleRowCenteredTextStyle(typography.button1.l.medium),
  buttonTextSmall: singleRowCenteredTextStyle(typography.button2.r.medium),
  chipTextActive: singleRowCenteredTextStyle(typography.body2.r.bold),
  chipTextDefault: rowBody2Medium,
  tabTextActive: singleRowCenteredTextStyle(typography.body1.l.bold),
  tabTextInactive: rowBody1Medium,
  radioLabel: rowBody2Medium,
  checkboxLabel: rowBody2Medium,
  segmentLargeRegular: singleRowCenteredTextStyle(typography.body1.l.regular),
  segmentLargeBold: singleRowCenteredTextStyle(typography.body1.l.bold),
  segmentSmallRegular: singleRowCenteredTextStyle(typography.body2.r.regular),
  segmentSmallBold: singleRowCenteredTextStyle(typography.body2.r.bold),
  tagText: singleRowCenteredTextStyle(typography.detail.r.bold),
  selectboxDisplayText: singleRowCenteredTextStyle(typography.body1.l.regular),
  otpDigit: singleRowCenteredTextStyle(typography.headline3.m.bold),
  accordionTextDisabled: rowButton2Medium,
  accordionTextExpanded: singleRowCenteredTextStyle(typography.button2.r.regular),
  accordionTextCollapsed: rowButton2Medium,
  quickInputShortLabel: rowBody2Medium,
  monthStatusLabel: singleRowCenteredTextStyle(typography.detail.r.medium),
  /** app 화면·폼 — body01 medium 단일 행 (tabTextInactive와 동일 메트릭) */
  fieldLineMedium: rowBody1Medium,
} as const satisfies Record<string, TextStyle>;

/**
 * Android 스피너 휠(48px) — paragraph body01 유지.
 * singleRowCenteredTextStyle 적용 시 Android lineHeight가 바뀌므로 분리.
 */
const paragraphWheelLayout = {
  spinnerWheelItemRegular: typography.body1.l.regular,
  spinnerWheelItemBold: typography.body1.l.bold,
} as const satisfies Record<string, TextStyle>;

const sharedTypographyLayout = {
  ...componentSingleRowLayout,
  ...paragraphWheelLayout,
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
 * UI 맥락별 타이포 프리셋 (OS 분기는 merge · layout-input에서만).
 */
export const typographyLayout = {
  ...inputTypographyLayout,
  ...sharedTypographyLayout,
} as const;
