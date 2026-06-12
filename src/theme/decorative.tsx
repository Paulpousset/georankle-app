import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Line, Path, Circle, Polygon, Text as SvgText } from 'react-native-svg';

// Subtle latitude/longitude grid lines for backgrounds
export function GridLines({
  color = 'rgba(196,168,122,0.15)',
  width = 300,
  height = 300,
}: {
  color?: string;
  width?: number;
  height?: number;
}) {
  const hLines = Array.from({ length: 8 }, (_, i) => (i + 1) * (height / 9));
  const vLines = Array.from({ length: 6 }, (_, i) => (i + 1) * (width / 7));
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
      {hLines.map((y, i) => (
        <Line key={`h${i}`} x1="0" y1={y} x2={width} y2={y} stroke={color} strokeWidth="0.8" />
      ))}
      {vLines.map((x, i) => (
        <Line key={`v${i}`} x1={x} y1="0" x2={x} y2={height} stroke={color} strokeWidth="0.8" />
      ))}
    </Svg>
  );
}

// Small compass rose SVG
export function CompassRose({ size = 40, color = '#c4a87a' }: { size?: number; color?: string }) {
  const c = size / 2;
  const r = size * 0.42;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {/* N/S/E/W points */}
      <Polygon points={`20,2 23,18 17,18`} fill={color} />
      <Polygon points={`20,38 23,22 17,22`} fill={color} opacity="0.6" />
      <Polygon points={`2,20 18,17 18,23`} fill={color} opacity="0.6" />
      <Polygon points={`38,20 22,17 22,23`} fill={color} opacity="0.6" />
      {/* Center circle */}
      <Circle cx="20" cy="20" r="3" fill={color} />
      <Circle cx="20" cy="20" r="5" fill="none" stroke={color} strokeWidth="0.8" />
      {/* N label */}
      <SvgText x="17.5" y="10" fontSize="5" fill={color} fontWeight="bold">N</SvgText>
    </Svg>
  );
}

// Double-border frame that wraps children — cartographic card border
export function MapFrame({
  children,
  color = '#c4a87a',
  style,
}: {
  children: React.ReactNode;
  color?: string;
  style?: object;
}) {
  return (
    <View style={[mapFrameStyles.outer, { borderColor: color }, style]}>
      <View style={[mapFrameStyles.inner, { borderColor: color }]}>{children}</View>
    </View>
  );
}

const mapFrameStyles = StyleSheet.create({
  outer: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 3,
  },
  inner: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
});

// Decorative coordinate label (pure display, not functional)
export function CoordLabel({
  lat,
  lng,
  color = '#a08060',
  size = 9,
}: {
  lat: string;
  lng: string;
  color?: string;
  size?: number;
}) {
  return (
    <Text style={{ fontFamily: 'SpaceMono_400Regular', fontSize: size, color, letterSpacing: 0.5 }}>
      {lat} {lng}
    </Text>
  );
}

// Stamp badge: circular stamp for results (WIN / DÉFAITE / DRAW)
export function StampBadge({
  label,
  color,
  size = 80,
}: {
  label: string;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={[
        stampStyles.badge,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
        },
      ]}
    >
      <View style={[stampStyles.innerRing, { borderColor: color, borderRadius: (size - 8) / 2 }]}>
        <Text style={[stampStyles.label, { color, fontSize: size < 70 ? 9 : 11 }]}>{label}</Text>
      </View>
    </View>
  );
}

const stampStyles = StyleSheet.create({
  badge: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-12deg' }],
  },
  innerRing: {
    borderWidth: 1.5,
    flex: 1,
    margin: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: 'SpaceMono_700Bold',
    fontWeight: '700',
    letterSpacing: 1,
    textAlign: 'center',
  },
});

// Topo-line: a subtle wavy SVG separator
export function TopoLine({ color = '#c4a87a', width = 300 }: { color?: string; width?: number }) {
  const h = 12;
  const segments = Math.floor(width / 20);
  let d = `M 0 ${h / 2}`;
  for (let i = 0; i < segments; i++) {
    const x1 = i * 20 + 5;
    const x2 = i * 20 + 10;
    const x3 = i * 20 + 15;
    const x4 = i * 20 + 20;
    const y = i % 2 === 0 ? 2 : h - 2;
    d += ` Q ${x1} ${y}, ${x2} ${h / 2} Q ${x3} ${h - y}, ${x4} ${h / 2}`;
  }
  return (
    <Svg width={width} height={h}>
      <Path d={d} stroke={color} strokeWidth="1" fill="none" opacity="0.6" />
    </Svg>
  );
}
