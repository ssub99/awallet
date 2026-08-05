// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const STATUS_BAR_RESTRICTED_SYNTAX = [
  {
    selector: "ImportSpecifier[imported.name='StatusBar']",
    message:
      'RN StatusBar 금지. Native Stack statusBarStyle 또는 navigation.setOptions({ statusBarStyle })를 사용하세요.',
  },
  {
    selector: "JSXOpeningElement[name.name='StatusBar']",
    message:
      'RN <StatusBar> 금지. Native Stack statusBarStyle 또는 navigation.setOptions({ statusBarStyle })를 사용하세요.',
  },
  {
    selector: "MemberExpression[object.name='StatusBar'][property.name='setBarStyle']",
    message: 'StatusBar.setBarStyle 금지. navigation.setOptions({ statusBarStyle })를 사용하세요.',
  },
  {
    selector: "MemberExpression[object.name='StatusBar'][property.name='setHidden']",
    message: 'StatusBar.setHidden 금지. Native Stack options를 사용하세요.',
  },
  {
    selector: "MemberExpression[object.name='StatusBar'][property.name='setBackgroundColor']",
    message: 'StatusBar.setBackgroundColor 금지. Native Stack options를 사용하세요.',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='typographyLayout'][property.name=/^uiLine/]",
          message:
            '화면에서는 typographyLayout.uiLine* 직접 사용 대신 UiLineText/SectionTitle(AppText wrapper)를 사용하세요.',
        },
        {
          selector: "MemberExpression[object.name='typographyLayout'][property.name=/^fieldInput/]",
          message:
            '화면에서는 typographyLayout.fieldInput* 직접 사용 대신 Input/FieldInputText(AppText wrapper)를 사용하세요.',
        },
        {
          selector: "MemberExpression[object.name='typographyLayout'][property.name=/^pickerNav/]",
          message:
            '화면에서는 typographyLayout.pickerNav* 직접 사용 대신 PickerNavText(AppText wrapper)를 사용하세요.',
        },
        {
          selector: "MemberExpression[object.name='typographyLayout'][property.name=/^card/]",
          message:
            '화면에서는 typographyLayout.card* 직접 사용 대신 CardText(AppText wrapper)를 사용하세요.',
        },
        {
          selector: "MemberExpression[object.name='typographyLayout'][property.name=/^categoryEmoji/]",
          message:
            '화면에서는 typographyLayout.categoryEmoji* 직접 사용 대신 CategoryEmojiText(AppText wrapper)를 사용하세요.',
        },
        ...STATUS_BAR_RESTRICTED_SYNTAX,
      ],
    },
  },
  {
    files: ['components/**/*.tsx'],
    ignores: ['components/ui/date-picker.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...STATUS_BAR_RESTRICTED_SYNTAX],
    },
  },
]);
