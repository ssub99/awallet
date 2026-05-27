import React from 'react';
import type { TextProps } from 'react-native';
import OriginalTextDefault from '../node_modules/react-native/Libraries/Text/Text';

const DISABLE_SYSTEM_FONT_SCALING = {
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
} as const;

const OriginalText = OriginalTextDefault as unknown as React.ComponentType<TextProps>;

function Text(props: TextProps) {
  return React.createElement(OriginalText, {
    ...DISABLE_SYSTEM_FONT_SCALING,
    ...props,
  });
}

Text.displayName = 'Text';

export default Text;
