import {
  leagueLink,
  parseLeagueCode,
  parseReferralCode,
  referralLink,
  playLink,
  SITE_DOMAIN,
} from '../links';

describe('parseReferralCode', () => {
  it('extracts a code from the https invite link', () => {
    expect(parseReferralCode(`https://${SITE_DOMAIN}/invite.html?code=A3F8C13E`)).toBe('A3F8C13E');
  });

  it('accepts the geog:// scheme and the ?ref alias, uppercasing the code', () => {
    expect(parseReferralCode('geog://invite?ref=a3f8c13e')).toBe('A3F8C13E');
  });

  it('returns null when there is no code or no url', () => {
    expect(parseReferralCode(`https://${SITE_DOMAIN}/invite.html`)).toBeNull();
    expect(parseReferralCode(null)).toBeNull();
  });
});

describe('referralLink', () => {
  it('builds an absolute invite URL carrying the code', () => {
    expect(referralLink('A3F8C13E')).toBe(`https://${SITE_DOMAIN}/invite.html?code=A3F8C13E`);
  });

  it('round-trips: a built link parses back to the same code', () => {
    expect(parseReferralCode(referralLink('DEADBEEF'))).toBe('DEADBEEF');
  });
});

describe('playLink', () => {
  it('builds the instant-play URL, with and without a code', () => {
    expect(playLink()).toBe(`https://${SITE_DOMAIN}/play`);
    expect(playLink('A3F8C13E')).toBe(`https://${SITE_DOMAIN}/play?code=A3F8C13E`);
  });

  it('a play link with a code still parses back to that code', () => {
    expect(parseReferralCode(playLink('A3F8C13E'))).toBe('A3F8C13E');
  });
});

describe('leagueLink / parseLeagueCode', () => {
  it('builds a join URL and round-trips the code, uppercased', () => {
    expect(leagueLink('660B2111')).toBe(`https://${SITE_DOMAIN}/play?league=660B2111`);
    expect(parseLeagueCode(leagueLink('660b2111'))).toBe('660B2111');
    expect(parseLeagueCode('geog://play?league=660b2111')).toBe('660B2111');
  });

  it('league and referral params never cross-match', () => {
    expect(parseReferralCode(leagueLink('660B2111'))).toBeNull();
    expect(parseLeagueCode(playLink('A3F8C13E'))).toBeNull();
    expect(parseLeagueCode(null)).toBeNull();
  });

  it('a single URL can carry both a referral and a league code', () => {
    const url = `${leagueLink('660B2111')}&code=A3F8C13E`;
    expect(parseLeagueCode(url)).toBe('660B2111');
    expect(parseReferralCode(url)).toBe('A3F8C13E');
  });
});
