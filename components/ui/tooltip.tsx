/**
 * Tooltip — Figma DS component `tooltip` (polygon + body).
 * Default: arrow on top (points toward anchor above).
 */

import { colors, type ColorPalette } from '@/constants/theme';
import { spacing } from '@/constants/spacing';
import { typographyLayout } from '@/constants/typography';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StyleSheet, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Polygon, Svg } from 'react-native-svg';

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipProps {
  /** Tooltip label (Figma layer: 텍스트) */
  text: string;
  /** Arrow edge: `top` = arrow above body (default, matches Figma component) */
  placement?: TooltipPlacement;
  style?: ViewStyle;
  accessibilityLabel?: string;
  onLayout?: (size: { width: number; height: number }) => void;
}

const ARROW_WIDTH = 8;
const ARROW_HEIGHT = 6;
/** SVG 폴리곤 ↔ body 사이 hairline seam (안티앨리어싱) 상쇄 */
const ARROW_BODY_OVERLAP = 1;
const BODY_RADIUS = 10;
/** Figma body max width — text wraps at word boundaries inside. */
export const TOOLTIP_BODY_MAX_WIDTH = 200;
const BODY_MAX_WIDTH = TOOLTIP_BODY_MAX_WIDTH;
const BODY_TEXT_MAX_WIDTH = BODY_MAX_WIDTH - spacing[300] * 2;

function TooltipArrow({ color, pointing }: { color: string; pointing: 'up' | 'down' }) {
  const points =
    pointing === 'up'
      ? `${ARROW_WIDTH / 2},0 ${ARROW_WIDTH},${ARROW_HEIGHT} 0,${ARROW_HEIGHT}`
      : `0,0 ${ARROW_WIDTH},0 ${ARROW_WIDTH / 2},${ARROW_HEIGHT}`;

  return (
    <Svg width={ARROW_WIDTH} height={ARROW_HEIGHT} accessibilityElementsHidden importantForAccessibility="no">
      <Polygon points={points} fill={color} />
    </Svg>
  );
}

export function Tooltip({
  text,
  placement = 'top',
  style,
  accessibilityLabel,
  onLayout,
}: TooltipProps) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme ?? 'light'] as ColorPalette;
  const backgroundColor = palette.textNeutral;
  const textColor = palette.staticWhite;
  const arrowPointing = placement === 'top' ? 'up' : 'down';

  const handleLayout = onLayout
    ? (event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        onLayout({ width, height });
      }
    : undefined;

  return (
    <View
      style={[styles.root, style]}
      onLayout={handleLayout}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? text}
    >
      <View style={styles.frame}>
        {placement === 'top' ? (
          <View style={styles.arrowRowTop}>
            <TooltipArrow color={backgroundColor} pointing={arrowPointing} />
          </View>
        ) : null}
        <View style={[styles.body, { backgroundColor }]}>
          <Text style={[styles.text, { color: textColor }]}>{text}</Text>
        </View>
        {placement === 'bottom' ? (
          <View style={styles.arrowRowBottom}>
            <TooltipArrow color={backgroundColor} pointing={arrowPointing} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
  },
  frame: {
    maxWidth: BODY_MAX_WIDTH,
    alignItems: 'center',
  },
  arrowRowTop: {
    alignItems: 'center',
    marginBottom: -ARROW_BODY_OVERLAP,
    zIndex: 1,
  },
  arrowRowBottom: {
    alignItems: 'center',
    marginTop: -ARROW_BODY_OVERLAP,
    zIndex: 1,
  },
  body: {
    borderRadius: BODY_RADIUS,
    paddingHorizontal: spacing[300],
    paddingVertical: spacing[200],
    maxWidth: BODY_MAX_WIDTH,
    zIndex: 0,
  },
  text: {
    ...typographyLayout.uiLineBody02Regular,
    textAlign: 'left',
    maxWidth: BODY_TEXT_MAX_WIDTH,
  },
});
