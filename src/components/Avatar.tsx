import React from 'react';
import { Image, Text, View } from 'react-native';

import type { AvatarConfig } from '../types';
import { getPart } from '../data/cosmetics';
import { FONTS } from '../theme/typography';

interface AvatarProps {
  config?: AvatarConfig | null;
  photoUrl?: string | null;
  username?: string | null;
  size: number;
  ringColor?: string;
  ringWidth?: number;
}

const INITIALS_COLORS = ['#2a6e3f', '#1a4a7a', '#c04a1a', '#c4872a', '#8b1a1a', '#4a9eff'];

function initialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

/**
 * Shared avatar thumbnail. Priority:
 *  1. hero portrait (config.useCustom) with the equipped 2D frame ring
 *  2. uploaded photo (photoUrl)
 *  3. hero portrait default (username present — everyone has the free Knight)
 *  4. initials circle (ultimate fallback)
 *
 * Purely presentational — images load via <Image>, never fetches data.
 */
function AvatarBase({ config, photoUrl, username, size, ringColor, ringWidth = 3 }: AvatarProps) {
  const radius = size / 2;

  // Equipped 2D frame ring (cosmetic) wins over the contextual ring colour.
  const framePart = config ? getPart('frame', config.layers?.frame?.id ?? '') : undefined;
  const ring = framePart?.swatch ?? ringColor;

  const heroId = config?.layers?.hero?.id ?? 'hero_knight';
  const hero = getPart('hero', heroId) ?? getPart('hero', 'hero_knight');

  const showHero = config ? config.useCustom !== false : !!username && !photoUrl;

  if (showHero && hero?.thumbUrl) {
    return (
      <View
        style={{
          width: size, height: size, borderRadius: radius, overflow: 'hidden',
          borderWidth: ring ? ringWidth : 0, borderColor: ring,
          backgroundColor: '#ded2b4',
        }}
      >
        <Image source={{ uri: hero.thumbUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

  if (photoUrl) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', borderWidth: ring ? ringWidth : 0, borderColor: ring }}>
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }

  const name = username ?? '?';
  return (
    <View
      style={{
        width: size, height: size, borderRadius: radius,
        backgroundColor: initialsColor(name),
        alignItems: 'center', justifyContent: 'center',
        borderWidth: ring ? ringWidth : 0, borderColor: ring,
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.36, fontFamily: FONTS.headingBlack }}>{initials(name)}</Text>
    </View>
  );
}

export const Avatar = React.memo(AvatarBase);
