import { Text, type TextProps } from 'react-native';

/**
 * A `<Text>` that truncates to a single line with a trailing ellipsis by
 * default. Use it for usernames, mode labels and any free-form string that can
 * be long (especially in French, where labels run longer than English) so it
 * never wraps onto a second line or pushes a sibling (e.g. a score) off-screen.
 *
 * Drop-in replacement for `<Text>`:
 *
 * ```tsx
 * <TruncatedText style={[styles.username, { color: c.text }]}>{name}</TruncatedText>
 * ```
 *
 * `numberOfLines` / `ellipsizeMode` can be overridden per instance (e.g.
 * `numberOfLines={2}` for a two-line label). Pair with `flexShrink: 1` (applied
 * here) so it yields width to fixed-size siblings inside a flex row.
 */
export function TruncatedText({
  numberOfLines = 1,
  ellipsizeMode = 'tail',
  style,
  ...props
}: TextProps) {
  return (
    <Text
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      style={[{ flexShrink: 1 }, style]}
      {...props}
    />
  );
}
