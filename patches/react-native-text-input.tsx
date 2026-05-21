import { pretendardTextInputOpticalAdjust } from '@/constants/typography';
import React from 'react';
import { Platform } from 'react-native';
import type { TextInputProps, TextStyle } from 'react-native';
import OriginalTextInputDefault from '../node_modules/react-native/Libraries/Components/TextInput/TextInput';

const DISABLE_SYSTEM_FONT_SCALING = {
  allowFontScaling: false,
  maxFontSizeMultiplier: 1,
} as const;

const ANDROID_TEXT_INPUT_ADJUST =
  Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : {};

const OriginalTextInput = OriginalTextInputDefault as unknown as React.ComponentType<
  TextInputProps & { ref?: React.Ref<unknown> }
>;

const PatchedTextInput = React.forwardRef<unknown, TextInputProps>((props, ref) =>
  React.createElement(OriginalTextInput, {
    ...DISABLE_SYSTEM_FONT_SCALING,
    ...ANDROID_TEXT_INPUT_ADJUST,
    ...(props as TextInputProps),
    style: [pretendardTextInputOpticalAdjust(), props.style as TextStyle | undefined],
    ref,
  } as TextInputProps & { ref?: React.Ref<unknown> }),
);

PatchedTextInput.displayName = 'TextInput';

Object.assign(PatchedTextInput, OriginalTextInputDefault);

export default PatchedTextInput;
