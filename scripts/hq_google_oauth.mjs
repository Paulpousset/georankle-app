#!/usr/bin/env node
/**
 * Obtient le jeton de rafraîchissement Google du tableau de bord /hq
 * (AdMob, AdSense, Search Console, Play vitals — lecture seule).
 *
 *   node scripts/hq_google_oauth.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Client OAuth de type « Application de bureau » créé dans le projet GCP
 * geog-play. Ouvre le navigateur, écoute le retour sur 127.0.0.1, puis
 * affiche les trois variables à coller dans Vercel (voir HQ_SETUP.md).
 */
import http from 'node:http';
import { exec } from 'node:child_process';

const [clientId, clientSecret] = process.argv.slice(2);
if (!clientId || !clientSecret) {
  console.error('Usage : node scripts/hq_google_oauth.mjs <CLIENT_ID> <CLIENT_SECRET>');
  process.exit(1);
}

const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/`;
const scopes = [
  'https://www.googleapis.com/auth/admob.readonly',
  'https://www.googleapis.com/auth/adsense.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/playdeveloperreporting',
  'https://www.googleapis.com/auth/androidpublisher',
];
const auth =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

const server = http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get('code');
  if (!code) return res.end('En attente…');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirect,
      grant_type: 'authorization_code',
    }),
  }).then((x) => x.json());
  res.end(r.refresh_token ? 'OK — tu peux fermer cet onglet.' : `Erreur : ${JSON.stringify(r)}`);
  server.close();
  if (!r.refresh_token) {
    console.error('Pas de refresh_token :', r);
    process.exit(1);
  }
  console.log('\nÀ ajouter dans Vercel (Production) :\n');
  console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${r.refresh_token}\n`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('Ouverture du navigateur… sinon ouvre :\n' + auth);
  exec(`open "${auth}"`);
});
