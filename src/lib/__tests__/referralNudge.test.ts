import {
  afterGame,
  afterShown,
  EMPTY_NUDGE_STATE,
  MIN_GAMES_BEFORE_NUDGE,
  NUDGE_COOLDOWN_DAYS,
  shouldShowReferralNudge,
} from '../referralNudge';

const now = new Date('2026-09-22T18:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('referralNudge', () => {
  it('stays silent before the minimum number of games', () => {
    expect(shouldShowReferralNudge(null, now)).toBe(false);
    expect(shouldShowReferralNudge({ games: MIN_GAMES_BEFORE_NUDGE - 1, lastShownAt: null }, now)).toBe(false);
  });

  it('shows once the player has finished enough games', () => {
    expect(shouldShowReferralNudge({ games: MIN_GAMES_BEFORE_NUDGE, lastShownAt: null }, now)).toBe(true);
  });

  it('respects the weekly cooldown', () => {
    const recent = { games: 10, lastShownAt: daysAgo(NUDGE_COOLDOWN_DAYS - 1) };
    expect(shouldShowReferralNudge(recent, now)).toBe(false);
    const old = { games: 10, lastShownAt: daysAgo(NUDGE_COOLDOWN_DAYS + 1) };
    expect(shouldShowReferralNudge(old, now)).toBe(true);
  });

  it('tolerates a clock that went backwards', () => {
    const future = { games: 10, lastShownAt: daysAgo(-3) };
    expect(shouldShowReferralNudge(future, now)).toBe(true);
  });

  it('counts games and records the last display', () => {
    let s = afterGame(null);
    expect(s).toEqual({ ...EMPTY_NUDGE_STATE, games: 1 });
    s = afterGame(afterGame(s));
    expect(s.games).toBe(3);
    s = afterShown(s, now);
    expect(s.lastShownAt).toBe(now.toISOString());
    expect(s.games).toBe(3);
  });
});
