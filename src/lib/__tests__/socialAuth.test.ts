/**
 * Garde-fous de la connexion Apple / Google (implémentation native).
 *
 * Deux propriétés valent d'être verrouillées :
 *
 *  - **la dormance** — sans client ID Google dans l'environnement, le bouton ne
 *    doit pas s'afficher. C'est ce qui permet d'embarquer le code avant que les
 *    consoles soient configurées, en plus des flags serveur ;
 *  - **l'annulation silencieuse** — refermer la feuille du fournisseur est le
 *    geste le plus courant de l'écran. Elle doit remonter comme un état normal,
 *    jamais comme une exception : `Auth.tsx` affiche une alerte sur tout ce qui
 *    est jeté, et une alerte « erreur » après un simple retour serait un bug
 *    visible par tous les joueurs.
 *
 * Le reste (échange du jeton contre une session) est vérifié sur le chemin
 * nominal, pour que la forme de l'appel à Supabase ne dérive pas en silence.
 */
const mockAppleSignIn = jest.fn();
const mockGoogleSignIn = jest.fn();
const mockHasPlayServices = jest.fn().mockResolvedValue(true);
const mockConfigure = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  signInAsync: (...args: unknown[]) => mockAppleSignIn(...args),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => mockConfigure(...args),
    hasPlayServices: (...args: unknown[]) => mockHasPlayServices(...args),
    signIn: (...args: unknown[]) => mockGoogleSignIn(...args),
  },
  isSuccessResponse: (r: { type?: string }) => r?.type !== 'cancelled',
  isErrorWithCode: (e: unknown) => typeof (e as { code?: string })?.code === 'string',
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED', IN_PROGRESS: 'IN_PROGRESS' },
}));

const mockSignInWithIdToken = jest.fn().mockResolvedValue({ error: null });
jest.mock('../supabase', () => ({
  supabase: { auth: { signInWithIdToken: (...a: unknown[]) => mockSignInWithIdToken(...a) } },
}));

jest.mock('../log', () => ({ log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

/** Recharge le module avec (ou sans) client ID : il le lit une fois au chargement. */
function loadModule(googleClientId?: string) {
  let mod: typeof import('../socialAuth');
  jest.isolateModules(() => {
    if (googleClientId) process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = googleClientId;
    else delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    mod = require('../socialAuth');
  });
  return mod!;
}

const CLIENT_ID = 'test-web.apps.googleusercontent.com';

beforeEach(() => {
  jest.clearAllMocks();
  mockSignInWithIdToken.mockResolvedValue({ error: null });
  mockHasPlayServices.mockResolvedValue(true);
});

describe('dormance', () => {
  it('cache le bouton Google tant que le client ID n’est pas configuré', () => {
    expect(loadModule().isGoogleSignInAvailable()).toBe(false);
  });

  it('l’expose une fois le client ID en place', () => {
    expect(loadModule(CLIENT_ID).isGoogleSignInAvailable()).toBe(true);
  });

  it('refuse de lancer une connexion Google non configurée plutôt que d’échouer côté SDK', async () => {
    await expect(loadModule().signInWithGoogle()).rejects.toThrow(/not configured/i);
    expect(mockGoogleSignIn).not.toHaveBeenCalled();
  });
});

describe('annulation', () => {
  it('traite la fermeture de la feuille Apple comme un état normal', async () => {
    mockAppleSignIn.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    await expect(loadModule().signInWithApple()).resolves.toBe('cancelled');
  });

  it('traite la fermeture de la feuille Google comme un état normal', async () => {
    mockGoogleSignIn.mockRejectedValue({ code: 'SIGN_IN_CANCELLED' });
    await expect(loadModule(CLIENT_ID).signInWithGoogle()).resolves.toBe('cancelled');
  });

  it('traite un choix de compte Google déjà en cours comme une annulation', async () => {
    mockGoogleSignIn.mockRejectedValue({ code: 'IN_PROGRESS' });
    await expect(loadModule(CLIENT_ID).signInWithGoogle()).resolves.toBe('cancelled');
  });

  it('laisse en revanche remonter une vraie panne Apple', async () => {
    mockAppleSignIn.mockRejectedValue(new Error('boom'));
    await expect(loadModule().signInWithApple()).rejects.toThrow('boom');
  });
});

describe('échange du jeton contre une session', () => {
  it('transmet le jeton Apple à Supabase', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-jwt' });
    await expect(loadModule().signInWithApple()).resolves.toBe('success');
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-jwt' });
  });

  it('transmet le jeton Google à Supabase, avec le client ID web en configuration', async () => {
    mockGoogleSignIn.mockResolvedValue({ type: 'success', data: { idToken: 'google-jwt' } });
    await expect(loadModule(CLIENT_ID).signInWithGoogle()).resolves.toBe('success');
    expect(mockConfigure).toHaveBeenCalledWith({ webClientId: CLIENT_ID });
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({ provider: 'google', token: 'google-jwt' });
  });

  it('signale une feuille Apple revenue sans jeton au lieu d’ouvrir une session vide', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: null });
    await expect(loadModule().signInWithApple()).rejects.toThrow(/identity token/i);
    expect(mockSignInWithIdToken).not.toHaveBeenCalled();
  });

  it('remonte le refus de Supabase', async () => {
    mockAppleSignIn.mockResolvedValue({ identityToken: 'apple-jwt' });
    mockSignInWithIdToken.mockResolvedValue({ error: new Error('invalid audience') });
    await expect(loadModule().signInWithApple()).rejects.toThrow('invalid audience');
  });
});
