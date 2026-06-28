import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Fills the status-bar (top safe-area) strip with `color` so a colored header
 * band reaches the very top edge of the screen.
 *
 * Render it as the first child of a `SafeAreaView` whose `edges` exclude `top`
 * (e.g. `edges={['left', 'right', 'bottom']}`), so the bar — not the page
 * background — paints the area behind the status bar.
 */
export function TopInsetBar({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  if (insets.top <= 0) return null;
  return <View style={{ height: insets.top, backgroundColor: color }} />;
}
