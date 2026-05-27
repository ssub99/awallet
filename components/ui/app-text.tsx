import { typography, typographyLayout } from '@/constants/typography';
import { Text, type TextProps, type TextStyle } from 'react-native';

type UiLineVariant =
  | 'body01Regular'
  | 'body01Medium'
  | 'body01Bold'
  | 'body02Regular'
  | 'body02Medium'
  | 'body02Bold'
  | 'button01Medium'
  | 'button02Regular'
  | 'button02Medium'
  | 'detailBold'
  | 'detailMedium'
  | 'headline03Bold';

type FieldInputVariant = 'line' | 'placeholder' | 'number';
type PickerNavVariant = 'regular' | 'medium' | 'bold';
type CardVariant = 'title' | 'meta';
type CategoryEmojiVariant = 'medium' | 'large';
type ParagraphVariant =
  | 'body01Regular'
  | 'body01Medium'
  | 'body01Bold'
  | 'body02Regular'
  | 'body02Medium'
  | 'body02Bold'
  | 'detailRegular'
  | 'detailMedium'
  | 'detailBold'
  | 'headline01Bold'
  | 'headline02Bold'
  | 'headline03Bold'
  | 'headline04Bold';

const UI_LINE_VARIANTS: Record<UiLineVariant, TextStyle> = {
  body01Regular: typographyLayout.uiLineBody01Regular,
  body01Medium: typographyLayout.uiLineBody01Medium,
  body01Bold: typographyLayout.uiLineBody01Bold,
  body02Regular: typographyLayout.uiLineBody02Regular,
  body02Medium: typographyLayout.uiLineBody02Medium,
  body02Bold: typographyLayout.uiLineBody02Bold,
  button01Medium: typographyLayout.uiLineButton01Medium,
  button02Regular: typographyLayout.uiLineButton02Regular,
  button02Medium: typographyLayout.uiLineButton02Medium,
  detailBold: typographyLayout.uiLineDetailBold,
  detailMedium: typographyLayout.uiLineDetailMedium,
  headline03Bold: typographyLayout.uiLineHeadline03Bold,
};

const FIELD_INPUT_VARIANTS: Record<FieldInputVariant, TextStyle> = {
  line: typographyLayout.fieldInputLine,
  placeholder: typographyLayout.fieldInputPlaceholder,
  number: typographyLayout.fieldInputNumber,
};

const PICKER_NAV_VARIANTS: Record<PickerNavVariant, TextStyle> = {
  regular: typographyLayout.pickerNavRegular,
  medium: typographyLayout.pickerNavMedium,
  bold: typographyLayout.pickerNavBold,
};

const CARD_VARIANTS: Record<CardVariant, TextStyle> = {
  title: typographyLayout.cardTitle,
  meta: typographyLayout.cardMeta,
};

const CATEGORY_EMOJI_VARIANTS: Record<CategoryEmojiVariant, TextStyle> = {
  medium: typographyLayout.categoryEmojiMedium,
  large: typographyLayout.categoryEmojiLarge,
};

const PARAGRAPH_VARIANTS: Record<ParagraphVariant, TextStyle> = {
  body01Regular: typography.body01.regular,
  body01Medium: typography.body01.medium,
  body01Bold: typography.body01.bold,
  body02Regular: typography.body02.regular,
  body02Medium: typography.body02.medium,
  body02Bold: typography.body02.bold,
  detailRegular: typography.detail.regular,
  detailMedium: typography.detail.medium,
  detailBold: typography.detail.bold,
  headline01Bold: typography.headline01.bold,
  headline02Bold: typography.headline02.bold,
  headline03Bold: typography.headline03.bold,
  headline04Bold: typography.headline04.bold,
};

type AppTextProps =
  | (TextProps & { context: 'uiLine'; variant?: UiLineVariant })
  | (TextProps & { context: 'fieldInput'; variant?: FieldInputVariant })
  | (TextProps & { context: 'pickerNav'; variant?: PickerNavVariant })
  | (TextProps & { context: 'card'; variant?: CardVariant })
  | (TextProps & { context: 'categoryEmoji'; variant?: CategoryEmojiVariant })
  | (TextProps & { context: 'paragraph'; variant?: ParagraphVariant });

/**
 * Typography single source of truth.
 * 화면에서는 context + variant만 선택하고 토큰 매핑은 내부에서 처리한다.
 */
export function AppText(props: AppTextProps) {
  const { style, ...rest } = props;

  if (props.context === 'uiLine') {
    const { variant = 'body01Regular' } = props;
    return <Text style={[UI_LINE_VARIANTS[variant], style]} {...rest} />;
  }

  if (props.context === 'fieldInput') {
    const { variant = 'line' } = props;
    return <Text style={[FIELD_INPUT_VARIANTS[variant], style]} {...rest} />;
  }

  if (props.context === 'pickerNav') {
    const { variant = 'regular' } = props;
    return <Text style={[PICKER_NAV_VARIANTS[variant], style]} {...rest} />;
  }

  if (props.context === 'card') {
    const { variant = 'meta' } = props;
    return <Text style={[CARD_VARIANTS[variant], style]} {...rest} />;
  }

  if (props.context === 'categoryEmoji') {
    const { variant = 'medium' } = props;
    return <Text style={[CATEGORY_EMOJI_VARIANTS[variant], style]} {...rest} />;
  }

  const { variant = 'body01Regular' } = props;
  return <Text style={[PARAGRAPH_VARIANTS[variant], style]} {...rest} />;
}

export type {
  CardVariant,
  CategoryEmojiVariant,
  FieldInputVariant,
  ParagraphVariant,
  PickerNavVariant,
  UiLineVariant,
};
