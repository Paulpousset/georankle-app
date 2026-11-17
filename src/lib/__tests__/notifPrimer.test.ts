import {
  afterDismiss,
  shouldShowPrimer,
  PRIMER_COOLDOWN_DAYS,
  PRIMER_MAX_DISMISSALS,
} from '../notifPrimer';

const now = new Date('2026-11-16T20:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('shouldShowPrimer', () => {
  it('shows on a fresh device whose permission was never asked', () => {
    expect(shouldShowPrimer('undetermined', null, now)).toBe(true);
  });

  it('never shows once the OS answered, or on web', () => {
    expect(shouldShowPrimer('granted', null, now)).toBe(false);
    expect(shouldShowPrimer('denied', null, now)).toBe(false);
    expect(shouldShowPrimer('unavailable', null, now)).toBe(false);
  });

  it('waits out the cooldown after a "later"', () => {
    const recent = { dismissals: 1, lastDismissedAt: daysAgo(PRIMER_COOLDOWN_DAYS - 1) };
    const old = { dismissals: 1, lastDismissedAt: daysAgo(PRIMER_COOLDOWN_DAYS + 0.1) };
    expect(shouldShowPrimer('undetermined', recent, now)).toBe(false);
    expect(shouldShowPrimer('undetermined', old, now)).toBe(true);
  });

  it('stops asking after the maximum number of "later"', () => {
    const s = { dismissals: PRIMER_MAX_DISMISSALS, lastDismissedAt: daysAgo(30) };
    expect(shouldShowPrimer('undetermined', s, now)).toBe(false);
  });
});

describe('afterDismiss', () => {
  it('counts the dismissal and stamps it', () => {
    expect(afterDismiss(null, now)).toEqual({ dismissals: 1, lastDismissedAt: now.toISOString() });
  });
});
