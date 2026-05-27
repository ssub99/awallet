/**
 * base + ios + android → typographyScale 및 플랫폼 조회 API.
 */

import { Platform, type TextStyle } from 'react-native';

import { typographyAndroid } from './typography.android';
import { typographyBase, type TypographyScaleKey } from './typography.base';
import { typographyIos } from './typography.ios';

export type TypoSize = { fontSize: number; lineHeight: number };

export type TypographyScaleEntry = {
  ios: TypoSize;
  android: TypoSize;
};

export type SingleRowScaleKey = keyof typeof typographyIos.singleRow;

function findScaleKeyByFontSize(fontSize: number): TypographyScaleKey | undefined {
  const keys = Object.keys(typographyBase.paragraph) as TypographyScaleKey[];
  return keys.find((key) => typographyBase.paragraph[key].fontSize === fontSize);
}

function buildTypographyScale(): Record<TypographyScaleKey, TypographyScaleEntry> {
  const keys = Object.keys(typographyBase.paragraph) as TypographyScaleKey[];
  const scale = {} as Record<TypographyScaleKey, TypographyScaleEntry>;

  for (const key of keys) {
    const { fontSize } = typographyBase.paragraph[key];
    scale[key] = {
      ios: {
        fontSize,
        lineHeight: typographyIos.paragraph[key].lineHeight,
      },
      android: {
        fontSize,
        lineHeight: typographyAndroid.paragraph[key].lineHeight,
      },
    };
  }

  return scale;
}

export const typographyScale = buildTypographyScale();

/** 48px line 필드 내부 텍스트 행 높이 (content 24) */
export const typographyLayoutFieldLineRowHeight = typographyBase.layout.fieldLineRowHeight;

/** 36px short line 필드 min content */
export const typographyLayoutFieldLineShortMinHeight = typographyBase.layout.fieldLineShortMinHeight;

/** 96px area 필드 — padding 12×2 제외 입력 영역 */
export const typographyLayoutFieldAreaInputHeight = typographyBase.layout.fieldAreaInputHeight;

/** iOS area·line TextInput — Pretendard 글리프 메트릭 보정 */
export const typographyLayoutFieldAreaLineHeightIos = typographyIos.fieldInput.area.body01;

/** Android 전역 — scale·필드 프리셋에서만 사용 (화면 StyleSheet 금지) */
export function androidTextMetrics(): Pick<TextStyle, 'includeFontPadding'> {
  return Platform.OS === 'android' ? { includeFontPadding: false } : {};
}

/**
 * 단일 행 UI lineHeight — iOS는 행 높이·design lh, Android는 Pretendard 메트릭 보정.
 */
export function getSingleRowLineHeight(fontSize: number, designLineHeight: number): number {
  const scaleKey = findScaleKeyByFontSize(fontSize);
  if (scaleKey == null) {
    return designLineHeight;
  }

  const iosSingleRow = typographyIos.singleRow;
  const androidSingleRow = typographyAndroid.singleRow;

  if (!(scaleKey in iosSingleRow)) {
    return designLineHeight;
  }

  const key = scaleKey as SingleRowScaleKey;
  return Platform.OS === 'android'
    ? androidSingleRow[key].lineHeight
    : iosSingleRow[key].lineHeight;
}

/** fieldInput lineHeight (TextInput 전용) */
export function getFieldInputLineHeight(
  variant: 'line' | 'area',
  scaleKey: 'body01' = 'body01',
): number {
  if (Platform.OS === 'android') {
    return typographyAndroid.fieldInput[variant][scaleKey];
  }
  return typographyIos.fieldInput[variant][scaleKey];
}
