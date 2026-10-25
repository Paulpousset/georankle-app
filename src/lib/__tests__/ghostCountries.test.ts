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

import { GHOST_COUNTRIES, GHOST_SCHEDULE, isGhostDaily } from '../../data/ghostCountries';
import {
  buildGhostRun,
  ghostAcceptedAnswers,
  ghostFactLine,
  ghostName,
  ghostPath,
  buildGhostPinpointRun,
  ghostCapitalsChallenge,
  ghostMembers,
} from '../ghostCountries';
import { entityAcceptedAnswers, entityAnswer, entityPrompt } from '../../data/challenges';
import { buildScaleRun, countryArea, scaleCountryName, shapeGeometry } from '../scale';
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

describe('Halloween schedule', () => {
  it('haunts one mode a day from 25/10, and all four on the 31st', () => {
    for (let d = 25; d <= 30; d++) expect(GHOST_SCHEDULE[`2026-10-${d}`]).toHaveLength(1);
    expect([...GHOST_SCHEDULE['2026-10-31']].sort()).toEqual(['challenge', 'pinpoint', 'scale', 'silhouette']);
    expect(isGhostDaily('2026-10-24', 'silhouette')).toBe(false);
    expect(isGhostDaily('2026-11-01', 'silhouette')).toBe(false);
    expect(isGhostDaily('2026-10-26', 'silhouette')).toBe(false);
    expect(isGhostDaily('2026-10-26', 'challenge')).toBe(true);
  });

  it('renames a mode only on its haunted days', () => {
    expect(dailyModeLabel('silhouette', 'fr', '2026-10-25')).toBe('Pays fantômes 👻');
    expect(dailyModeLabel('silhouette', 'fr', '2026-10-26')).toBe('Silhouette');
    expect(dailyModeLabel('silhouette', 'fr')).toBe('Silhouette');
    expect(dailyModeLabel('challenge', 'en', '2026-10-31')).toBe('Ghost Capitals 👻');
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

describe('ghost capitals', () => {
  const ch = ghostCapitalsChallenge();

  it('has enough entities for a 10-question daily', () => {
    expect(ch.entities.length).toBeGreaterThanOrEqual(10);
  });

  it('names prompts and answers in every language', () => {
    const ussr = ch.entities.find((e) => e.id === 'ussr')!;
    expect(entityPrompt(ussr, 'de')).toBe('Sowjetunion');
    expect(entityAnswer(ussr, 'fr')).toBe('Moscou');
    expect(entityAcceptedAnswers(ussr)).toEqual(expect.arrayContaining(['Moscow', 'Moscou']));
    const tanganyika = ch.entities.find((e) => e.id === 'tanganyika')!;
    expect(entityAnswer(tanganyika, 'en')).toBe('Dar es Salaam');
  });
});

describe('haunted globe', () => {
  it('drops each point inside a member of its ghost, with ghost distractors', () => {
    const run = buildGhostPinpointRun(11, 5);
    expect(run).toEqual(buildGhostPinpointRun(11, 5));
    expect(new Set(run.map((q) => q.answer)).size).toBe(5);
    for (const q of run) {
      expect(ghostMembers(q.answer)).toContain(q.frame);
      expect(q.distractors).toHaveLength(3);
      expect(q.distractors).not.toContain(q.answer);
      expect(q.options).toHaveLength(4);
    }
  });
});

describe('ghosts to scale', () => {
  it('puts a ghost on the left of every pair', () => {
    const ghostIds = new Set(GHOST_COUNTRIES.map((g) => g.id));
    for (const seed of [1, 2, 3, 42]) {
      const run = buildScaleRun(seed, 5, { ghost: true });
      expect(run).toHaveLength(5);
      for (const q of run) expect(ghostIds.has(q.left)).toBe(true);
    }
  });

  it('knows a ghost’s shape, area and name', () => {
    expect(shapeGeometry('czechoslovakia')).not.toBeNull();
    expect(countryArea('czechoslovakia')).toBeGreaterThan(120_000);
    expect(scaleCountryName('czechoslovakia', 'fr')).toBe('Tchécoslovaquie');
    expect(scaleCountryName('FRA', 'fr')).toBe('France');
  });
});
