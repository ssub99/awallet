/**
 * Typography runtime — 유일한 Platform.OS 분기 지점.
 *
 * 1. typography.base     → fontSize, font_weights
 * 2. typography.platform → ios/android lineHeight (paragraph · uiLine · fieldInput)
 * 3. createTypographyStyle / uiLineTextStyle / createFieldInputTypographyStyle
 */

import { Platform, type TextStyle } from 'react-native';

import { pretendardTextStyle, type PretendardWeight } from '@/constants/fonts';

import { font_weights, typographyBase, type TypographyScaleKey } from './typography.base';
import { typographyPlatform, type UiLineScaleKey } from './typography.platform';

export type { UiLineScaleKey };
export type TypoSize = { fontSize: number; lineHeight: number };

export type TypographyScaleEntry = {
  ios: TypoSize;
  android: TypoSize;
};

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
        lineHeight: typographyPlatform.ios.paragraph[key].lineHeight,
      },
      android: {
        fontSize,
        lineHeight: typographyPlatform.android.paragraph[key].lineHeight,
      },
    };
  }

  return scale;
}

export const typographyScale = buildTypographyScale();

/** scaleKey → 현재 플랫폼 fontSize/lineHeight (paragraph 메트릭) */
export function getPlatformTypographySizes(scaleKey: TypographyScaleKey): TypoSize {
  const entry = typographyScale[scaleKey];
  return Platform.OS === 'android' ? entry.android : entry.ios;
}

/** 48px line 필드 내부 텍스트 행 높이 (content 24) */
export const typographyLayoutFieldLineRowHeight = typographyBase.layout.fieldLineRowHeight;

/** 36px short line 필드 min content */
export const typographyLayoutFieldLineShortMinHeight = typographyBase.layout.fieldLineShortMinHeight;

/** 96px area 필드 — padding 12×2 제외 입력 영역 */
export const typographyLayoutFieldAreaInputHeight = typographyBase.layout.fieldAreaInputHeight;

/** iOS area·line TextInput — Pretendard 글리프 메트릭 보정 */
export const typographyLayoutFieldAreaLineHeightIos =
  typographyPlatform.ios.fieldInput.area.body01;

/** Android 전역 — scale·필드 프리셋에서만 사용 (화면 StyleSheet 금지) */
export function androidTextMetrics(): Pick<TextStyle, 'includeFontPadding'> {
  return Platform.OS === 'android' ? { includeFontPadding: false } : {};
}

/**
 * uiLine 행 UI lineHeight — iOS는 행 높이·design lh, Android는 Pretendard 메트릭 보정.
 */
export function getUiLineLineHeight(fontSize: number, designLineHeight: number): number {
  const scaleKey = findScaleKeyByFontSize(fontSize);
  if (scaleKey == null) {
    return designLineHeight;
  }

  const iosUiLine = typographyPlatform.ios.uiLine;
  const androidUiLine = typographyPlatform.android.uiLine;

  if (!(scaleKey in iosUiLine)) {
    return designLineHeight;
  }

  const key = scaleKey as UiLineScaleKey;
  return Platform.OS === 'android'
    ? androidUiLine[key].lineHeight
    : iosUiLine[key].lineHeight;
}

/** fieldInput lineHeight (TextInput 전용) */
export function getFieldInputLineHeight(
  variant: 'line' | 'area',
  scaleKey: 'body01' = 'body01',
): number {
  if (Platform.OS === 'android') {
    return typographyPlatform.android.fieldInput[variant][scaleKey];
  }
  return typographyPlatform.ios.fieldInput[variant][scaleKey];
}

/** paragraph TextStyle (OS별 fontSize/lineHeight + Pretendard) */
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

/** fieldInput TextStyle (입력용 font family/weight + 플랫폼 lineHeight) */
export function createFieldInputTypographyStyle(
  variant: 'line' | 'area',
  weight: PretendardWeight = font_weights.regular,
  scaleKey: 'body01' = 'body01',
): TextStyle {
  const { fontSize } = getPlatformTypographySizes(scaleKey);
  return {
    ...pretendardTextStyle(weight),
    fontSize,
    lineHeight: getFieldInputLineHeight(variant, scaleKey),
    ...androidTextMetrics(),
  };
}

/** TextStyle에서 fontSize/lineHeight 추출 — 미지정 시 body01 paragraph(플랫폼) */
export function resolveTextStyleMetrics(textStyle: TextStyle) {
  const fallback = getPlatformTypographySizes('body01');
  const fontSize =
    typeof textStyle.fontSize === 'number' ? textStyle.fontSize : fallback.fontSize;
  const lineHeight =
    typeof textStyle.lineHeight === 'number' ? textStyle.lineHeight : fallback.lineHeight;
  return {
    fontSize,
    lineHeight,
    lineHeightRatio: lineHeight / fontSize,
    fontWeight: textStyle.fontWeight,
  };
}

/**
 * typographyLayout 프리셋 등 — 가로 맞춤 시 fontSize·lineHeight를 비율 유지하며 축소.
 */
export function scaleTextStyleFontSize(textStyle: TextStyle, targetFontSize: number): TextStyle {
  const { fontSize: baseFontSize, lineHeightRatio } = resolveTextStyleMetrics(textStyle);
  if (Math.abs(targetFontSize - baseFontSize) < 0.01) {
    return textStyle;
  }
  const lineHeight = Math.max(targetFontSize, Math.round(targetFontSize * lineHeightRatio));
  return { ...textStyle, fontSize: targetFontSize, lineHeight };
}

/** 고정 높이 행 — transform 제거 + OS별 uiLine lineHeight */
export function uiLineTextStyle(style: TextStyle): TextStyle {
  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 16;
  const designLineHeight =
    typeof style.lineHeight === 'number' ? style.lineHeight : fontSize;
  const { transform: _transform, ...rest } = style;
  const lineHeight = getUiLineLineHeight(fontSize, designLineHeight);
  return {
    ...rest,
    lineHeight,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}
