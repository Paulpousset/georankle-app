/**
 * Smoke tests: every catalog part must mount inside <WorldAvatar> (and, for
 * emblem/satellite glyphs, <GlyphThumb>) without throwing. This is the net
 * that catches a style key referenced in cosmetics.ts but missing from the
 * renderer — the exact failure mode of adding items in one file only.
 */
import { render } from '@testing-library/react-native';

import { WorldAvatar } from '../WorldAvatar';
import { GlyphThumb } from '../worldGlyphs';
import { ALL_PARTS, DEFAULT_AVATAR_CONFIG, getCategoryParts } from '../../data/cosmetics';
import type { AvatarConfig, CosmeticPart } from '../../types';

function configWith(part: CosmeticPart): AvatarConfig {
  return {
    v: 4,
    useCustom: true,
    layers: {
      ...DEFAULT_AVATAR_CONFIG.layers,
      [part.category]: { id: part.id, tint: part.defaultTint ?? null },
    },
  };
}

describe('WorldAvatar smoke render', () => {
  it.each(ALL_PARTS.map((p) => [p.id, p] as const))('renders with %s equipped', (_id, part) => {
    expect(() => render(<WorldAvatar config={configWith(part)} size={100} />)).not.toThrow();
  });

  it('renders a fully-stacked new-wave config (saturn + eclipse + blackhole + moai + rocket)', () => {
    const cfg: AvatarConfig = {
      v: 4,
      useCustom: true,
      layers: {
        cosmos: { id: 'cosmos_blackhole', tint: null },
        globe: { id: 'globe_eclipse', tint: null },
        orbit: { id: 'orbit_saturn', tint: null },
        emblem: { id: 'emblem_moai', tint: null },
        satellite: { id: 'sat_rocket', tint: null },
      },
    };
    expect(() => render(<WorldAvatar config={cfg} size={200} />)).not.toThrow();
  });
});

describe('GlyphThumb smoke render', () => {
  const glyphParts = [...getCategoryParts('emblem'), ...getCategoryParts('satellite')]
    .filter((p) => !p.isDefault);

  it.each(glyphParts.map((p) => [p.id, p] as const))('renders thumb for %s', (_id, part) => {
    expect(() => render(<GlyphThumb id={part.id} category={part.category} size={56} />)).not.toThrow();
  });
});
