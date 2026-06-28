import React from 'react';
import { Image, Text, View } from 'react-native';

import type { AvatarConfig } from '../types';
import { DEFAULT_AVATAR_CONFIG } from '../data/cosmetics';
import { WorldAvatar } from './WorldAvatar';
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
 *  1. world avatar (config.useCustom) — procedural globe + cosmos + orbit
 *  2. uploaded photo (photoUrl)
 *  3. world avatar default (username present — everyone has the free Earth)
 *  4. initials circle (ultimate fallback)
 *
 * Purely presentational — never fetches data.
 */
function AvatarBase({ config, photoUrl, username, size, ringColor, ringWidth = 3 }: AvatarProps) {
  const radius = size / 2;

  // Contextual ring colour (e.g. online status) drawn as an outer border.
  const ring = ringColor;

  const showWorld = config ? config.useCustom !== false : !!username && !photoUrl;
  const worldConfig = config ?? DEFAULT_AVATAR_CONFIG;

  const a11yLabel = username ? `${username}` : undefined;

  if (showWorld) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
        style={{
          width: size, height: size, borderRadius: radius, overflow: 'hidden',
          borderWidth: ring ? ringWidth : 0, borderColor: ring,
          backgroundColor: '#05060f',
        }}
      >
        <WorldAvatar config={worldConfig} size={size} />
      </View>
    );
  }

  if (photoUrl) {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={a11yLabel} style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', borderWidth: ring ? ringWidth : 0, borderColor: ring }}>
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }

  const name = username ?? '?';
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
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
