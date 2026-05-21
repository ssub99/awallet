/**
 * Typography System
 *
 * Text styles for AWallet design system.
 * Based on Figma text styles and Notion Typography documentation.
 *
 * - 메트릭 단일 소스: TypographyScale (ios / android 슬롯)
 * - Android는 현재 ios와 동일 — 조정 시 android 슬롯만 변경
 *
 * Font Family: Pretendard
 * Weights: Bold (700), Medium (500), Regular (400)
 * Size Categories: xl, l, m, r
 *
 * Naming Convention:
 * - Figma/Notion: "headline01/xl_32/bold"
 * - Code: Typography.headline1.xl.bold (nested object, camelCase)
 *
 * @example
 * ```tsx
 * import { Typography } from '@/constants/typography';
 *
 * <Text style={Typography.headline1.xl.bold}>Title</Text>
 * <Text style={Typography.body1.l.regular}>Body text</Text>
 * ```
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { pretendardTextStyle, type PretendardWeight } from './fonts';

/** @deprecated 전역 패치 optical 미사용 */
export const PRETENDARD_IOS_OPTICAL_Y = 0;
export const PRETENDARD_ANDROID_OPTICAL_Y = 0;

/** Text 패치 — 전역 translateY 없음 (스타일 토큰·compact에서만 보정) */
export function pretendardTextOpticalAdjust(): Pick<TextStyle, 'transform'> {
  return {};
}

/** TextInput 패치 — 전역 translateY 없음 */
export function pretendardTextInputOpticalAdjust(): Pick<TextStyle, 'transform'> {
  return {};
}

/** Icon — 전역 translateY 없음 (단일 행 텍스트와 중앙 맞춤) */
export function pretendardIconOpticalAdjust(): Pick<ViewStyle, 'transform'> {
  return {};
}

/**
 * @deprecated TextInput에도 optical 패치 적용 — placeholder·입력 정렬 통일을 위해 미사용.
 */
export const NEUTRALIZE_TEXT_OPTICAL: TextStyle = {
  transform: [{ translateY: 0 }],
};

/** Android 전역 — TypographyScale·필드 프리셋에서만 사용 (화면 StyleSheet 금지) */
export function androidTextMetrics(): Pick<TextStyle, 'includeFontPadding'> {
  return Platform.OS === 'android' ? { includeFontPadding: false } : {};
}

/** 48px line 필드 내부 텍스트 행 높이 (content 24) */
export const TypographyLayoutFieldLineRowHeight = 24;

/** 36px short line 필드 min content */
export const TypographyLayoutFieldLineShortMinHeight = 21;

/** 96px area 필드 — padding 12×2 제외 입력 영역 */
export const TypographyLayoutFieldAreaInputHeight = 72;

/** iOS area TextInput — body01 lh(24)는 Pretendard 글리프가 하단으로 쳐지고 상단이 잘림 */
export const TypographyLayoutFieldAreaLineHeightIos = 20;

/** iOS TextInput 전용 — Text는 fieldLineWrap flex 중앙, Input만 미세 보정 */
export const TypographyLayoutFieldLineInputOpticalYIos = -2;

/**
 * 단일 행 UI용 lineHeight — iOS는 행 높이에 맞춤, Android는 Pretendard 메트릭 보정.
 * (기록폼 Input·칩·버튼 등 — caa76df lineFieldRowText / inputLineButtonText 기준)
 */
function singleRowLineHeight(fontSize: number, designLineHeight: number): number {
  if (fontSize === 16) {
    return Platform.OS === 'android' ? 21 : TypographyLayoutFieldLineRowHeight;
  }
  if (fontSize === 14) {
    return Platform.OS === 'android' ? 18 : TypographyLayoutFieldLineShortMinHeight;
  }
  if (fontSize === 17) {
    return Platform.OS === 'android' ? 21 : 25.5;
  }
  return designLineHeight;
}

/**
 * 고정 높이 행(버튼·칩·Input 24px 등) — 문단형 optical·transform 제거 + OS별 lineHeight.
 */
export function singleRowCenteredTextStyle(style: TextStyle): TextStyle {
  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 16;
  const designLineHeight =
    typeof style.lineHeight === 'number' ? style.lineHeight : fontSize;
  const { transform: _transform, ...rest } = style;
  const lineHeight = singleRowLineHeight(fontSize, designLineHeight);
  return {
    ...rest,
    lineHeight,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}

/** @deprecated {@link singleRowCenteredTextStyle}와 동일 */
export function compactSingleLineTextStyle(style: TextStyle): TextStyle {
  return singleRowCenteredTextStyle(style);
}

const FONT_WEIGHTS = {
  bold: '700' as const,
  medium: '500' as const,
  regular: '400' as const,
} as const;

type TypoSize = { fontSize: number; lineHeight: number };

type TypographyScaleEntry = {
  ios: TypoSize;
  android: TypoSize;
};

/** ios·android 동일 메트릭 — android만 다를 때 android 인자 지정 */
function typographyScaleEntry(ios: TypoSize, android: TypoSize = ios): TypographyScaleEntry {
  return { ios, android };
}

/**
 * 디자인 시스템 fontSize / lineHeight (단일 소스).
 * Notion·Figma 스타일 키(headline01, body01 …)와 1:1.
 */
const TypographyScale = {
  headline01: typographyScaleEntry({ fontSize: 32, lineHeight: 48 }),
  headline02: typographyScaleEntry({ fontSize: 28, lineHeight: 42 }),
  headline03: typographyScaleEntry({ fontSize: 24, lineHeight: 36 }),
  headline04: typographyScaleEntry({ fontSize: 21, lineHeight: 31.5 }),
  body01: typographyScaleEntry({ fontSize: 16, lineHeight: 24 }),
  body02: typographyScaleEntry({ fontSize: 14, lineHeight: 21 }),
  detail: typographyScaleEntry({ fontSize: 12, lineHeight: 18 }),
  button01: typographyScaleEntry({ fontSize: 16, lineHeight: 24 }),
  button02: typographyScaleEntry({ fontSize: 14, lineHeight: 21 }),
  tiny: typographyScaleEntry({ fontSize: 10, lineHeight: 15 }),
  pickerNav: typographyScaleEntry({ fontSize: 17, lineHeight: 25.5 }),
  categoryEmojiM: typographyScaleEntry({ fontSize: 36, lineHeight: 54 }),
  categoryEmojiL: typographyScaleEntry({ fontSize: 40, lineHeight: 48 }),
} as const satisfies Record<string, TypographyScaleEntry>;

/** 플랫폼별 fontSize/lineHeight 레지스트리 (Typography.* 생성에 사용) */
export { TypographyScale };

export type TypographyScaleKey = keyof typeof TypographyScale;

function createTypographyStyle(scale: TypographyScaleKey, weight: PretendardWeight): TextStyle {
  const sizes =
    Platform.OS === 'android' ? TypographyScale[scale].android : TypographyScale[scale].ios;
  return {
    ...pretendardTextStyle(weight),
    fontSize: sizes.fontSize,
    lineHeight: sizes.lineHeight,
    ...androidTextMetrics(),
  };
}

export function platformLineHeight(iosLineHeight: number, androidLineHeight?: number): number {
  const android = androidLineHeight ?? iosLineHeight;
  return Platform.OS === 'android' ? android : iosLineHeight;
}

/**
 * iOS 기준 px → 현재 플랫폼 fontSize/lineHeight (TypographyScale 매칭, 없으면 ios 메트릭 그대로).
 */
export function resolvePlatformTypographySize(iosFontSize: number, iosLineHeight?: number): TypoSize {
  const iosLh = iosLineHeight ?? iosFontSize * 1.5;
  if (Platform.OS !== 'android') {
    return { fontSize: iosFontSize, lineHeight: iosLh };
  }

  const entry = (Object.values(TypographyScale) as TypographyScaleEntry[]).find(
    (e) =>
      e.ios.fontSize === iosFontSize &&
      (iosLineHeight == null || Math.abs(e.ios.lineHeight - iosLineHeight) < 0.01),
  );
  if (entry) {
    return entry.android;
  }

  return { fontSize: iosFontSize, lineHeight: iosLh };
}

/** @deprecated {@link resolvePlatformTypographySize} */
export const resolvePlatformTypoSize = resolvePlatformTypographySize;

/**
 * @deprecated `Typography` / `TypographyLayout` 토큰·프리셋 사용.
 * TypographyScale에 없는 px만 임시 호출 — 신규 코드에서 사용 금지.
 */
export function textStyleFromIosMetrics(
  iosFontSize: number,
  weight: PretendardWeight,
  iosLineHeight?: number,
): TextStyle {
  const sizes = resolvePlatformTypographySize(iosFontSize, iosLineHeight);
  return {
    ...pretendardTextStyle(weight),
    fontSize: sizes.fontSize,
    lineHeight: sizes.lineHeight,
    ...androidTextMetrics(),
  };
}

/**
 * Typography system with all text styles
 */
export const Typography = {
  headline1: {
    xl: {
      bold: createTypographyStyle('headline01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline01', FONT_WEIGHTS.regular),
    },
  },

  headline2: {
    l: {
      bold: createTypographyStyle('headline02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline02', FONT_WEIGHTS.regular),
    },
  },

  headline3: {
    m: {
      bold: createTypographyStyle('headline03', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline03', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline03', FONT_WEIGHTS.regular),
    },
  },

  headline4: {
    r: {
      bold: createTypographyStyle('headline04', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('headline04', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('headline04', FONT_WEIGHTS.regular),
    },
  },

  body1: {
    l: {
      bold: createTypographyStyle('body01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('body01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('body01', FONT_WEIGHTS.regular),
    },
  },

  body2: {
    r: {
      bold: createTypographyStyle('body02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('body02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('body02', FONT_WEIGHTS.regular),
    },
  },

  detail: {
    r: {
      bold: createTypographyStyle('detail', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('detail', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('detail', FONT_WEIGHTS.regular),
    },
  },

  button1: {
    l: {
      bold: createTypographyStyle('button01', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('button01', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('button01', FONT_WEIGHTS.regular),
    },
  },

  button2: {
    r: {
      bold: createTypographyStyle('button02', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('button02', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('button02', FONT_WEIGHTS.regular),
    },
  },

  tiny: {
    r: {
      bold: createTypographyStyle('tiny', FONT_WEIGHTS.bold),
      medium: createTypographyStyle('tiny', FONT_WEIGHTS.medium),
      regular: createTypographyStyle('tiny', FONT_WEIGHTS.regular),
    },
  },

  /** 피커·시트 헤더 (취소/제목/완료 17pt) */
  pickerNav: {
    nav: {
      regular: createTypographyStyle('pickerNav', FONT_WEIGHTS.regular),
      medium: createTypographyStyle('pickerNav', FONT_WEIGHTS.medium),
      bold: createTypographyStyle('pickerNav', FONT_WEIGHTS.bold),
    },
  },

  /** 카테고리 이모지 선택 라벨 */
  categoryEmoji: {
    m: {
      regular: createTypographyStyle('categoryEmojiM', FONT_WEIGHTS.regular),
    },
    l: {
      regular: createTypographyStyle('categoryEmojiL', FONT_WEIGHTS.regular),
    },
  },
} as const;

export const TypographyPresets = {
  h1: Typography.headline1.xl.bold,
  h2: Typography.headline2.l.bold,
  h3: Typography.headline3.m.bold,
  h4: Typography.headline4.r.bold,
  bodyLarge: Typography.body1.l.regular,
  bodyMedium: Typography.body2.r.regular,
  bodySmall: Typography.detail.r.regular,
  bodyLargeBold: Typography.body1.l.bold,
  bodyMediumBold: Typography.body2.r.bold,
  buttonLarge: Typography.button1.l.bold,
  buttonMedium: Typography.button2.r.medium,
  caption: Typography.detail.r.regular,
  overline: Typography.tiny.r.bold,
  label: Typography.tiny.r.medium,
} as const;

export type FontWeight = 'bold' | 'medium' | 'regular';
export type SizeCategory = 'xl' | 'l' | 'm' | 'r';

export type HeadlineCategory = 'headline1' | 'headline2' | 'headline3' | 'headline4';
export type BodyCategory = 'body1' | 'body2';
export type ButtonCategory = 'button1' | 'button2';
export type UtilityCategory = 'detail' | 'tiny';

export function getTypographyStyle(
  category: keyof typeof Typography,
  size: string,
  weight: FontWeight
): TextStyle {
  const categoryStyles = Typography[category];
  if (size in categoryStyles) {
    const sizeStyles = categoryStyles[size as keyof typeof categoryStyles];
    if (weight in sizeStyles) {
      return sizeStyles[weight];
    }
  }

  return Typography.body1.l.regular;
}

/** 48px line·buttonMode — body01, iOS 24px 박스 고정 (TextInput inputLine과 동일) */
const fieldLineSingleLineBase = singleRowCenteredTextStyle(Typography.body1.l.regular);
const fieldLineSingleLineBoldBase = singleRowCenteredTextStyle(Typography.body1.l.bold);

/** Text — 높이·transform 없음, 부모 fieldLineWrap에서 세로 중앙 */
const iosFieldLineTextMetrics = Platform.select<TextStyle>({
  ios: { includeFontPadding: false },
  default: { includeFontPadding: false },
});

/** TextInput — iOS 글리프만 translateY */
const iosFieldLineInputMetrics = Platform.select<TextStyle>({
  ios: {
    height: TypographyLayoutFieldLineRowHeight,
    includeFontPadding: false,
    transform: [{ translateY: TypographyLayoutFieldLineInputOpticalYIos }],
  },
  default: {
    height: TypographyLayoutFieldLineRowHeight,
    includeFontPadding: false,
  },
});

const fieldLineSingleLine: TextStyle = {
  ...fieldLineSingleLineBase,
  ...iosFieldLineTextMetrics,
};
const fieldLineSingleLineBold: TextStyle = {
  ...fieldLineSingleLineBoldBase,
  ...iosFieldLineTextMetrics,
};

export const lineFieldRowText: TextStyle = fieldLineSingleLine;

export const lineFieldRowTextWrap: ViewStyle = {
  height: TypographyLayoutFieldLineRowHeight,
  justifyContent: 'center',
};

export const lineFieldRowTextShortWrap: ViewStyle = {
  height: TypographyLayoutFieldLineShortMinHeight,
  justifyContent: 'center',
};

/**
 * UI 맥락별 타이포 프리셋 (OS 분기는 createTypographyStyle()·패치에서만).
 * 화면·컴포넌트 StyleSheet에 fontSize/lineHeight 직접 지정 금지.
 */
export const TypographyLayout = {
  /** 48px line — buttonMode·calendar·line TextInput */
  fieldLine: lineFieldRowText,
  fieldLineWrap: lineFieldRowTextWrap,
  fieldLineShortWrap: lineFieldRowTextShortWrap,
  fieldLineShort: {
    ...singleRowCenteredTextStyle(Typography.body2.r.regular),
    ...iosFieldLineTextMetrics,
  } satisfies TextStyle,
  /** 96px area — multiline 메모 */
  fieldArea: {
    ...Typography.body1.l.regular,
    ...androidTextMetrics(),
  } satisfies TextStyle,
  fieldLinePlaceholder: {
    ...fieldLineSingleLine,
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    height: TypographyLayoutFieldLineRowHeight,
    lineHeight: TypographyLayoutFieldLineRowHeight,
  } satisfies TextStyle,
  fieldLineInput: {
    ...fieldLineSingleLine,
    flex: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center' as const,
    ...iosFieldLineInputMetrics,
  } satisfies TextStyle,
  fieldLineShortInput: {
    ...singleRowCenteredTextStyle(Typography.body2.r.regular),
    flex: 1,
    padding: 0,
    margin: 0,
    textAlignVertical: 'center' as const,
    ...Platform.select({
      ios: {
        height: TypographyLayoutFieldLineShortMinHeight,
        includeFontPadding: false,
      },
      default: {
        height: TypographyLayoutFieldLineShortMinHeight,
        includeFontPadding: false,
      },
    }),
  } satisfies TextStyle,
  fieldAreaInput: {
    ...pretendardTextStyle('400'),
    fontSize: TypographyScale.body01.ios.fontSize,
    lineHeight: Platform.select({
      ios: TypographyLayoutFieldAreaLineHeightIos,
      android: TypographyScale.body01.android.lineHeight,
      default: TypographyScale.body01.ios.lineHeight,
    }),
    ...androidTextMetrics(),
    flex: 1,
    padding: 0,
    margin: 0,
    height: TypographyLayoutFieldAreaInputHeight,
    textAlignVertical: 'top' as const,
    ...Platform.select({
      ios: {
        paddingTop: 0,
        transform: [{ translateY: -2 }],
      },
      default: { paddingTop: 0 },
    }),
  } satisfies TextStyle,
  fieldNumber: {
    ...fieldLineSingleLineBold,
    textAlign: 'right' as const,
  } satisfies TextStyle,
  pickerNavRegular: singleRowCenteredTextStyle(Typography.pickerNav.nav.regular),
  pickerNavMedium: singleRowCenteredTextStyle(Typography.pickerNav.nav.medium),
  pickerNavBold: singleRowCenteredTextStyle(Typography.pickerNav.nav.bold),
  infoCardTitle: Typography.headline4.r.bold,
  infoCardMeta: Typography.body2.r.regular,
  sectionTitle: fieldLineSingleLineBold,
  categoryEmojiMedium: Typography.categoryEmoji.m.regular,
  categoryEmojiLarge: Typography.categoryEmoji.l.regular,
} as const;
