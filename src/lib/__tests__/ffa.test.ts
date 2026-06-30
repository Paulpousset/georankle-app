import {
  roundWinners,
  isValidPlayerCount,
  isSeriesOver,
  standings,
  champions,
  MIN_FFA_PLAYERS,
  MAX_FFA_PLAYERS,
} from '../ffa';

describe('roundWinners', () => {
  it('returns the single top scorer', () => {
    expect(roundWinners([3, 7, 2, 5])).toEqual([1]);
  });
  it('returns all tied top scorers', () => {
    expect(roundWinners([5, 5, 2, 5])).toEqual([0, 1, 3]);
  });
  it('handles an empty round', () => {
    expect(roundWinners([])).toEqual([]);
  });
});

describe('isValidPlayerCount', () => {
  it('accepts 2..8 only', () => {
    expect(isValidPlayerCount(MIN_FFA_PLAYERS)).toBe(true);
    expect(isValidPlayerCount(MAX_FFA_PLAYERS)).toBe(true);
    expect(isValidPlayerCount(5)).toBe(true);
    expect(isValidPlayerCount(1)).toBe(false);
    expect(isValidPlayerCount(9)).toBe(false);
    expect(isValidPlayerCount(3.5)).toBe(false);
  });
});

describe('isSeriesOver', () => {
  it('ends once all rounds are played', () => {
    expect(isSeriesOver(4, 5)).toBe(false);
    expect(isSeriesOver(5, 5)).toBe(true);
    expect(isSeriesOver(6, 5)).toBe(true);
  });
});

describe('standings & champions', () => {
  const players = [
    { id: 'a', roundsWon: 2, totalScore: 30 },
    { id: 'b', roundsWon: 3, totalScore: 10 },
    { id: 'c', roundsWon: 2, totalScore: 40 },
    { id: 'd', roundsWon: 0, totalScore: 99 },
  ];

  it('orders by rounds won, then total score', () => {
    expect(standings(players).map((p) => p.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('champion is the rounds-won leader', () => {
    expect(champions(players).map((p) => p.id)).toEqual(['b']);
  });

  it('reports a tie when both keys match', () => {
    const tied = [
      { id: 'x', roundsWon: 2, totalScore: 20 },
      { id: 'y', roundsWon: 2, totalScore: 20 },
      { id: 'z', roundsWon: 1, totalScore: 50 },
    ];
    expect(champions(tied).map((p) => p.id).sort()).toEqual(['x', 'y']);
  });
});
