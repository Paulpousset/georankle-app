/**
 * `analytics.ts` builds its PostHog client once at module load from
 * `EXPO_PUBLIC_POSTHOG_KEY`, so each scenario sets the env then loads the module
 * fresh via `jest.isolateModules`.
 */
const mockCapture = jest.fn();
const mockScreen = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockRegister = jest.fn();

jest.mock('posthog-react-native', () =>
  jest.fn().mockImplementation(() => ({
    capture: mockCapture,
    screen: mockScreen,
    identify: mockIdentify,
    reset: mockReset,
    register: mockRegister,
  })),
);

function loadAnalytics(): typeof import('../analytics') {
  let mod: typeof import('../analytics');
  jest.isolateModules(() => {
    mod = require('../analytics');
  });
  // @ts-expect-error assigned inside isolateModules' synchronous callback
  return mod;
}

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

afterEach(() => {
  mockCapture.mockClear();
  mockScreen.mockClear();
  mockIdentify.mockClear();
  mockReset.mockClear();
  mockRegister.mockClear();
});

afterAll(() => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = ORIGINAL_KEY;
});

describe('analytics with a PostHog key', () => {
  let analytics: typeof import('../analytics');
  beforeAll(() => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    jest.resetModules();
    analytics = loadAnalytics();
  });

  it('builds a client and forwards track() to capture()', () => {
    expect(analytics.posthog).not.toBeNull();
    analytics.track('signed_up', { method: 'email' });
    expect(mockCapture).toHaveBeenCalledWith('signed_up', { method: 'email' });
  });

  it('drops undefined props but keeps null', () => {
    analytics.track('game_started', { mode: 'classic', extra: undefined, parent: null });
    expect(mockCapture).toHaveBeenCalledWith('game_started', { mode: 'classic', parent: null });
  });

  it('passes through undefined when no props are given', () => {
    analytics.track('logged_out');
    expect(mockCapture).toHaveBeenCalledWith('logged_out', undefined);
  });

  it('forwards trackScreen / identify / resetIdentity', () => {
    analytics.trackScreen('Shop');
    expect(mockScreen).toHaveBeenCalledWith('Shop', undefined);

    analytics.identify('user-1', { plan: 'free' });
    expect(mockIdentify).toHaveBeenCalledWith('user-1', { plan: 'free' });

    analytics.resetIdentity();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

});

describe('platform tagging', () => {
  it('registers the surface as a super property at load time', () => {
    // Sans cette super-propriété, les events web, iOS et Android tombent dans
    // le même seau et tout comptage par surface est faux. `register` est appelé
    // à la construction du client, d'où le rechargement du module ici.
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    jest.resetModules();
    loadAnalytics();
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ platform: expect.any(String), surface: 'app' }),
    );
  });
});

describe('analytics without a key (disabled)', () => {
  let analytics: typeof import('../analytics');
  beforeAll(() => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    jest.resetModules();
    analytics = loadAnalytics();
  });

  it('exposes a null client and no-ops every helper without throwing', () => {
    expect(analytics.posthog).toBeNull();
    expect(() => {
      analytics.track('signed_up', { a: 1 });
      analytics.trackScreen('Shop');
      analytics.identify('user-1');
      analytics.resetIdentity();
    }).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockScreen).not.toHaveBeenCalled();
  });
});
