#!/usr/bin/env node
/**
 * play_promote.mjs — promouvoir un versionCode déjà uploadé vers un autre canal
 * Play, notes de version comprises.
 *
 *   node scripts/play_promote.mjs --version-code 19 --track production \
 *        --notes store-listing/release-notes-v5.4.0.md
 *
 * Pourquoi ce script plutôt que `eas submit` : eas RÉ-UPLOADE l'artefact, et
 * Play refuse un versionCode déjà connu. Ici on ne fait qu'assigner le bundle
 * existant à un autre canal — et on y colle les notes de version, ce qu'eas ne
 * sait pas faire (il faut sinon les recoller à la main dans la Play Console).
 *
 * Le fichier de notes est le format maison de store-listing/ : un bloc
 * <fr-FR>…</fr-FR> par langue.
 *
 * Auth : google-service-account.json (gitignoré), JWT RS256 signé avec crypto —
 * pas de dépendance googleapis à installer pour ~60 lignes d'appels REST.
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const VERSION_CODE = Number(arg('version-code'));
const TRACK = arg('track', 'production');
const NOTES = arg('notes');
const PKG = arg('package', 'com.paulpousset.geog');
const KEY = arg('key', './google-service-account.json');
const DRY = process.argv.includes('--dry-run');

if (!VERSION_CODE) {
  console.error('usage: play_promote.mjs --version-code N [--track production] [--notes FILE] [--dry-run]');
  process.exit(2);
}

const sa = JSON.parse(readFileSync(KEY, 'utf8'));

/** Jeton OAuth2 via JWT bearer — le flux "service account" sans SDK. */
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const claim = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })}`;
  const sig = createSign('RSA-SHA256').update(claim).sign(sa.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${claim}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`auth: ${JSON.stringify(j)}`);
  return j.access_token;
}

const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
let TOKEN;
async function api(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...opts.headers },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} → ${res.status} ${body}`);
  return body ? JSON.parse(body) : {};
}

/** <fr-FR>texte</fr-FR> → [{language, text}] ; Play plafonne à 500 caractères. */
function parseNotes(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  for (const m of src.matchAll(/<([a-z]{2}-[A-Z]{2})>\n([\s\S]*?)\n<\/\1>/g)) {
    const text = m[2].trim();
    if (text.length > 500) throw new Error(`notes ${m[1]} : ${text.length} caractères > 500`);
    out.push({ language: m[1], text });
  }
  if (!out.length) throw new Error(`aucun bloc <xx-XX> dans ${file}`);
  return out;
}

const releaseNotes = NOTES ? parseNotes(NOTES) : undefined;
console.log(`→ ${PKG} : vc ${VERSION_CODE} vers « ${TRACK} »${releaseNotes ? ` (${releaseNotes.map((n) => n.language).join(', ')})` : ' (sans notes)'}`);

TOKEN = await token();

// L'édition est un brouillon transactionnel : rien n'est public avant commit().
const edit = await api('/edits', { method: 'POST' });
try {
  const bundles = await api(`/edits/${edit.id}/bundles`);
  const known = (bundles.bundles || []).map((b) => b.versionCode);
  if (!known.includes(VERSION_CODE)) {
    throw new Error(`vc ${VERSION_CODE} inconnu de Play. Uploadés : ${known.join(', ') || '(aucun)'}`);
  }

  const release = { versionCodes: [String(VERSION_CODE)], status: 'completed' };
  if (releaseNotes) release.releaseNotes = releaseNotes;

  if (DRY) {
    console.log(JSON.stringify({ track: TRACK, releases: [release] }, null, 2));
    await api(`/edits/${edit.id}`, { method: 'DELETE' });
    console.log('✔ --dry-run : édition annulée, rien de publié.');
    process.exit(0);
  }

  await api(`/edits/${edit.id}/tracks/${TRACK}`, {
    method: 'PUT',
    body: JSON.stringify({ track: TRACK, releases: [release] }),
  });
  await api(`/edits/${edit.id}:commit`, { method: 'POST' });
  console.log(`✅ vc ${VERSION_CODE} publié sur « ${TRACK} ».`);
} catch (e) {
  await api(`/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {});
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
