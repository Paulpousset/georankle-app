import { computeMatchOutcome, formatMatchScore } from '../match';

describe('computeMatchOutcome', () => {
  it('computes neededToWin as the majority of bestOf', () => {
    expect(computeMatchOutcome(1, 0, 0).neededToWin).toBe(1);
    expect(computeMatchOutcome(3, 0, 0).neededToWin).toBe(2);
    expect(computeMatchOutcome(5, 0, 0).neededToWin).toBe(3);
    expect(computeMatchOutcome(7, 0, 0).neededToWin).toBe(4);
  });

  it('flags a win once the threshold is reached (BO5)', () => {
    expect(computeMatchOutcome(5, 3, 1).iWon).toBe(true);
    expect(computeMatchOutcome(5, 2, 3).iWon).toBe(false);
  });

  it('does not flag a win one round short (off-by-one BO3)', () => {
    expect(computeMatchOutcome(3, 1, 2).iWon).toBe(false);
    expect(computeMatchOutcome(3, 2, 1).iWon).toBe(true);
  });

  it('detects a draw on equal rounds', () => {
    expect(computeMatchOutcome(3, 1, 1).isDraw).toBe(true);
    expect(computeMatchOutcome(5, 2, 3).isDraw).toBe(false);
  });
});

describe('formatMatchScore', () => {
  it('formats by game mode', () => {
    expect(formatMatchScore('classic', 95)).toBe('95%');
    expect(formatMatchScore('streak', 12)).toBe('12');
    expect(formatMatchScore('versus', 47)).toBe('47 pts');
    expect(formatMatchScore('globe', 30)).toBe('30 pts');
    expect(formatMatchScore('guess', 800)).toBe('800 pts');
  });
});
