import { Platform, type TextStyle } from 'react-native';

import { androidTextMetrics, getSingleRowLineHeight } from './merge';

/**
 * 고정 높이 행(버튼·칩·Input 24px 등) — transform 제거 + OS별 lineHeight.
 */
export function singleRowCenteredTextStyle(style: TextStyle): TextStyle {
  const fontSize = typeof style.fontSize === 'number' ? style.fontSize : 16;
  const designLineHeight =
    typeof style.lineHeight === 'number' ? style.lineHeight : fontSize;
  const { transform: _transform, ...rest } = style;
  const lineHeight = getSingleRowLineHeight(fontSize, designLineHeight);
  return {
    ...rest,
    lineHeight,
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  };
}
