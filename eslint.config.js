// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

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
      ],
    },
  },
]);
