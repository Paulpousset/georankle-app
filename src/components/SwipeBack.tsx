import { type ReactNode } from 'react';
import { PanResponder, View } from 'react-native';

/**
 * Edge swipe-back gesture, built on the built-in PanResponder so it needs no
 * native gesture dependency. It only claims a touch that *starts near the left
 * edge* and moves clearly rightward, which keeps it from stealing scrolls,
 * sliders, or the globe drag elsewhere on screen. iOS-style back gesture.
 *
 * The responder is rebuilt each render so its callbacks always see the current
 * `enabled`/`onBack`. That's safe here because a swipe never triggers a render
 * until it completes (no state changes mid-gesture), so a single responder
 * instance handles each gesture end to end.
 */

interface Props {
  /** When false the gesture is inert (e.g. nothing to go back to). */
  enabled: boolean;
  /** Called once when a valid back swipe completes. */
  onBack: () => void;
  children: ReactNode;
}

const EDGE_ZONE = 30; // px from the left edge where the gesture may begin
const DX_TRIGGER = 70; // horizontal travel that confirms a back swipe

export function SwipeBack({ enabled, onBack, children }: Props) {
  const responder = PanResponder.create({
    // Never grab on touch-down — let buttons / lists win the tap first.
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (evt, g) => {
      if (!enabled) return false;
      const startX = evt.nativeEvent.pageX - g.dx;
      return (
        startX <= EDGE_ZONE &&
        g.dx > 14 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.6
      );
    },
    onPanResponderRelease: (_evt, g) => {
      if (g.dx >= DX_TRIGGER && Math.abs(g.dy) < 120) onBack();
    },
  });

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
