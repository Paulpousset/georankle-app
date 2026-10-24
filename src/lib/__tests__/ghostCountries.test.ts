// daily.ts / share.ts reach Supabase, Sentry and AsyncStorage at import time —
// irrelevant to the labels tested here.
jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

import { GHOST_COUNTRIES, GHOST_DAYS } from '../../data/ghostCountries';
import {
  buildGhostRun,
  ghostAcceptedAnswers,
  ghostFactLine,
  ghostName,
  ghostPath,
  isGhostDay,
} from '../ghostCountries';
import { dailyModeLabel } from '../daily';
import { unionLngLatRings } from '../silhouette';
import { buildShareMessage } from '../share';
import { LOCALES } from '../../i18n/locales';
import type { Language } from '../../types';

describe('ghost countries data', () => {
  it('names every ghost in all sixteen languages', () => {
    const languages = Object.keys(LOCALES) as Language[];
    for (const g of GHOST_COUNTRIES) {
      for (const lang of languages) {
        expect({ id: g.id, lang, name: g.names[lang]?.trim() || '' }).not.toEqual({ id: g.id, lang, name: '' });
      }
    }
  });

  it('draws a shape for every ghost', () => {
    for (const g of GHOST_COUNTRIES) {
      const d = ghostPath(g.id);
      expect(d).toMatch(/^M/);
      // Unions draw every member: at least one ring per member.
      expect((d!.match(/M/g) ?? []).length).toBeGreaterThanOrEqual(g.members.length);
    }
  });

  it('keeps Svalbard out of Sweden-Norway (Norwegian only since 1925)', () => {
    const raw = unionLngLatRings(['SWE', 'NOR']);
    const arctic = raw.filter((ring) => ring.some(([, lat]) => lat > 75)).length;
    expect(arctic).toBeGreaterThan(0);
    const drawn = (ghostPath('sweden-norway')!.match(/M/g) ?? []).length;
    expect(drawn).toBe(raw.length - arctic);
  });
});

describe('buildGhostRun', () => {
  it('is deterministic, without repeats, with 4 distinct options', () => {
    expect(buildGhostRun(42)).toEqual(buildGhostRun(42));
    const run = buildGhostRun(7, 5);
    expect(run).toHaveLength(5);
    expect(new Set(run.map((q) => q.answer)).size).toBe(5);
    for (const q of run) {
      expect(new Set(q.options).size).toBe(4);
      expect(q.options).toContain(q.answer);
    }
  });
});

describe('answers and facts', () => {
  it('accepts names in any language and the usual acronyms', () => {
    const accepted = ghostAcceptedAnswers('ussr');
    for (const name of ['URSS', 'Soviet Union', 'USSR', 'СССР', 'Sowjetunion']) {
      expect(accepted).toContain(name);
    }
  });

  it('tells what the ghost became', () => {
    expect(ghostName('czechoslovakia', 'fr')).toBe('Tchécoslovaquie');
    expect(ghostFactLine('czechoslovakia', 'fr')).toBe('1918–1992 · Aujourd’hui : Tchéquie, Slovaquie');
    expect(ghostFactLine('ussr', 'en')).toBe('1922–1991 · 15 countries today');
  });
});

describe('Halloween days', () => {
  it('runs from 29/10 to 1/11 (UTC) only', () => {
    expect(GHOST_DAYS).toContain('2026-10-31');
    expect(isGhostDay('2026-10-31')).toBe(true);
    expect(isGhostDay('2026-10-28')).toBe(false);
    expect(isGhostDay('2026-11-02')).toBe(false);
  });

  it('renames the Silhouette daily on those days only', () => {
    expect(dailyModeLabel('silhouette', 'fr', '2026-10-31')).toBe('Pays fantômes 👻');
    expect(dailyModeLabel('silhouette', 'fr', '2026-11-02')).toBe('Silhouette');
    expect(dailyModeLabel('silhouette', 'fr')).toBe('Silhouette');
    expect(dailyModeLabel('globe', 'fr', '2026-10-31')).toBe('Globe Géo');
  });

  it('shares with a pumpkin', () => {
    const msg = buildShareMessage(
      { mode: 'silhouette', date: '2026-10-31', score: 15, grid: '🟩🟩🟥🟩🟩' },
      0,
      'en',
    );
    expect(msg.split('\n')[0]).toMatch(/^🎃 GeoG — Ghost Countries 👻 #\d+$/);
  });
});
