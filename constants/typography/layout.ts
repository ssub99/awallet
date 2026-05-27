/**
 * UI 맥락별 타이포 프리셋 — fieldInput · singleRow · paragraph.
 * OS lineHeight 숫자는 typography.platform.ts · 분기는 merge.ts.
 * @see ./README.md
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import {
  androidTextMetrics,
  createFieldInputTypographyStyle,
  createTypographyStyle,
  singleRowCenteredTextStyle,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './merge';
import { font_weights } from './typography.base';
import { typography } from './typography-tree';

// --- Input field (48px line, 96px area) ------------------------------------

const fieldLineTextMetrics: Pick<TextStyle, 'includeFontPadding'> = {
  includeFontPadding: false,
};

const fieldLineSingleLineBase = singleRowCenteredTextStyle(typography.body01.regular);
const fieldLineSingleLineBoldBase = singleRowCenteredTextStyle(typography.body01.bold);

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

/** line TextInput — fieldInput 메트릭 + TextInput 레이아웃 (iOS/Android 공통) */
function fieldLineInputTextInputStyle(platformExtras: TextStyle): TextStyle {
  return {
    ...createFieldInputTypographyStyle('line'),
    padding: 0,
    margin: 0,
    flex: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
    ...platformExtras,
  };
}

const inputTypographyLayout = {
  fieldLine: fieldLineRowText,
  fieldLineWrap: fieldLineRowTextWrap,
  fieldLineShortWrap: fieldLineRowTextShortWrap,
  fieldLineShort: {
    ...singleRowCenteredTextStyle(typography.body02.regular),
    ...fieldLineTextMetrics,
  } satisfies TextStyle,
  fieldArea: {
    ...typography.body01.regular,
    ...androidTextMetrics(),
  } satisfies TextStyle,
  fieldLinePlaceholder: fieldLineSingleLine,
  fieldLineInput: Platform.select({
    ios: fieldLineInputTextInputStyle({ alignSelf: 'stretch' }),
    default: fieldLineInputTextInputStyle({
      height: typographyLayoutFieldLineRowHeight,
    }),
  }) as TextStyle,
  fieldLineShortInput: {
    ...singleRowCenteredTextStyle(typography.body02.regular),
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
const rowBody1Medium = singleRowCenteredTextStyle(typography.body01.medium);
const rowBody2Medium = singleRowCenteredTextStyle(typography.body02.medium);
const rowButton2Medium = singleRowCenteredTextStyle(typography.button02.medium);

/**
 * UI 컴포넌트별 singleRow 프리셋 — components/ui/* StyleSheet에서만 참조.
 */
const componentSingleRowLayout = {
  buttonTextLarge: singleRowCenteredTextStyle(typography.button01.medium),
  buttonTextSmall: singleRowCenteredTextStyle(typography.button02.medium),
  chipTextActive: singleRowCenteredTextStyle(typography.body02.bold),
  chipTextDefault: rowBody2Medium,
  tabTextActive: singleRowCenteredTextStyle(typography.body01.bold),
  tabTextInactive: rowBody1Medium,
  radioLabel: rowBody2Medium,
  checkboxLabel: rowBody2Medium,
  segmentLargeRegular: singleRowCenteredTextStyle(typography.body01.regular),
  segmentLargeBold: singleRowCenteredTextStyle(typography.body01.bold),
  segmentSmallRegular: singleRowCenteredTextStyle(typography.body02.regular),
  segmentSmallBold: singleRowCenteredTextStyle(typography.body02.bold),
  tagText: singleRowCenteredTextStyle(typography.detail.bold),
  selectboxDisplayText: singleRowCenteredTextStyle(typography.body01.regular),
  otpDigit: singleRowCenteredTextStyle(typography.headline03.bold),
  accordionTextDisabled: rowButton2Medium,
  accordionTextExpanded: singleRowCenteredTextStyle(typography.button02.regular),
  accordionTextCollapsed: rowButton2Medium,
  quickInputShortLabel: rowBody2Medium,
  monthStatusLabel: singleRowCenteredTextStyle(typography.detail.medium),
  /** app 화면·폼 — body01 medium 단일 행 (tabTextInactive와 동일 메트릭) */
  fieldLineMedium: rowBody1Medium,
} as const satisfies Record<string, TextStyle>;

/** 가로 맞춤 축소 — 소비처에서 scaleTextStyleFontSize만 적용 */
const dynamicShrinkLayout = {
  monthStatusAmount: singleRowCenteredTextStyle(typography.body01.bold),
  calendarAmount: typography.tiny.regular,
} as const satisfies Record<string, TextStyle>;

/**
 * Android 스피너 휠 — paragraph body01 유지 (singleRow 전환 시 lh 변경).
 */
const paragraphWheelLayout = {
  spinnerWheelItemRegular: typography.body01.regular,
  spinnerWheelItemBold: typography.body01.bold,
  pickerWheelItemIos: createTypographyStyle('pickerWheel', font_weights.regular),
} as const satisfies Record<string, TextStyle>;

const sharedTypographyLayout = {
  ...componentSingleRowLayout,
  ...dynamicShrinkLayout,
  ...paragraphWheelLayout,
  pickerNavRegular: singleRowCenteredTextStyle(typography.pickerNav.regular),
  pickerNavMedium: singleRowCenteredTextStyle(typography.pickerNav.medium),
  pickerNavBold: singleRowCenteredTextStyle(typography.pickerNav.bold),
  infoCardTitle: typography.headline04.bold,
  infoCardMeta: typography.body02.regular,
  sectionTitle: fieldLineSingleLineBold,
  categoryEmojiMedium: typography.categoryEmojiM.regular,
  categoryEmojiLarge: typography.categoryEmojiL.regular,
} as const satisfies Record<string, TextStyle>;

export const typographyLayout = {
  ...inputTypographyLayout,
  ...sharedTypographyLayout,
} as const;
