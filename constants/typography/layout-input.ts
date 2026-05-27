/**
 * Input field typography & layout presets (48px line, 96px area).
 * Composes tokens from merge · typography-tree.
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { pretendardTextStyle } from '@/constants/fonts';

import {
  androidTextMetrics,
  getFieldInputLineHeight,
  getPlatformTypographySizes,
  singleRowCenteredTextStyle,
  typographyLayoutFieldAreaInputHeight,
  typographyLayoutFieldLineRowHeight,
  typographyLayoutFieldLineShortMinHeight,
} from './merge';
import { typography } from './typography-tree';

const body01FontSize = getPlatformTypographySizes('body01').fontSize;

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
const iosFieldLineInputStyle: TextStyle = {
  ...pretendardTextStyle('400'),
  fontSize: body01FontSize,
  lineHeight: getFieldInputLineHeight('line'),
  padding: 0,
  margin: 0,
  flex: 1,
  alignSelf: 'stretch',
  includeFontPadding: false,
  textAlignVertical: 'center',
};

const fieldLineSingleLine: TextStyle = {
  ...fieldLineSingleLineBase,
  ...fieldLineTextMetrics,
};

const fieldLineSingleLineBold: TextStyle = {
  ...fieldLineSingleLineBoldBase,
  ...fieldLineTextMetrics,
};

export const lineFieldRowText: TextStyle = fieldLineSingleLine;

export const lineFieldRowTextWrap: ViewStyle = {
  height: typographyLayoutFieldLineRowHeight,
  justifyContent: 'center',
};

export const lineFieldRowTextShortWrap: ViewStyle = {
  height: typographyLayoutFieldLineShortMinHeight,
  justifyContent: 'center',
};

export const inputTypographyLayout = {
  fieldLine: lineFieldRowText,
  fieldLineWrap: lineFieldRowTextWrap,
  fieldLineShortWrap: lineFieldRowTextShortWrap,
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
    ios: iosFieldLineInputStyle,
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
    ...pretendardTextStyle('400'),
    fontSize: body01FontSize,
    lineHeight: getFieldInputLineHeight('area'),
    ...androidTextMetrics(),
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

/** sectionTitle 등 Input 행 bold와 동일 메트릭 */
export const inputSectionTitleText: TextStyle = fieldLineSingleLineBold;
