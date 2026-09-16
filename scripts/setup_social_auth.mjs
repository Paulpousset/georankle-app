/**
 * Câble la connexion Apple / Google une fois les consoles configurées.
 *
 * Tout le code applicatif est déjà en place et dormant (flags OFF) : il ne
 * manque que des valeurs que seules les consoles Apple / Google peuvent
 * produire. Ce script les injecte aux quatre endroits du dépôt, et fabrique le
 * client secret Apple — un JWT ES256 signé avec la clé .p8, que le dashboard
 * Supabase attend et qu'on ne peut pas écrire à la main.
 *
 * Chaque bloc est indépendant : lance-le avec ce que tu as, relance-le plus
 * tard avec le reste. Rien n'est écrasé par une valeur vide, et repasser deux
 * fois la même valeur ne change rien (idempotent).
 *
 *   node scripts/setup_social_auth.mjs \
 *     --google-web-client-id 1234-abc.apps.googleusercontent.com \
 *     --google-ios-scheme com.googleusercontent.apps.1234-def \
 *     --apple-p8 ~/Downloads/AuthKey_ABC123.p8 \
 *     --apple-key-id ABC123 \
 *     --apple-services-id com.paulpousset.geog.web
 *
 *   node scripts/setup_social_auth.mjs --check   # état, sans rien écrire
 */
import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Le Team ID Apple vit déjà dans eas.json (profil de soumission iOS). */
const TEAM_ID = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'))
  .submit?.production?.ios?.appleTeamId;

/**
 * Apple plafonne la durée d'un client secret à six mois et refuse le JWT au-delà.
 * 180 jours plutôt que les 182,6 de la borne exacte : la marge évite de dépendre
 * de la façon dont Apple compte ses six mois, pour deux jours de moins.
 */
const APPLE_SECRET_TTL_S = 180 * 24 * 3600;

const ENV_VAR = 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID';
const IOS_SCHEME_PLACEHOLDER = 'com.googleusercontent.apps.REMPLACER-PAR-LE-CLIENT-ID-IOS';

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const CHECK_ONLY = process.argv.includes('--check');
const done = [];
const todo = [];

/** Écrit un fichier, sauf en --check. */
function save(path, content) {
  if (!CHECK_ONLY) writeFileSync(path, content);
}

// ---------------------------------------------------------------- Google web
// Le client ID « Web application » est ce qui fait émettre un id_token
// vérifiable par Supabase — y compris pour les connexions natives iOS/Android.
// Il est public par design (il part dans le bundle), d'où sa place dans .env
// ET dans eas.json : sans lui dans le profil de build, le bouton Google reste
// caché dans l'app compilée (garde-fou de isGoogleSignInAvailable).
const webClientId = arg('google-web-client-id');
if (webClientId) {
  const envPath = join(ROOT, '.env');
  let env = readFileSync(envPath, 'utf8');
  const line = `${ENV_VAR}=${webClientId}`;
  if (new RegExp(`^${ENV_VAR}=`, 'm').test(env)) {
    env = env.replace(new RegExp(`^${ENV_VAR}=.*$`, 'm'), line);
  } else if (env.includes(`# ${ENV_VAR}=`)) {
    // Remplace le placeholder commenté déposé à l'implémentation.
    env = env.replace(new RegExp(`^# ${ENV_VAR}=.*$`, 'm'), line);
  } else {
    env += `\n${line}\n`;
  }
  save(envPath, env);
  done.push(`.env → ${ENV_VAR}`);

  const easPath = join(ROOT, 'eas.json');
  const eas = JSON.parse(readFileSync(easPath, 'utf8'));
  const profiles = Object.entries(eas.build ?? {}).filter(([, p]) => p.env);
  for (const [, profile] of profiles) profile.env[ENV_VAR] = webClientId;
  save(easPath, JSON.stringify(eas, null, 2) + '\n');
  done.push(`eas.json → ${ENV_VAR} (${profiles.length} profils)`);
} else {
  todo.push(`--google-web-client-id : client OAuth « Web application » (console Google Cloud)`);
}

// ---------------------------------------------------------------- Google iOS
// Le SDK Google natif exige que l'app déclare l'URL scheme du client iOS pour
// récupérer la redirection de la feuille de connexion.
const iosScheme = arg('google-ios-scheme');
if (iosScheme) {
  const appPath = join(ROOT, 'app.json');
  const app = JSON.parse(readFileSync(appPath, 'utf8'));
  const plugin = app.expo.plugins.find(
    (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin',
  );
  if (!plugin) throw new Error('Plugin google-signin introuvable dans app.json');
  plugin[1].iosUrlScheme = iosScheme;
  save(appPath, JSON.stringify(app, null, 2) + '\n');
  done.push('app.json → iosUrlScheme');
} else {
  const app = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));
  const plugin = app.expo.plugins.find(
    (p) => Array.isArray(p) && p[0] === '@react-native-google-signin/google-signin',
  );
  if (plugin?.[1]?.iosUrlScheme === IOS_SCHEME_PLACEHOLDER) {
    todo.push('--google-ios-scheme : « iOS URL scheme » du client OAuth iOS (console Google Cloud)');
  }
}

// -------------------------------------------------------- Apple client secret
// Supabase ne veut pas la clé .p8 mais un JWT ES256 signé avec elle. Node sait
// le faire sans dépendance : `ieee-p1363` produit la signature en R||S brut
// qu'attend JWS, là où la sortie DER par défaut serait rejetée.
function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function appleClientSecret({ p8, keyId, teamId, servicesId }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + APPLE_SECRET_TTL_S,
    aud: 'https://appleid.apple.com',
    sub: servicesId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('SHA256').update(signingInput).sign({
    key: p8,
    dsaEncoding: 'ieee-p1363',
  });
  return { token: `${signingInput}.${base64url(signature)}`, expiresAt: new Date((now + APPLE_SECRET_TTL_S) * 1000) };
}

const p8Path = arg('apple-p8');
const keyId = arg('apple-key-id');
const servicesId = arg('apple-services-id') ?? 'com.paulpousset.geog.web';
if (p8Path && keyId) {
  if (!TEAM_ID) throw new Error('Team ID Apple introuvable dans eas.json');
  const p8 = readFileSync(p8Path.replace(/^~/, process.env.HOME), 'utf8');
  const { token, expiresAt } = appleClientSecret({ p8, keyId, teamId: TEAM_ID, servicesId });
  console.log('\n── Client secret Apple (Supabase → Providers → Apple → Secret Key) ──\n');
  console.log(token);
  console.log(`\n⚠️  Expire le ${expiresAt.toLocaleDateString('fr-FR')} — à régénérer avant, sinon`);
  console.log('   la connexion Apple WEB cassera silencieusement (le natif iOS continuera).');
  console.log(`\n   Client IDs à coller juste au-dessus : ${servicesId},com.paulpousset.geog\n`);
  done.push('client secret Apple généré (affiché ci-dessus, non écrit sur disque)');
} else {
  todo.push('--apple-p8 + --apple-key-id : clé « Sign in with Apple » (developer.apple.com → Keys)');
}

// ------------------------------------------------------------------ Rapport
console.log(CHECK_ONLY ? '\nÉtat (aucune écriture) :' : '\nAppliqué :');
for (const line of done) console.log(`  ✅ ${line}`);
if (todo.length) {
  console.log('\nManque encore :');
  for (const line of todo) console.log(`  ⬜ ${line}`);
}
if (done.length && !CHECK_ONLY) {
  console.log('\nEnsuite : eas build (iOS + Android), tester, puis allumer les flags');
  console.log("  UPDATE public.feature_flags SET enabled = true WHERE key = 'social_login_google';");
}
console.log();
