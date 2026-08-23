/**
 * @jest-environment jsdom
 * @jest-environment-options {"url": "https://playgeog.com/play"}
 */
/**
 * `analytics.web.ts` est la surface la plus fragile du produit côté mesure :
 * c'est elle qui fait exister playgeog.com dans PostHog (pages vues,
 * attribution), et une régression y est invisible — les chiffres se contentent
 * de retomber à zéro. D'où ces garde-fous.
 *
 * Metro choisit `.web.ts` pour la plateforme web ; Jest tourne en « ios », donc
 * le module est requis explicitement par son chemin. L'URL du DOM simulé est
 * celle de la prod : sur localhost le module vise PostHog en direct, faute de
 * réécriture /ph côté serveur de dev.
 */
const mockInit = jest.fn();
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockRegister = jest.fn();

jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: mockInit,
    capture: mockCapture,
    identify: mockIdentify,
    reset: mockReset,
    register: mockRegister,
  },
}));

function loadWebAnalytics(): typeof import('../analytics.web') {
  let mod: typeof import('../analytics.web');
  jest.isolateModules(() => {
    mod = require('../analytics.web');
  });
  // @ts-expect-error assigned inside isolateModules' synchronous callback
  return mod;
}

const ORIGINAL_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;

afterEach(() => {
  [mockInit, mockCapture, mockIdentify, mockReset, mockRegister].forEach((m) => m.mockClear());
});

afterAll(() => {
  process.env.EXPO_PUBLIC_POSTHOG_KEY = ORIGINAL_KEY;
});

describe('web analytics', () => {
  let analytics: typeof import('../analytics.web');
  // init() et register() n'ont lieu qu'au chargement du module : on fige leurs
  // arguments ici, avant que l'afterEach global ne remette les mocks à zéro.
  let initKey: string;
  let initOptions: Record<string, unknown>;
  let registerCalls: unknown[][];

  beforeAll(() => {
    process.env.EXPO_PUBLIC_POSTHOG_KEY = 'phc_test_key';
    jest.resetModules();
    analytics = loadWebAnalytics();
    [initKey, initOptions] = mockInit.mock.calls[0];
    registerCalls = [...mockRegister.mock.calls];
  });

  it('ingests through the same-origin proxy, not posthog.com', () => {
    // Un appel direct à posthog.com est coupé par les bloqueurs de pub : c'est
    // ce qui rendait les chiffres web partiels.
    expect(initKey).toBe('phc_test_key');
    expect(initOptions.api_host).toBe(`${window.location.origin}/ph`);
    expect(initOptions.api_host).not.toContain('posthog.com');
  });

  it('leaves pageviews to trackScreen (the URL never changes in the SPA)', () => {
    expect(initOptions.capture_pageview).toBe(false);
  });

  it('tags the surface so web and native never share a bucket', () => {
    expect(registerCalls).toContainEqual([{ platform: 'web', surface: 'app' }]);
  });

  it('emits a $pageview with a distinct path per screen', () => {
    // Sans chemin virtuel, le rapport « Pages » de PostHog n'aurait qu'une
    // seule ligne (/play) pour tout le jeu.
    analytics.trackScreen('shop', { play_type: 'solo' });
    expect(mockCapture).toHaveBeenCalledWith('$pageview', {
      play_type: 'solo',
      screen: 'shop',
      $current_url: `${window.location.origin}/play/shop`,
      // Doit accompagner $current_url : c'est `$pathname` que lit Web Analytics.
      $pathname: '/play/shop',
    });
  });

  it('forwards track / identify / resetIdentity and drops undefined props', () => {
    analytics.track('game_started', { mode: 'classic', extra: undefined });
    expect(mockCapture).toHaveBeenCalledWith('game_started', { mode: 'classic' });

    analytics.identify('user-1');
    expect(mockIdentify).toHaveBeenCalledWith('user-1', undefined);

    analytics.resetIdentity();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});

describe('web analytics without a key', () => {
  let analytics: typeof import('../analytics.web');

  beforeAll(() => {
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    jest.resetModules();
    analytics = loadWebAnalytics();
  });

  it('never initialises and no-ops every helper', () => {
    expect(mockInit).not.toHaveBeenCalled();
    expect(() => {
      analytics.track('signed_up');
      analytics.trackScreen('menu');
      analytics.identify('user-1');
      analytics.resetIdentity();
    }).not.toThrow();
    expect(mockCapture).not.toHaveBeenCalled();
  });
});
