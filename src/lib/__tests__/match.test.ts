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

  it('detects a draw on equal rounds when no points given', () => {
    expect(computeMatchOutcome(3, 1, 1).isDraw).toBe(true);
    expect(computeMatchOutcome(5, 2, 3).isDraw).toBe(false);
  });

  it('breaks a rounds tie with cumulative points', () => {
    expect(computeMatchOutcome(4, 2, 2, 1500, 1200).iWon).toBe(true);
    expect(computeMatchOutcome(4, 2, 2, 1500, 1200).isDraw).toBe(false);
    expect(computeMatchOutcome(4, 2, 2, 1200, 1500).iWon).toBe(false);
    expect(computeMatchOutcome(4, 2, 2, 1200, 1500).isDraw).toBe(false);
  });

  it('is a true draw only when rounds and points are equal', () => {
    expect(computeMatchOutcome(4, 2, 2, 1500, 1500).isDraw).toBe(true);
    expect(computeMatchOutcome(4, 2, 2, 1500, 1500).iWon).toBe(false);
  });

  it('points never override a rounds-won lead', () => {
    expect(computeMatchOutcome(5, 3, 2, 100, 5000).iWon).toBe(true);
  });
});

describe('formatMatchScore', () => {
  it('shows every mode on the unified 0–1000 scale', () => {
    expect(formatMatchScore('classic', 950)).toBe('950 / 1000');
    expect(formatMatchScore('streak', 500)).toBe('500 / 1000');
    expect(formatMatchScore('versus', 1000)).toBe('1000 / 1000');
    expect(formatMatchScore('globe', 600)).toBe('600 / 1000');
    expect(formatMatchScore('guess', 800)).toBe('800 / 1000');
  });
});
