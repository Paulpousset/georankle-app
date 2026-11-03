/**
 * Portails de jeux web (CrazyGames, GameDistribution) — la version de GeoG
 * qu'on dépose chez eux, en zip, et qu'ils servent dans une iframe.
 *
 * Tout dépend d'UNE variable lue au BUILD : `EXPO_PUBLIC_PORTAL`. Elle n'est
 * posée que par `scripts/build-portal.mjs`. Partout ailleurs (iOS, Android,
 * mises à jour OTA, playgeog.com) elle est absente : `PORTAL` vaut null, et
 * chaque fonction de ce module est un no-op. Rien ne change donc pour l'app.
 *
 * Ce que le portail impose, et où c'est appliqué :
 *  - pubs : uniquement celles du SDK du portail (monetization.ts route vers
 *    portalMidgame / portalRewarded, jamais AdSense ni AdMob) ;
 *  - pas de connexion externe (e-mail, Google, Apple) : on joue en invité
 *    (`CAN_SIGN_IN` à false cache tout ce qui mène à la connexion) ;
 *  - pas de lien vers l'App Store / Google Play ni vers une autre version
 *    jouable (`CAN_PROMOTE_APP` à false, liens de partage réécrits) ;
 *  - événements « gameplay start / stop » et « loading start / stop ».
 *
 * Import sûr partout (natif, jest) : window n'est touché que dans les fonctions.
 */
import { setSfxSuppressed } from './audioGate';
import { log } from './log';

export type PortalName = 'crazygames' | 'gamedistribution';

function parsePortal(raw: string | undefined): PortalName | null {
  return raw === 'crazygames' || raw === 'gamedistribution' ? raw : null;
}

/** Le portail visé par ce build, ou null (le cas normal). */
export const PORTAL: PortalName | null = parsePortal(process.env.EXPO_PUBLIC_PORTAL);
export const IS_PORTAL = PORTAL !== null;

/** Connexion / inscription proposées ? Jamais sur un portail (règle CrazyGames). */
export const CAN_SIGN_IN = !IS_PORTAL;

/** Boutons « Installer l'app » et liens vers playgeog.com ? Jamais sur un portail. */
export const CAN_PROMOTE_APP = !IS_PORTAL;

/**
 * Page publique du jeu sur le portail, pour les liens de partage (« défie un
 * ami »). Vide tant que le jeu n'est pas publié : le partage se fait alors
 * sans lien. À renseigner dans le build (`--url` de build-portal.mjs).
 */
export const PORTAL_GAME_URL = process.env.EXPO_PUBLIC_PORTAL_GAME_URL ?? '';

// ── Accès aux SDK (chargés par une balise <script> injectée au build) ───────

interface CrazyCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e: { code?: string; message?: string }) => void;
}

interface CrazySdk {
  init: () => Promise<void>;
  environment: 'crazygames' | 'local' | 'disabled' | string;
  ad: { requestAd: (type: 'midgame' | 'rewarded', cb: CrazyCallbacks) => void };
  game: {
    gameplayStart: () => void;
    gameplayStop: () => void;
    loadingStart: () => void;
    loadingStop: () => void;
    happytime: () => void;
    settings?: { muteAudio?: boolean };
    addSettingsChangeListener?: (fn: (s: { muteAudio?: boolean }) => void) => void;
  };
}

interface GdSdk {
  showAd: (type?: string) => Promise<unknown>;
  preloadAd?: (type?: string) => Promise<unknown>;
}

type PortalWindow = Window & {
  CrazyGames?: { SDK?: CrazySdk };
  gdsdk?: GdSdk;
  /** Posé par le <script> inline du build GameDistribution (voir build-portal.mjs). */
  __gdOnEvent?: (name: string) => void;
  __gdEvents?: string[];
};

function win(): PortalWindow | null {
  return typeof window === 'undefined' ? null : (window as PortalWindow);
}

let crazyReady: Promise<CrazySdk | null> | null = null;

/** Le SDK CrazyGames initialisé, ou null (pas ce portail, domaine non autorisé…). */
function crazy(): Promise<CrazySdk | null> {
  if (PORTAL !== 'crazygames') return Promise.resolve(null);
  if (!crazyReady) {
    crazyReady = (async () => {
      const sdk = win()?.CrazyGames?.SDK;
      if (!sdk) return null;
      try {
        await sdk.init();
      } catch (e) {
        log.warn('portal: CrazyGames init failed', e);
        return null;
      }
      // Hors des domaines CrazyGames, chaque appel lèverait.
      if (sdk.environment === 'disabled') return null;
      // « muteAudio » du portail passe avant notre propre réglage.
      const applyMute = (s?: { muteAudio?: boolean }) => setSfxSuppressed('portal', !!s?.muteAudio);
      applyMute(sdk.game.settings);
      sdk.game.addSettingsChangeListener?.(applyMute);
      return sdk;
    })();
  }
  return crazyReady;
}

// Le SDK GameDistribution signale tout par événements nommés. Les pubs ne
// mettent pas l'app en pause (elle n'a pas de pause globale) : c'est pourquoi
// elles ne passent qu'entre deux parties, quand rien ne tourne. On se contente
// de couper le son le temps de la pub.
const gdListeners = new Set<(name: string) => void>();
let gdBound = false;

function bindGd(): void {
  const w = win();
  if (PORTAL !== 'gamedistribution' || !w || gdBound) return;
  gdBound = true;
  const onEvent = (name: string) => {
    if (name === 'SDK_GAME_PAUSE') setSfxSuppressed('ad', true);
    if (name === 'SDK_GAME_START') setSfxSuppressed('ad', false);
    gdListeners.forEach((l) => l(name));
  };
  w.__gdOnEvent = onEvent;
  // Événements arrivés avant que le bundle ne soit chargé.
  (w.__gdEvents ?? []).splice(0).forEach(onEvent);
}

// ── Cycle de vie ────────────────────────────────────────────────────────────

/** À appeler au tout début du démarrage : initialise le SDK, signale le chargement. */
export function initPortal(): void {
  if (!IS_PORTAL) return;
  bindGd();
  void crazy().then((sdk) => {
    try {
      sdk?.game.loadingStart();
    } catch {
      /* rien */
    }
  });
}

let loadingStopped = false;

/** L'app est affichée et jouable : fin du chargement. */
export function portalLoadingDone(): void {
  if (!IS_PORTAL || loadingStopped) return;
  loadingStopped = true;
  void crazy().then((sdk) => {
    try {
      sdk?.game.loadingStop();
    } catch {
      /* rien */
    }
  });
}

let playing = false;

/**
 * Le joueur est (true) ou n'est plus (false) en pleine partie. Dédoublonné :
 * on peut l'appeler à chaque rendu.
 */
export function portalGameplay(on: boolean): void {
  if (!IS_PORTAL || on === playing) return;
  playing = on;
  void crazy().then((sdk) => {
    try {
      if (!sdk) return;
      if (on) sdk.game.gameplayStart();
      else sdk.game.gameplayStop();
    } catch {
      /* rien */
    }
  });
}

/** Un vrai exploit (record battu…) : la célébration du portail. À doser. */
export function portalHappyTime(): void {
  void crazy().then((sdk) => {
    try {
      sdk?.game.happytime();
    } catch {
      /* rien */
    }
  });
}

// ── Pubs ────────────────────────────────────────────────────────────────────

/** Combien de temps attendre qu'une pub démarre avant d'abandonner. */
const AD_START_TIMEOUT_MS = 8000;

/** Les pubs du portail sont-elles utilisables dans ce build ? */
export function portalAdsSupported(): boolean {
  const w = win();
  if (!w) return false;
  if (PORTAL === 'crazygames') return !!w.CrazyGames?.SDK;
  if (PORTAL === 'gamedistribution') return true; // le SDK peut arriver après le bundle
  return false;
}

function crazyAd(type: 'midgame' | 'rewarded'): Promise<'viewed' | 'unavailable'> {
  return crazy().then(
    (sdk) =>
      new Promise((resolve) => {
        if (!sdk) {
          resolve('unavailable');
          return;
        }
        let settled = false;
        const settle = (v: 'viewed' | 'unavailable') => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          setSfxSuppressed('ad', false);
          resolve(v);
        };
        const timer = setTimeout(() => settle('unavailable'), AD_START_TIMEOUT_MS);
        try {
          sdk.ad.requestAd(type, {
            adStarted: () => {
              clearTimeout(timer);
              setSfxSuppressed('ad', true);
            },
            adFinished: () => settle('viewed'),
            adError: () => settle('unavailable'),
          });
        } catch {
          settle('unavailable');
        }
      }),
  );
}

/**
 * GameDistribution : `showAd` se résout quand la pub est finie (ou qu'il n'y
 * en a pas). La récompense n'est due que si SDK_REWARDED_WATCH_COMPLETE est
 * arrivé entre-temps.
 */
function gdAd(type: 'interstitial' | 'rewarded'): Promise<'viewed' | 'dismissed' | 'unavailable'> {
  bindGd();
  const sdk = win()?.gdsdk;
  if (!sdk || typeof sdk.showAd !== 'function') return Promise.resolve('unavailable');
  return new Promise((resolve) => {
    let started = false;
    let completed = false;
    const listener = (name: string) => {
      if (name === 'SDK_GAME_PAUSE') started = true;
      if (name === 'SDK_REWARDED_WATCH_COMPLETE') completed = true;
    };
    gdListeners.add(listener);
    const done = (failed: boolean) => {
      gdListeners.delete(listener);
      setSfxSuppressed('ad', false);
      if (failed || !started) resolve('unavailable');
      else if (type === 'rewarded') resolve(completed ? 'viewed' : 'dismissed');
      else resolve('viewed');
    };
    try {
      sdk.showAd(type).then(
        () => done(false),
        () => done(true),
      );
    } catch {
      done(true);
    }
  });
}

/** Une pub « entre deux parties ». Se résout sur true si une pub a été vue. Ne lève jamais. */
export async function portalMidgame(): Promise<boolean> {
  if (PORTAL === 'crazygames') return (await crazyAd('midgame')) === 'viewed';
  if (PORTAL === 'gamedistribution') return (await gdAd('interstitial')) === 'viewed';
  return false;
}

/** Une pub récompensée, demandée par le joueur. Ne lève jamais. */
export async function portalRewarded(): Promise<'viewed' | 'dismissed' | 'unavailable'> {
  if (PORTAL === 'crazygames') return crazyAd('rewarded');
  if (PORTAL === 'gamedistribution') return gdAd('rewarded');
  return 'unavailable';
}

let prerollDone = false;

/**
 * GameDistribution demande une pub « pre-roll » au premier « Jouer » (c'est
 * même elle qui active le jeu chez eux). On l'enchaîne AVANT de lancer la
 * partie, pour que son chrono ne tourne pas derrière. CrazyGames gère son
 * pre-roll lui-même : rien à faire. Ailleurs : lance tout de suite.
 */
export function withPortalPreroll(start: () => void): () => void {
  return () => {
    if (PORTAL !== 'gamedistribution' || prerollDone) {
      start();
      return;
    }
    prerollDone = true;
    void gdAd('interstitial').finally(start);
  };
}

/** Remet le module à zéro (tests). */
export function __resetPortalForTests(): void {
  crazyReady = null;
  gdBound = false;
  gdListeners.clear();
  playing = false;
  loadingStopped = false;
  prerollDone = false;
}
