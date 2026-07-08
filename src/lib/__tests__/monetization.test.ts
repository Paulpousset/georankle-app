import {
  COIN_PACKS,
  REWARDED_DAILY_CAP,
  purchaseCoinPack,
  showRewardedAd,
  claimRewardedAd,
  getRewardedAdsRemaining,
  rewardedAdsAvailable,
} from '../monetization';
import { __resetFeatureFlagCache } from '../featureFlags';
import { supabase } from '../supabase';
import type { SupabaseMock } from '../../../test-utils/supabaseMock';

jest.mock('../supabase', () => {
  const { makeSupabaseMock } = require('../../../test-utils/supabaseMock');
  return { supabase: makeSupabaseMock() };
});

// log.ts pulls in @sentry/react-native (untranspiled ESM) — irrelevant here.
jest.mock('../log', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// Controllable fake of the native ads SDK. `__outcome` drives what a show()
// does: earn the reward, get dismissed, or error out.
jest.mock('react-native-google-mobile-ads', () => {
  const state = {
    // 'slow' = the ad shows but nothing else happens until the test fires the
    // listeners itself (simulates a long playback).
    __outcome: 'earned' as 'earned' | 'dismissed' | 'error' | 'slow',
    __listeners: {} as Record<string, (arg?: unknown) => void>,
  };
  const fakeAd = {
    addAdEventListener: jest.fn((type: string, cb: (arg?: unknown) => void) => {
      state.__listeners[type] = cb;
      return () => {
        delete state.__listeners[type];
      };
    }),
    load: jest.fn(() => {
      state.__listeners['loaded']?.();
    }),
    show: jest.fn(() => {
      if (state.__outcome === 'error') {
        state.__listeners['error']?.(new Error('no fill'));
      } else if (state.__outcome !== 'slow') {
        if (state.__outcome === 'earned') state.__listeners['earned']?.();
        state.__listeners['closed']?.();
      }
      return Promise.resolve();
    }),
  };
  return {
    __state: state,
    __fakeAd: fakeAd,
    MobileAds: () => ({ initialize: jest.fn(() => Promise.resolve([])) }),
    AdsConsent: { gatherConsent: jest.fn(() => Promise.resolve({})) },
    TestIds: { REWARDED: 'test-rewarded' },
    RewardedAdEventType: { LOADED: 'loaded', EARNED_REWARD: 'earned' },
    AdEventType: { CLOSED: 'closed', ERROR: 'error' },
    RewardedAd: { createForAdRequest: jest.fn(() => fakeAd) },
  };
});

jest.mock('expo-tracking-transparency', () => ({
  requestTrackingPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));

const sb = supabase as unknown as SupabaseMock;
const adsMock = require('react-native-google-mobile-ads');

beforeEach(() => {
  sb.__reset();
  __resetFeatureFlagCache();
  adsMock.__state.__outcome = 'earned';
  adsMock.__state.__listeners = {};
});

const flagsOff = () =>
  sb.__setResult('feature_flags', {
    data: [
      { key: 'iap', enabled: false },
      { key: 'rewarded_ads', enabled: false },
    ],
    error: null,
  });

const flagsOn = () =>
  sb.__setResult('feature_flags', {
    data: [
      { key: 'iap', enabled: false },
      { key: 'rewarded_ads', enabled: true },
    ],
    error: null,
  });

describe('monetization scaffolding (flags OFF)', () => {
  it('ships coin packs that mirror grant_iap_coins', () => {
    expect(COIN_PACKS.map((p) => [p.productId, p.coins])).toEqual([
      ['coins_300', 300],
      ['coins_800', 800],
      ['coins_2000', 2000],
    ]);
  });

  it('refuses purchases and ads while the flags are off — nothing reaches the network', async () => {
    flagsOff();
    expect(await purchaseCoinPack('coins_300')).toEqual({ ok: false, reason: 'disabled' });
    expect(await showRewardedAd()).toEqual({ granted: false, reason: 'disabled' });
    expect(await rewardedAdsAvailable()).toBe(false);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(adsMock.RewardedAd.createForAdRequest).not.toHaveBeenCalled();
  });
});

describe('showRewardedAd (flag ON, SDK mocked)', () => {
  it('shows the ad and claims server-side on EARNED_REWARD', async () => {
    flagsOn();
    sb.rpc.mockResolvedValueOnce({ data: { granted: true, coins: 5 }, error: null });
    expect(await showRewardedAd()).toEqual({ granted: true, coins: 5, reason: undefined });
    expect(sb.rpc).toHaveBeenCalledWith('claim_rewarded_ad');
  });

  it('does NOT claim when the ad is dismissed before the reward', async () => {
    flagsOn();
    adsMock.__state.__outcome = 'dismissed';
    expect(await showRewardedAd()).toEqual({ granted: false, reason: 'dismissed' });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('maps SDK errors to a failed result without claiming', async () => {
    flagsOn();
    adsMock.__state.__outcome = 'error';
    expect(await showRewardedAd()).toEqual({ granted: false, reason: 'failed' });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  // Regression (2026-07-08): the load timeout used to keep running during
  // playback, rejecting mid-ad and unsubscribing EARNED_REWARD — so watching a
  // real 15-30s ad never claimed anything.
  it('still claims when playback outlasts the 15s load timeout', async () => {
    jest.useFakeTimers();
    try {
      flagsOn();
      adsMock.__state.__outcome = 'slow';
      sb.rpc.mockResolvedValueOnce({ data: { granted: true, coins: 5 }, error: null });
      const pending = showRewardedAd();
      await jest.advanceTimersByTimeAsync(30000); // the ad is playing all along
      adsMock.__state.__listeners['earned']?.();
      adsMock.__state.__listeners['closed']?.();
      await expect(pending).resolves.toEqual({ granted: true, coins: 5, reason: undefined });
      expect(sb.rpc).toHaveBeenCalledWith('claim_rewarded_ad');
    } finally {
      jest.useRealTimers();
    }
  });

  it('relays a server cap refusal after a genuinely watched ad', async () => {
    flagsOn();
    sb.rpc.mockResolvedValueOnce({ data: { granted: false, reason: 'capped' }, error: null });
    expect((await showRewardedAd()).reason).toBe('capped');
  });
});

describe('getRewardedAdsRemaining', () => {
  it('subtracts today’s claims from the cap', async () => {
    sb.__setResult('ad_claims', { data: { count: 3 }, error: null });
    expect(await getRewardedAdsRemaining()).toBe(REWARDED_DAILY_CAP - 3);
  });

  it('returns the full cap when no row exists yet', async () => {
    sb.__setResult('ad_claims', { data: null, error: null });
    expect(await getRewardedAdsRemaining()).toBe(REWARDED_DAILY_CAP);
  });

  it('never goes negative and returns null on read errors', async () => {
    sb.__setResult('ad_claims', { data: { count: 99 }, error: null });
    expect(await getRewardedAdsRemaining()).toBe(0);
    sb.__setResult('ad_claims', { data: null, error: { message: 'boom' } });
    expect(await getRewardedAdsRemaining()).toBeNull();
  });
});

describe('claimRewardedAd (server relay)', () => {
  it('relays a grant', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { granted: true, coins: 5 }, error: null });
    expect(await claimRewardedAd()).toEqual({ granted: true, coins: 5, reason: undefined });
    expect(sb.rpc).toHaveBeenCalledWith('claim_rewarded_ad');
  });

  it('relays server refusals (flag off / capped) and failures', async () => {
    sb.rpc.mockResolvedValueOnce({ data: { granted: false, reason: 'disabled' }, error: null });
    expect((await claimRewardedAd()).reason).toBe('disabled');

    sb.rpc.mockResolvedValueOnce({ data: { granted: false, reason: 'capped' }, error: null });
    expect((await claimRewardedAd()).reason).toBe('capped');

    sb.rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    expect((await claimRewardedAd()).reason).toBe('failed');
  });
});
