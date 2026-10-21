// File d'attente des vidéos concepts (release shorts-next), pour le lot automatique
// de social-concepts.yml.
//
//   node next-lot.mjs count <lang>        # nombre de vidéos à produire pour tenir
//                                         # TARGET vidéos en attente (défaut 14,
//                                         # une semaine à 2 publications par jour)
//   node next-lot.mjs queue <lang> <dir>  # ajoute les vidéos de <dir> à shorts-next,
//                                         # numérotées à la suite, et à la fin de
//                                         # l'ordre de /hq (order.json)
//
// Variables : GITHUB_REPOSITORY, GH_TOKEN, TARGET, DRY_RUN (1 = ne rien envoyer).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = process.env.GITHUB_REPOSITORY || 'Paulpousset/georankle-app';
const TARGET = Number(process.env.TARGET || 14);
const DRY = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const [, , cmd, lang, dir] = process.argv;
if (!['count', 'queue'].includes(cmd) || !/^[a-z]{2}$/.test(lang ?? '')) throw new Error('usage : node next-lot.mjs count|queue <lang> [dossier]');

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const work = mkdtempSync(join(tmpdir(), 'next-lot-'));
async function stateFile(name, fallback) {
  // Lien public d'abord (dépôt public), sinon gh (dépôt privé).
  const res = await fetch(`https://github.com/${REPO}/releases/download/shorts-state/${name}`).catch(() => null);
  if (res?.ok) return res.json();
  try {
    gh('release', 'download', 'shorts-state', '--repo', REPO, '--pattern', name, '--dir', work, '--clobber');
    return JSON.parse(readFileSync(join(work, name), 'utf8'));
  } catch {
    return fallback;
  }
}

const assets = JSON.parse(gh('api', `repos/${REPO}/releases/tags/shorts-next`, '--jq', '[.assets[].name]'));
const posted = (await stateFile('posted.json', { posted: [] })).posted;
const order = await stateFile('order.json', { pinned: [], skipped: [] });
// Publiée sur TikTok / Instagram (YouTube a sa propre file, plus lente).
const done = new Set(posted.filter((p) => !(p['upload-post'] && !p.zernio)).map((p) => p.key));
const mine = assets.filter((n) => n.endsWith(`-${lang}-v1.mp4`));
const pinned = new Set(order.pinned ?? []);
const skipped = new Set(order.skipped ?? []);
// En attente : pas encore publiée, pas retirée, et dans l'ordre de /hq ou au
// format court (les anciens lots longs non rangés ne comptent pas).
const pending = mine.filter((n) => {
  const key = `shorts-next/${n}`;
  return !done.has(key) && !skipped.has(key) && (pinned.has(key) || /^\d+-court-/.test(n));
});

if (cmd === 'count') {
  const need = Math.max(0, TARGET - pending.length);
  console.error(`[${lang}] ${pending.length} vidéo(s) en attente dans shorts-next, objectif ${TARGET} → ${need} à produire`);
  console.log(need);
  process.exit(0);
}

// queue : court-03-frontieres-kenya-h1.mp4 → 44-court-frontieres-kenya-h1-fr-v1.mp4
let next = Math.max(0, ...mine.map((n) => Number(n.match(/^(\d+)-/)?.[1] ?? 0))) + 1;
const files = [];
const keys = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp4')).sort()) {
  const base = f.replace(/\.mp4$/, '').replace(/^(court|lot)-\d+-/, '$1-');
  const name = `${String(next++).padStart(2, '0')}-${base}-${lang}-v1`;
  copyFileSync(join(dir, f), join(work, `${name}.mp4`));
  files.push(join(work, `${name}.mp4`));
  try {
    copyFileSync(join(dir, f.replace(/\.mp4$/, '.txt')), join(work, `${name}.txt`));
    files.push(join(work, `${name}.txt`));
  } catch {
    /* pas de texte : la vidéo part sans légende */
  }
  keys.push(`shorts-next/${name}.mp4`);
}
console.log(keys.join('\n'));
if (!files.length) throw new Error(`aucune vidéo dans ${dir}`);
if (DRY) {
  console.log('Simulation : rien n\'est envoyé.');
  process.exit(0);
}
gh('release', 'upload', 'shorts-next', ...files, '--repo', REPO, '--clobber');
// Relu juste avant d'écrire : /hq a pu changer l'ordre pendant le rendu.
const fresh = await stateFile('order.json', { pinned: [], skipped: [] });
fresh.pinned = [...new Set([...(fresh.pinned ?? []), ...keys])];
writeFileSync(join(work, 'order.json'), JSON.stringify(fresh, null, 2));
gh('release', 'upload', 'shorts-state', join(work, 'order.json'), '--repo', REPO, '--clobber');
console.log(`${keys.length} vidéo(s) ajoutée(s) à shorts-next et à l'ordre de /hq.`);
