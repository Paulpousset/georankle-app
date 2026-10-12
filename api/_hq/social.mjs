/**
 * Source « Vidéos » : les prochaines publications automatiques (workflow
 * social-post.yml). On rejoue créneau par créneau le choix de
 * social-video/publish/queue.mjs, le même que le script de publication, à
 * partir des releases GitHub et de posted.json : ce qui s'affiche ici est ce
 * qui partira, tant qu'aucun nouveau tournage n'arrive entre-temps.
 *
 * Dépôt public : marche sans jeton. GITHUB_TOKEN (lecture du dépôt) est
 * facultatif : il relève la limite de l'API GitHub et donne accès aux
 * variables du dépôt (SOCIAL_POST_ENABLED, SOCIAL_POST_LANGS…).
 */
import { env, http } from './lib.mjs';
import {
  STATE_TAG, STATE_FILE, NEXT_TAG, DEFAULT_MIN_RELEASE_APP, kindFor, parisHourOf, postedFor, upcoming,
} from '../../social-video/publish/queue.mjs';

const REPO = () => env('GITHUB_REPOSITORY', 'Paulpousset/georankle-app');
const API = () => `https://api.github.com/repos/${REPO()}`;
const DAYS_AHEAD = 7;
const HISTORY = 15;

const ghHeaders = (accept = 'application/vnd.github+json') => {
  const token = env('GITHUB_TOKEN');
  return { accept, 'user-agent': 'georankle-hq', ...(token ? { authorization: `Bearer ${token}` } : {}) };
};

/** Fichier d'une release : par l'API avec jeton (dépôt privé possible), sinon lien public. */
async function assetText(asset) {
  if (env('GITHUB_TOKEN')) {
    const buf = await http(`${API()}/releases/assets/${asset.id}`, { headers: ghHeaders('application/octet-stream'), binary: true });
    return buf.toString('utf8');
  }
  const { text } = await http(asset.browser_download_url, { raw: true });
  return text;
}

/** Variables du dépôt lues par social-post.yml (jeton avec accès aux variables). */
async function repoVars() {
  if (!env('GITHUB_TOKEN')) return null;
  try {
    const r = await http(`${API()}/actions/variables?per_page=30`, { headers: ghHeaders() });
    return Object.fromEntries(r.variables.map((v) => [v.name, v.value.trim()]));
  } catch {
    return null;
  }
}

/** Zernio : comptes branchés (TikTok, Instagram…), si la clé est aussi dans Vercel. */
async function zernioPlatforms() {
  if (!env('ZERNIO_API_KEY')) return null;
  try {
    const r = await http('https://zernio.com/api/v1/accounts', { headers: { authorization: `Bearer ${env('ZERNIO_API_KEY')}` } });
    return (r.accounts ?? []).filter((a) => a.isActive !== false && a.enabled !== false).map((a) => a.platform);
  } catch {
    return null;
  }
}

/**
 * Créneaux des tâches planifiées de social-post.yml (heures UTC) :
 * social à 10:30 et 17:30, YouTube à 16:00 les 1, 4, 7… 28 du mois.
 */
function slots(now) {
  const out = [];
  const day0 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let d = 0; d <= DAYS_AHEAD; d++) {
    const base = day0 + d * 86400000;
    out.push({ at: new Date(base + 10.5 * 3600000), target: 'social' });
    if ((new Date(base).getUTCDate() - 1) % 3 === 0 && new Date(base).getUTCDate() <= 28) {
      out.push({ at: new Date(base + 16 * 3600000), target: 'youtube' });
    }
    out.push({ at: new Date(base + 17.5 * 3600000), target: 'social' });
  }
  // Un créneau passé depuis moins d'une heure peut encore partir (retard GitHub).
  return out.filter((s) => s.at.getTime() + 3600000 > now.getTime() && s.at.getTime() < now.getTime() + DAYS_AHEAD * 86400000);
}

const FORMAT_NAMES = {
  plusmoins: 'Plus ou moins', 'quiz-capitals': 'Quiz capitales', 'quiz-flags': 'Quiz drapeaux', 'quiz-silhouette': 'Quiz silhouettes',
  capitals: 'App · capitales', flags: 'App · drapeaux', 'higher-lower': 'App · plus ou moins',
};
function formatOf(item) {
  if (item.tag === NEXT_TAG) return { kind: 'next', label: 'Prioritaire' };
  const game = item.group.replace(/-[a-z]{2}$/, '').replace(/\d+$/, '');
  if (game === 'globe') return { kind: 'globe', label: 'Globe' };
  if (/^(plusmoins|quiz-)/.test(item.group)) return { kind: 'jeu', label: FORMAT_NAMES[game] ?? game };
  return { kind: 'app', label: FORMAT_NAMES[game] ?? `App · ${game}` };
}

export async function social() {
  const now = new Date();
  const [list, vars, zernio] = await Promise.all([
    http(`${API()}/releases?per_page=100`, { headers: ghHeaders() }),
    repoVars(),
    zernioPlatforms(),
  ]);
  const byTag = Object.fromEntries(list.map((r) => [r.tag_name, r]));
  const releases = list.map((r) => ({ tagName: r.tag_name, createdAt: r.created_at, publishedAt: r.published_at }));
  const assetsOf = (tag) => (byTag[tag]?.assets ?? []).map((a) => a.name);
  const assetOf = (tag, name) => byTag[tag]?.assets.find((a) => a.name === name);

  const stateAsset = assetOf(STATE_TAG, STATE_FILE);
  const state = stateAsset ? JSON.parse(await assetText(stateAsset)) : { posted: [] };

  // Réglages de social-post.yml (valeurs par défaut si les variables ne sont pas lisibles).
  const langs = (vars?.SOCIAL_POST_LANGS || 'fr').split(/[\s,]+/).filter(Boolean);
  const minRelease = Number(vars?.SOCIAL_POST_MIN_RELEASE || 23);
  const enabled = vars ? vars.SOCIAL_POST_ENABLED !== 'false' : null;
  const socialPlatforms = zernio ?? ['tiktok', 'instagram'];
  const youtubePlatforms = (vars?.UPLOAD_POST_PLATFORMS || 'youtube').split(/[\s,]+/).filter(Boolean);

  // Simulation : chaque créneau prend la tête de file, puis compte comme publié.
  const sim = { posted: [...state.posted] };
  const out = [];
  for (const slot of slots(now)) {
    const { target } = slot;
    const kind = kindFor(target, 'auto', parisHourOf(slot.at));
    const last = sim.posted.filter((p) => postedFor(p, target)).map((p) => Date.parse(p.at)).filter(Boolean).sort().pop();
    // MIN_GAP_HOURS = 3 sur les tâches planifiées : créneau déjà rempli.
    if (last && slot.at - last < 3 * 3600000) {
      if (slot.at <= now) continue;
      out.push({ at: slot.at.toISOString(), target, kind, skipped: 'Publication manuelle récente : ce créneau ne publiera rien.' });
      continue;
    }
    const { todo, wanted } = upcoming({ state: sim, releases, assetsOf, target, kind, langs, minRelease, minReleaseApp: DEFAULT_MIN_RELEASE_APP });
    const item = todo[0];
    const row = { at: slot.at.toISOString(), target, kind, platforms: target === 'social' ? socialPlatforms : youtubePlatforms, left: todo.length };
    if (!item) {
      out.push({ ...row, skipped: 'File vide : rien ne partira.' });
      continue;
    }
    const video = assetOf(item.tag, item.name);
    row.item = {
      key: item.key, tag: item.tag, name: item.name, group: item.group, variant: item.variant,
      format: formatOf(item), hasCaption: item.hasCaption, assetId: video?.id ?? null, size: video?.size ?? null,
      releaseAt: byTag[item.tag]?.created_at ?? null,
    };
    row.fallback = item.tag !== NEXT_TAG && kind && !wanted.includes(item) ? true : undefined;
    out.push(row);
    sim.posted.push({
      key: item.key, tag: item.tag, group: item.group, variant: item.variant, at: slot.at.toISOString(),
      ...(target === 'social' ? { zernio: socialPlatforms } : { 'upload-post': youtubePlatforms }),
    });
  }

  // Légendes : celles qui vont partir, et celles des dernières publications.
  const history = [...state.posted].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, HISTORY);
  const caption = async (tag, name) => {
    const a = assetOf(tag, name.replace(/\.mp4$/, '.txt'));
    return a ? (await assetText(a).catch(() => null))?.trim() ?? null : null;
  };
  await Promise.all([
    ...out.filter((r) => r.item?.hasCaption).map(async (r) => { r.item.caption = await caption(r.item.tag, r.item.name); }),
    ...history.map(async (p) => { p.caption = await caption(p.tag, p.key.split('/').pop()); }),
  ]);

  // Alertes : ce qui risque de faire un doublon ou une erreur. Deux rendus
  // d'une même partie ont presque la même taille (à 0,2 % près) ; deux parties
  // différentes, rarement. Les empreintes, elles, changent à chaque rendu.
  const sizeOf = (p) => assetOf(p.tag, p.key.split('/').pop())?.size;
  // Une même vidéo sur TikTok et sur YouTube n'est pas un doublon : on compare cible par cible.
  const seen = state.posted.map((p) => ({
    target: p.zernio ? 'social' : 'youtube', group: p.group, size: sizeOf(p), what: `publiée le ${String(p.at).slice(0, 10)} (${p.tag})`,
  }));
  for (const r of out) {
    if (!r.item) continue;
    const w = [];
    if (!r.item.hasCaption) w.push('Pas de légende (.txt absent) : la vidéo partira sans texte.');
    else if (!r.item.caption) w.push('Légende illisible.');
    const { size, group } = r.item;
    const twin = size && seen.find((x) => x.target === r.target && x.group === group && x.size && Math.abs(x.size - size) / size < 0.002);
    if (twin) w.push(`Sans doute la même partie que la vidéo ${twin.what} : taille quasi identique.`);
    seen.push({ target: r.target, group, size, what: `prévue le ${r.at.slice(0, 10)} (${r.item.tag})` });
    if (r.fallback) w.push(`File « ${r.kind} » vide : un autre format part à la place.`);
    r.warnings = w;
  }

  return {
    repo: REPO(),
    settings: { enabled, langs, minRelease, varsRead: Boolean(vars), zernioRead: Boolean(zernio) },
    slots: out,
    history: history.map((p) => ({
      at: p.at, key: p.key, tag: p.tag, platforms: [...(p.zernio ?? []), ...(p['upload-post'] ?? [])], caption: p.caption ?? null,
      format: formatOf(p),
    })),
  };
}

/** Lien temporaire (quelques minutes) vers la vidéo, pour l'aperçu dans la page. */
export async function socialPreview(id) {
  if (!/^\d{1,12}$/.test(String(id))) throw new Error('id invalide');
  const asset = await http(`${API()}/releases/assets/${id}`, { headers: ghHeaders() });
  if (!asset.name.endsWith('.mp4')) throw new Error('pas une vidéo');
  if (!env('GITHUB_TOKEN')) return asset.browser_download_url;
  const res = await fetch(`${API()}/releases/assets/${id}`, {
    headers: ghHeaders('application/octet-stream'),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const url = res.headers.get('location');
  if (!url) throw new Error(`GitHub ${res.status}`);
  return url;
}
