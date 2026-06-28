import { Text, type TextProps } from 'react-native';

/**
 * A `<Text>` that caps OS font scaling so large display numbers (scores, ELO,
 * countdowns, streak counts) don't blow out the layout when the user has a big
 * Dynamic Type / font-size accessibility setting.
 *
 * Drop-in replacement for `<Text>` on big-`fontSize` elements:
 *
 * ```tsx
 * <ScoreText style={{ fontSize: 48, fontFamily: FONTS.headingBlack }}>
 *   {score}
 * </ScoreText>
 * ```
 *
 * `maxFontSizeMultiplier` still allows growth up to 1.3× (so the text remains
 * somewhat responsive to the user's preference) while preventing the runaway
 * scaling that breaks fixed-size score panels. Override per-instance if needed.
 */
export function ScoreText({ maxFontSizeMultiplier = 1.3, ...props }: TextProps) {
  return <Text maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}
