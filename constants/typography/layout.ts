/**
 * UI 맥락별 타이포 프리셋 — Input(fieldInput) · singleRow · paragraph.
 * OS 분기는 merge.ts 및 본 파일 Input 블록에서만.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import {
  androidTextMetrics,
  createFieldInputTypographyStyle,
  createTypographyStyle,
  getFieldInputLineHeight,
  singleRowCenteredTextStyle,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './merge';
import { typography } from './typography-tree';

// --- Input field (48px line, 96px area) ------------------------------------

const fieldLineTextMetrics: Pick<TextStyle, 'includeFontPadding'> = {
  includeFontPadding: false,
};

const fieldLineSingleLineBase = singleRowCenteredTextStyle(typography.body1.l.regular);
const fieldLineSingleLineBoldBase = singleRowCenteredTextStyle(typography.body1.l.bold);

/**
 * iOS line TextInput
 * - fieldLineWrap 24px: Figma 콘텐츠 행(레이아웃 박스), flex로 자식 세로 중앙
 * - lineHeight 20: UITextField 글리프 메트릭(lh 24와 동일하면 행이 꽉 차 하단 쏠림)
 */
const fieldLineSingleLine: TextStyle = {
  ...fieldLineSingleLineBase,
  ...fieldLineTextMetrics,
};

const fieldLineSingleLineBold: TextStyle = {
  ...fieldLineSingleLineBoldBase,
  ...fieldLineTextMetrics,
};

const fieldLineRowText: TextStyle = fieldLineSingleLine;

const fieldLineRowTextWrap: ViewStyle = {
  height: typographyLayoutFieldLineRowHeight,
  justifyContent: 'center',
};

const fieldLineRowTextShortWrap: ViewStyle = {
  height: typographyLayoutFieldLineShortMinHeight,
  justifyContent: 'center',
};

const inputTypographyLayout = {
  fieldLine: fieldLineRowText,
  fieldLineWrap: fieldLineRowTextWrap,
  fieldLineShortWrap: fieldLineRowTextShortWrap,
  fieldLineShort: {
    ...singleRowCenteredTextStyle(typography.body2.r.regular),
    ...fieldLineTextMetrics,
  } satisfies TextStyle,
  fieldArea: {
    ...typography.body1.l.regular,
    ...androidTextMetrics(),
  } satisfies TextStyle,
  fieldLinePlaceholder: fieldLineSingleLine,
  fieldLineInput: Platform.select({
    ios: {
      ...createFieldInputTypographyStyle('line'),
      padding: 0,
      margin: 0,
      flex: 1,
      alignSelf: 'stretch',
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    default: {
      ...fieldLineSingleLine,
      flex: 1,
      padding: 0,
      margin: 0,
      textAlignVertical: 'center' as const,
      height: typographyLayoutFieldLineRowHeight,
      includeFontPadding: false,
    },
  }) as TextStyle,
  fieldLineShortInput: {
    ...singleRowCenteredTextStyle(typography.body2.r.regular),
    flex: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center' as const,
    height: typographyLayoutFieldLineShortMinHeight,
    includeFontPadding: false,
  } satisfies TextStyle,
  fieldAreaInput: {
    ...createFieldInputTypographyStyle('area'),
    flex: 1,
    padding: 0,
    margin: 0,
    height: typographyLayoutFieldAreaInputHeight,
    textAlignVertical: 'top' as const,
    paddingTop: 0,
  } satisfies TextStyle,
  fieldNumber: {
    ...fieldLineSingleLineBold,
    textAlign: 'right' as const,
  } satisfies TextStyle,
} as const;

// --- Component singleRow · paragraph presets --------------------------------

/** 동일 singleRow 메트릭 — 컴포넌트별 키는 의미 유지, 값은 alias */
const rowBody1Medium = singleRowCenteredTextStyle(typography.body1.l.medium);
const rowBody2Medium = singleRowCenteredTextStyle(typography.body2.r.medium);
const rowButton2Medium = singleRowCenteredTextStyle(typography.button2.r.medium);

/**
 * UI 컴포넌트별 singleRow 프리셋 — components/ui/* StyleSheet에서만 참조.
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

/** 가로 맞춤 축소 — 소비처에서 scaleTextStyleFontSize만 적용 */
const dynamicShrinkLayout = {
  monthStatusAmount: singleRowCenteredTextStyle(typography.body1.l.bold),
  calendarAmount: typography.tiny.r.regular,
} as const satisfies Record<string, TextStyle>;

/**
 * Android 스피너 휠 — paragraph body01 유지 (singleRow 전환 시 lh 변경).
 */
const paragraphWheelLayout = {
  spinnerWheelItemRegular: typography.body1.l.regular,
  spinnerWheelItemBold: typography.body1.l.bold,
  pickerWheelItemIos: createTypographyStyle('pickerWheel', '400'),
} as const satisfies Record<string, TextStyle>;

const sharedTypographyLayout = {
  ...componentSingleRowLayout,
  ...dynamicShrinkLayout,
  ...paragraphWheelLayout,
  pickerNavRegular: singleRowCenteredTextStyle(typography.pickerNav.nav.regular),
  pickerNavMedium: singleRowCenteredTextStyle(typography.pickerNav.nav.medium),
  pickerNavBold: singleRowCenteredTextStyle(typography.pickerNav.nav.bold),
  infoCardTitle: typography.headline4.r.bold,
  infoCardMeta: typography.body2.r.regular,
  sectionTitle: fieldLineSingleLineBold,
  categoryEmojiMedium: typography.categoryEmoji.m.regular,
  categoryEmojiLarge: typography.categoryEmoji.l.regular,
} as const satisfies Record<string, TextStyle>;

export const typographyLayout = {
  ...inputTypographyLayout,
  ...sharedTypographyLayout,
} as const;
