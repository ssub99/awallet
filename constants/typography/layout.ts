/**
 * UI 맥락별 타이포 프리셋 — fieldInput · uiLine · paragraph.
 * OS lineHeight 숫자는 typography.platform.ts · 분기는 merge.ts.
 * @see ./README.md
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import {
  androidTextMetrics,
  createFieldInputTypographyStyle,
  createTypographyStyle,
  uiLineTextStyle,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './merge';
import { font_weights } from './typography.base';
import { typography } from './typography-tree';

// --- uiLine (고정 높이 한 줄 Text) -----------------------------------------

const fieldInputTextMetrics: Pick<TextStyle, 'includeFontPadding'> = {
  includeFontPadding: false,
};

const uiLineBody01Regular: TextStyle = {
  ...uiLineTextStyle(typography.body01.regular),
  ...fieldInputTextMetrics,
};

const uiLineBody01Bold: TextStyle = {
  ...uiLineTextStyle(typography.body01.bold),
  ...fieldInputTextMetrics,
};

const uiLineBody01Medium = uiLineTextStyle(typography.body01.medium);
const uiLineBody02Regular = uiLineTextStyle(typography.body02.regular);
const uiLineBody02Medium = uiLineTextStyle(typography.body02.medium);
const uiLineBody02Bold = uiLineTextStyle(typography.body02.bold);
const uiLineButton01Medium = uiLineTextStyle(typography.button01.medium);
const uiLineButton02Medium = uiLineTextStyle(typography.button02.medium);
const uiLineButton02Regular = uiLineTextStyle(typography.button02.regular);
const uiLineDetailBold = uiLineTextStyle(typography.detail.bold);
const uiLineDetailMedium = uiLineTextStyle(typography.detail.medium);
const uiLineHeadline03Bold = uiLineTextStyle(typography.headline03.bold);

// --- fieldInput (TextInput · 필드 wrap) ------------------------------------

const fieldInputLineWrap: ViewStyle = {
  height: typographyLayoutFieldLineRowHeight,
  justifyContent: 'center',
};

const fieldInputShortLineWrap: ViewStyle = {
  height: typographyLayoutFieldLineShortMinHeight,
  justifyContent: 'center',
};

const fieldInputShortLine: TextStyle = {
  ...uiLineBody02Regular,
  ...fieldInputTextMetrics,
};

/** line TextInput — fieldInput 메트릭 + TextInput 레이아웃 (iOS/Android 공통) */
function fieldInputLineTextInputStyle(platformExtras: TextStyle): TextStyle {
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

const fieldInputTypographyLayout = {
  fieldInputLineWrap,
  fieldInputShortLineWrap,
  fieldInputShortLine,
  fieldInputAreaDisplay: {
    // 의도적으로 paragraph 메트릭 사용 (fieldInput area 설명 텍스트 용도)
    ...typography.body01.regular,
    ...androidTextMetrics(),
  } satisfies TextStyle,
  fieldInputPlaceholder: uiLineBody01Regular,
  fieldInputLine: Platform.select({
    ios: fieldInputLineTextInputStyle({ alignSelf: 'stretch' }),
    default: fieldInputLineTextInputStyle({
      height: typographyLayoutFieldLineRowHeight,
    }),
  }) as TextStyle,
  fieldInputShortLineInput: {
    ...uiLineBody02Regular,
    flex: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center' as const,
    height: typographyLayoutFieldLineShortMinHeight,
    includeFontPadding: false,
  } satisfies TextStyle,
  fieldInputArea: {
    ...createFieldInputTypographyStyle('area'),
    flex: 1,
    padding: 0,
    margin: 0,
    height: typographyLayoutFieldAreaInputHeight,
    textAlignVertical: 'top' as const,
    paddingTop: 0,
  } satisfies TextStyle,
  fieldInputNumber: {
    ...uiLineBody01Bold,
    textAlign: 'right' as const,
  } satisfies TextStyle,
} as const;

// --- uiLine presets (토큰 기준 canonical 키만 export) -----------------------

const uiLineTypographyLayout = {
  uiLineBody01Regular,
  uiLineBody01Bold,
  uiLineBody01Medium,
  uiLineBody02Regular,
  uiLineBody02Medium,
  uiLineBody02Bold,
  uiLineButton01Medium,
  uiLineButton02Medium,
  uiLineButton02Regular,
  uiLineDetailBold,
  uiLineDetailMedium,
  uiLineHeadline03Bold,
} as const satisfies Record<string, TextStyle>;

/** 가로 맞춤 축소 — 소비처에서 scaleTextStyleFontSize만 적용 */
const dynamicShrinkLayout = {
  monthStatusAmount: uiLineBody01Bold,
  calendarAmount: typography.tiny.regular,
} as const satisfies Record<string, TextStyle>;

/** Android 스피너 휠 — paragraph body01 유지 (uiLine 전환 시 lh 변경). */
const paragraphWheelLayout = {
  // Android spinner wheel은 paragraph body01을 유지한다 (uiLine 전환 시 lh가 달라짐).
  spinnerWheelRegular: typography.body01.regular,
  spinnerWheelBold: typography.body01.bold,
  pickerWheelIos: createTypographyStyle('pickerWheel', font_weights.regular),
} as const satisfies Record<string, TextStyle>;

const sharedTypographyLayout = {
  ...uiLineTypographyLayout,
  ...dynamicShrinkLayout,
  ...paragraphWheelLayout,
  pickerNavRegular: uiLineTextStyle(typography.pickerNav.regular),
  pickerNavMedium: uiLineTextStyle(typography.pickerNav.medium),
  pickerNavBold: uiLineTextStyle(typography.pickerNav.bold),
  // 카드 텍스트는 paragraph 메트릭을 의도적으로 유지한다.
  cardTitle: typography.headline04.bold,
  cardMeta: typography.body02.regular,
  // 이모지 텍스트도 paragraph 메트릭을 직접 사용한다.
  categoryEmojiMedium: typography.categoryEmojiM.regular,
  categoryEmojiLarge: typography.categoryEmojiL.regular,
} as const satisfies Record<string, TextStyle>;

export const typographyLayout = {
  ...fieldInputTypographyLayout,
  ...sharedTypographyLayout,
} as const;
