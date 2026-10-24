/**
 * Horizontal slider for a 0..1 value, built on PanResponder so it works the
 * same on iOS, Android and web without a native slider dependency. Dragging is
 * relative (the thumb follows the finger from where it was grabbed), a tap on
 * the track jumps there, and the −/+ buttons nudge for fine tuning. Exposed to
 * screen readers as an adjustable control.
 */
import { useLayoutEffect, useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { a11yButton, ICON_HIT_SLOP } from '../lib/a11y';
import { FONTS } from '../theme/typography';

const THUMB = 28;
const STEP = 0.02;

interface ZoomSliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  accent: string;
  trackColor: string;
  /** Spoken label (« Taille du pays de droite »). */
  label: string;
  /** Spoken value (« 1,4 fois »). */
  valueText: string;
  minusLabel: string;
  plusLabel: string;
  /** Optional caption under the track. */
  caption?: string;
  captionColor?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function ZoomSlider({
  value,
  onChange,
  disabled,
  accent,
  trackColor,
  label,
  valueText,
  minusLabel,
  plusLabel,
  caption,
  captionColor,
}: ZoomSliderProps) {
  const [width, setWidth] = useState(0);
  // The responder is created once (a new one mid-drag would reset its gesture
  // state): it reads the live props through a mutable box synced after each
  // render (a plain object, so the handlers may read it outside render).
  const [live] = useState(() => ({ current: { value, width, disabled, onChange, start: 0 } }));
  useLayoutEffect(() => {
    Object.assign(live.current, { value, width, disabled, onChange });
  });

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !live.current.disabled,
      onMoveShouldSetPanResponder: () => !live.current.disabled,
      // Keep a horizontal drag away from the screen's vertical ScrollView.
      onMoveShouldSetPanResponderCapture: () => !live.current.disabled,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        const { width: w, value: v } = live.current;
        const usable = Math.max(1, w - THUMB);
        const x = evt.nativeEvent.locationX;
        const thumbX = THUMB / 2 + v * usable;
        // A grab on the thumb keeps the value; a tap elsewhere on the track jumps.
        const start =
          Math.abs(x - thumbX) <= THUMB ? v : clamp01((x - THUMB / 2) / usable);
        live.current.start = start;
        if (start !== v) live.current.onChange(start);
      },
      onPanResponderMove: (_evt, g) => {
        const usable = Math.max(1, live.current.width - THUMB);
        live.current.onChange(clamp01(live.current.start + g.dx / usable));
      },
    }),
  );

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const usable = Math.max(0, width - THUMB);
  const nudge = (d: number) => !disabled && onChange(clamp01(value + d));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          onPress={() => nudge(-STEP)}
          disabled={disabled}
          style={[styles.stepBtn, { borderColor: accent, opacity: disabled ? 0.4 : 1 }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(minusLabel)}
        >
          <Minus color={accent} size={18} />
        </TouchableOpacity>

        <View
          style={styles.track}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: valueText }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
          {...responder.panHandlers}
        >
          <View pointerEvents="none" style={[styles.rail, { backgroundColor: trackColor }]} />
          <View
            pointerEvents="none"
            style={[styles.fill, { backgroundColor: accent, width: value * usable }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              { left: value * usable, borderColor: accent, opacity: disabled ? 0.5 : 1 },
            ]}
          />
        </View>

        <TouchableOpacity
          onPress={() => nudge(STEP)}
          disabled={disabled}
          style={[styles.stepBtn, { borderColor: accent, opacity: disabled ? 0.4 : 1 }]}
          hitSlop={ICON_HIT_SLOP}
          {...a11yButton(plusLabel)}
        >
          <Plus color={accent} size={18} />
        </TouchableOpacity>
      </View>
      {caption ? <Text style={[styles.caption, { color: captionColor }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 500 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { borderWidth: 1.5, borderRadius: 10, padding: 6 },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 6, borderRadius: 3 },
  fill: { position: 'absolute', left: THUMB / 2, height: 6, borderRadius: 3 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    borderWidth: 3,
  },
  caption: { fontFamily: FONTS.mono, fontSize: 12, textAlign: 'center', marginTop: 4 },
});
