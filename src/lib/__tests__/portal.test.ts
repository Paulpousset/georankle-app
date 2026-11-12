/**
 * Build portail : le mode n'existe que si EXPO_PUBLIC_PORTAL est posé au
 * build — on le simule en rechargeant le module avec la variable.
 */
jest.mock('../log', () => ({ log: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

type PortalModule = typeof import('../portal');

function load(portal?: string): PortalModule {
  const prev = process.env.EXPO_PUBLIC_PORTAL;
  if (portal) process.env.EXPO_PUBLIC_PORTAL = portal;
  else delete process.env.EXPO_PUBLIC_PORTAL;
  let mod!: PortalModule;
  jest.isolateModules(() => {
    mod = require('../portal');
  });
  if (prev === undefined) delete process.env.EXPO_PUBLIC_PORTAL;
  else process.env.EXPO_PUBLIC_PORTAL = prev;
  return mod;
}

const w = window as unknown as Record<string, unknown>;

afterEach(() => {
  delete w.CrazyGames;
  delete w.gdsdk;
  delete w.__gdOnEvent;
  delete w.__gdEvents;
});

describe('hors portail (app, OTA, playgeog.com)', () => {
  it('ne change rien', async () => {
    const m = load();
    expect(m.IS_PORTAL).toBe(false);
    expect(m.CAN_SIGN_IN).toBe(true);
    expect(m.CAN_PROMOTE_APP).toBe(true);
    expect(m.portalAdsSupported()).toBe(false);
    expect(await m.portalMidgame()).toBe(false);
    const start = jest.fn();
    m.withPortalPreroll(start)();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('ignore une valeur inconnue', () => {
    expect(load('poki').IS_PORTAL).toBe(false);
  });
});

describe('CrazyGames', () => {
  function fakeSdk(adOutcome: 'finish' | 'error') {
    const calls: string[] = [];
    w.CrazyGames = {
      SDK: {
        environment: 'crazygames',
        init: jest.fn(async () => {}),
        ad: {
          requestAd: (type: string, cb: Record<string, (e?: unknown) => void>) => {
            calls.push(`ad:${type}`);
            if (adOutcome === 'finish') {
              cb.adStarted();
              cb.adFinished();
            } else cb.adError({ code: 'unfilled' });
          },
        },
        game: {
          gameplayStart: () => calls.push('start'),
          gameplayStop: () => calls.push('stop'),
          loadingStart: () => calls.push('loadingStart'),
          loadingStop: () => calls.push('loadingStop'),
          happytime: () => calls.push('happy'),
          settings: { muteAudio: false },
        },
      },
    };
    return calls;
  }

  it('interdit la connexion et la promotion de l’app', () => {
    const m = load('crazygames');
    expect(m.PORTAL).toBe('crazygames');
    expect(m.CAN_SIGN_IN).toBe(false);
    expect(m.CAN_PROMOTE_APP).toBe(false);
  });

  it('relaie le cycle de vie, dédoublonné', async () => {
    const calls = fakeSdk('finish');
    const m = load('crazygames');
    m.initPortal();
    m.portalLoadingDone();
    m.portalGameplay(true);
    m.portalGameplay(true);
    m.portalGameplay(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toEqual(['loadingStart', 'loadingStop', 'start', 'stop']);
  });

  it('pubs : vue → true / viewed, erreur → false / unavailable', async () => {
    fakeSdk('finish');
    let m = load('crazygames');
    expect(await m.portalMidgame()).toBe(true);
    expect(await m.portalRewarded()).toBe('viewed');
    fakeSdk('error');
    m = load('crazygames');
    expect(await m.portalMidgame()).toBe(false);
    expect(await m.portalRewarded()).toBe('unavailable');
  });

  it('domaine non autorisé (environment disabled) : aucune pub', async () => {
    const calls = fakeSdk('finish');
    (w.CrazyGames as { SDK: { environment: string } }).SDK.environment = 'disabled';
    const m = load('crazygames');
    expect(await m.portalMidgame()).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('GameDistribution', () => {
  function fakeGd(rewardCompletes: boolean, fill = true) {
    const shown: string[] = [];
    w.gdsdk = {
      showAd: (type: string) => {
        shown.push(type);
        const fire = w.__gdOnEvent as (n: string) => void;
        if (fill) {
          fire('SDK_GAME_PAUSE');
          if (type === 'rewarded' && rewardCompletes) fire('SDK_REWARDED_WATCH_COMPLETE');
          fire('SDK_GAME_START');
        }
        return Promise.resolve();
      },
    };
    return shown;
  }

  it('récompense seulement si la vidéo est allée au bout', async () => {
    fakeGd(true);
    let m = load('gamedistribution');
    m.initPortal();
    expect(await m.portalRewarded()).toBe('viewed');
    fakeGd(false);
    m = load('gamedistribution');
    m.initPortal();
    expect(await m.portalRewarded()).toBe('dismissed');
  });

  it('pas de pub servie → unavailable', async () => {
    fakeGd(true, false);
    const m = load('gamedistribution');
    m.initPortal();
    expect(await m.portalRewarded()).toBe('unavailable');
    expect(await m.portalMidgame()).toBe(false);
  });

  it('pre-roll une seule fois, et la partie ne démarre qu’après', async () => {
    const shown = fakeGd(true);
    const m = load('gamedistribution');
    m.initPortal();
    const start = jest.fn();
    m.withPortalPreroll(start)();
    expect(start).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(start).toHaveBeenCalledTimes(1);
    m.withPortalPreroll(start)();
    expect(start).toHaveBeenCalledTimes(2);
    expect(shown).toEqual(['interstitial']);
  });
});
