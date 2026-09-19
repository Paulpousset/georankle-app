import { botSkill, simulateBotRound, makeBotProfile, makeBotAvatarConfig } from '../bot';
import { normalizeRoundScore, ROUND_SCORE_MAX } from '../score';
import { createSeededRng } from '../rng';
import { LAYER_ORDER, getPart } from '../../data/cosmetics';
import type { MatchMode } from '../../types';

describe('botSkill', () => {
  it('rises with rating and stays within [0.4, 0.95]', () => {
    expect(botSkill(800)).toBeCloseTo(0.4, 5);
    expect(botSkill(100)).toBe(0.4); // clamped
    expect(botSkill(5000)).toBe(0.95); // clamped
    expect(botSkill(2200)).toBeGreaterThan(botSkill(1000));
  });
});

describe('simulateBotRound', () => {
  const modes: MatchMode[] = ['versus', 'globe', 'guess', 'streak', 'classic'];

  it('is deterministic for a fixed rng seed', () => {
    for (const mode of modes) {
      const a = simulateBotRound(mode, { roundsPerSet: 5 }, 1500, createSeededRng(7));
      const b = simulateBotRound(mode, { roundsPerSet: 5 }, 1500, createSeededRng(7));
      expect(a).toEqual(b);
    }
  });

  it('produces non-negative scores and positive finish times', () => {
    for (const mode of modes) {
      const r = simulateBotRound(mode, { roundsPerSet: 5 }, 1500, createSeededRng(3));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.finishMs).toBeGreaterThan(0);
    }
  });

  it('keeps scores within each mode scale', () => {
    const seed = createSeededRng(99);
    expect(simulateBotRound('versus', { roundsPerSet: 5 }, 2000, seed).score).toBeLessThanOrEqual(25);
    expect(simulateBotRound('globe', { roundsPerSet: 5 }, 2000, createSeededRng(1)).score).toBeLessThanOrEqual(5000);
    expect(simulateBotRound('guess', {}, 2000, createSeededRng(1)).score).toBeLessThanOrEqual(1000);
    expect(simulateBotRound('classic', {}, 2000, createSeededRng(1)).score).toBeLessThanOrEqual(100);
  });

  it('stronger bots outscore weaker ones on average (globe)', () => {
    let weak = 0;
    let strong = 0;
    for (let s = 0; s < 60; s++) {
      weak += simulateBotRound('globe', { roundsPerSet: 5 }, 900, createSeededRng(s)).score;
      strong += simulateBotRound('globe', { roundsPerSet: 5 }, 2600, createSeededRng(s)).score;
    }
    expect(strong).toBeGreaterThan(weak);
  });
});

// Regression: the player's screen reports a normalized 0–1000 score, but the bot
// simulates in native units. BotMatch must normalize the bot with the SAME context
// before comparing — otherwise e.g. a globe round pits the player's 0..1000 against
// the bot's 0..5000 and the player loses despite scoring more. These tests pin the
// invariant that, once normalized like BotMatch does, the bot lives on the player's
// scale.
describe('bot score normalized like BotMatch (fair comparison)', () => {
  const modes: MatchMode[] = ['versus', 'globe', 'guess', 'streak', 'classic'];
  // Mirror BotMatch: roundsPerSet = 5 for versus/globe, 1 otherwise; CASH = 5 pts.
  const roundsPerSet = (mode: MatchMode) => (mode === 'versus' || mode === 'globe' ? 5 : 1);
  const normalizeBot = (mode: MatchMode, raw: number) =>
    normalizeRoundScore(mode, raw, { numQuestions: roundsPerSet(mode), maxPointsPerQuestion: 5 });

  it('lands on the 0..1000 player scale for every mode', () => {
    for (const mode of modes) {
      for (let s = 0; s < 40; s++) {
        const raw = simulateBotRound(mode, { roundsPerSet: roundsPerSet(mode) }, 2600, createSeededRng(s)).score;
        const norm = normalizeBot(mode, raw);
        expect(norm).toBeGreaterThanOrEqual(0);
        expect(norm).toBeLessThanOrEqual(ROUND_SCORE_MAX);
      }
    }
  });

  it('never lets even a max-rating bot beat a perfect (1000) player', () => {
    // Pre-fix, an unnormalized globe bot (up to 5000) would "beat" a perfect 1000.
    for (const mode of modes) {
      for (let s = 0; s < 40; s++) {
        const raw = simulateBotRound(mode, { roundsPerSet: roundsPerSet(mode) }, 5000, createSeededRng(s)).score;
        const playerWon = ROUND_SCORE_MAX >= normalizeBot(mode, raw); // BotMatch tie → player
        expect(playerWon).toBe(true);
      }
    }
  });
});

describe('makeBotProfile', () => {
  it('returns a name and a rating within ±150 of the player', () => {
    const p = makeBotProfile(1500, createSeededRng(5));
    expect(typeof p.name).toBe('string');
    expect(p.name.length).toBeGreaterThan(0);
    expect(p.rating).toBeGreaterThanOrEqual(1350);
    expect(p.rating).toBeLessThanOrEqual(1650);
  });

  it('never returns a rating below 100', () => {
    const p = makeBotProfile(120, createSeededRng(2));
    expect(p.rating).toBeGreaterThanOrEqual(100);
  });

  it('attaches a valid equipped World config (one real part per slot)', () => {
    const p = makeBotProfile(1500, createSeededRng(5));
    expect(p.avatarConfig.useCustom).toBe(true);
    for (const cat of LAYER_ORDER) {
      const layer = p.avatarConfig.layers[cat];
      expect(layer).toBeDefined();
      // Every chosen id must exist in the catalog for that slot.
      expect(getPart(cat, layer.id)).toBeDefined();
    }
  });
});

describe('point-based quiz modes are simulated on their own scale', () => {
  // Regression guard for an incident that already shipped once: a quiz mode
  // falling through to the `default:` arm is simulated on the globe scale
  // (1000 per hit), which normalizes to the ceiling — the human loses the round
  // before playing it. Nothing in the type system catches this.
  const QUIZ_MODES: MatchMode[] = ['silhouette', 'pinpoint', 'languages'];
  const N = 5;

  it('keeps raw scores inside the N×5 points band', () => {
    for (const mode of QUIZ_MODES) {
      for (let seed = 0; seed < 40; seed++) {
        const { score } = simulateBotRound(mode, { roundsPerSet: N }, 1500, createSeededRng(seed));
        expect({ mode, ok: score >= 0 && score <= N * 5 }).toEqual({ mode, ok: true });
      }
    }
  });

  it('does not normalize to a near-certain win for the bot', () => {
    for (const mode of QUIZ_MODES) {
      const scores = Array.from({ length: 40 }, (_, seed) =>
        normalizeRoundScore(
          mode,
          simulateBotRound(mode, { roundsPerSet: N }, 1500, createSeededRng(seed)).score,
          { numQuestions: N, maxPointsPerQuestion: 5 },
        ),
      );
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      // A mid-rated bot must land mid-table, not pinned at the ceiling.
      expect({ mode, tooStrong: avg > ROUND_SCORE_MAX * 0.9 }).toEqual({ mode, tooStrong: false });
    }
  });
});

describe('makeBotAvatarConfig', () => {
  it('is deterministic for a fixed rng seed', () => {
    expect(makeBotAvatarConfig(createSeededRng(11))).toEqual(makeBotAvatarConfig(createSeededRng(11)));
  });

  it('varies the equipped look across seeds', () => {
    const ids = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const cfg = makeBotAvatarConfig(createSeededRng(s));
      ids.add(LAYER_ORDER.map((cat) => cfg.layers[cat].id).join('|'));
    }
    // Random weighted picks should produce more than a single look.
    expect(ids.size).toBeGreaterThan(1);
  });
});
