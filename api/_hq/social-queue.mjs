// Choix de la prochaine vidéo à publier : partagé par le script de
// publication (social-video/publish/post.mjs) et la page « Vidéos » du tableau de bord /hq, qui
// rejoue ce même choix créneau après créneau pour montrer ce qui va partir.
// Aucun accès réseau ici : l'appelant fournit les releases et leurs fichiers.

export const STATE_TAG = 'shorts-state';
export const STATE_FILE = 'posted.json';
export const NEXT_TAG = 'shorts-next';

// Vidéos de l'app : seulement à partir de cette release (montage avec les
// bonnes réponses dites et une vraie accroche, le 10/10) ; les anciennes,
// jugées ratées le 7/10, ne partent plus.
export const DEFAULT_MIN_RELEASE_APP = 34;

// higher-lower-fr-v2.mp4 → { group: higher-lower-fr, lang: fr, variant: v2 }
export function parse(name) {
  const m = name.match(/^(.+)-([a-z]{2})-(v\d+)\.mp4$/);
  return m && { group: `${m[1]}-${m[2]}`, lang: m[2], variant: m[3] };
}

// Formats générés (globe, plus ou moins, quiz).
export const generated = (group) => /^(globe|plusmoins|quiz-)/.test(group);

// Une publication compte pour la cible du passage si elle est partie sur le
// service de cette cible.
export function postedFor(p, target) {
  if (target === 'social') return Boolean(p.zernio);
  if (target === 'youtube') return Boolean(p['upload-post']);
  return true;
}

// Alternance (social) : le quiz globe à midi, un mode de jeu animé le soir,
// différent d'un soir à l'autre (choix de Paul le 11/10).
export function kindFor(target, kind, parisHour) {
  if (target !== 'social') return '';
  return !kind || kind === 'auto' ? (parisHour < 16 ? 'globe' : 'jeu') : kind;
}

// Heure à Paris (formatToParts : en fr-FR, format() donne « 12 h », pas un nombre).
export function parisHourOf(date) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Paris' })
      .formatToParts(date)
      .find((part) => part.type === 'hour').value,
  );
}

/**
 * Vidéos encore jamais publiées pour la cible, une par partie.
 *   releases : [{ tagName, createdAt, publishedAt }] (toutes les releases du dépôt)
 *   assetsOf : (tagName) => noms des fichiers de la release
 */
function queue({ posted, releases: all, assetsOf, target, langs, minRelease }) {
  const done = new Set(posted.map((p) => p.key));
  // Formats générés : jusqu'au 12/10, la partie ne dépendait que de la date,
  // donc deux tournages du même jour avaient la même. Une partie déjà publiée
  // depuis une release du même jour est un doublon.
  const dayOf = Object.fromEntries(all.map((r) => [r.tagName, (r.publishedAt || r.createdAt || '').slice(0, 10)]));
  const postedDays = new Set(posted.filter((p) => generated(p.group)).map((p) => `${dayOf[p.tag]}|${p.group}`));
  const releases = all
    .filter((r) => /^shorts-\d+$/.test(r.tagName) && Number(r.tagName.slice(7)) >= minRelease)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (target === 'youtube') releases.reverse();
  if (all.some((r) => r.tagName === NEXT_TAG)) releases.unshift({ tagName: NEXT_TAG });

  // Les accroches v1 / v2 d'une même vidéo montrent la même partie : une seule
  // part par release, en alternant d'une release à l'autre pour comparer.
  const variantUses = {};
  for (const p of posted) variantUses[p.variant] = (variantUses[p.variant] || 0) + 1;

  const out = [];
  for (const { tagName } of releases) {
    const assets = assetsOf(tagName);
    const groups = {};
    for (const name of assets) {
      const info = parse(name);
      if (!info || !langs.includes(info.lang)) continue;
      (groups[info.group] ||= []).push({ ...info, name, tag: tagName, key: `${tagName}/${name}` });
    }
    for (const [group, variants] of Object.entries(groups).sort()) {
      if (posted.some((p) => p.tag === tagName && p.group === group)) continue;
      if (generated(group) && postedDays.has(`${dayOf[tagName]}|${group}`)) continue;
      const pick = variants
        .filter((v) => !done.has(v.key))
        .sort((a, b) => (variantUses[a.variant] || 0) - (variantUses[b.variant] || 0) || a.variant.localeCompare(b.variant))[0];
      if (pick) out.push({ ...pick, hasCaption: assets.includes(pick.name.replace(/\.mp4$/, '.txt')) });
    }
  }
  return out;
}

/**
 * File d'attente ordonnée pour un passage : la première vidéo est celle qui
 * part. Release `shorts-next` d'abord (vidéos montées à part, dans l'ordre de
 * leur nom, demande de Paul le 12/10), puis le format du créneau ; si sa file
 * est vide, les autres formats prennent le relais.
 *   state : contenu de posted.json ({ posted: [...] })
 *   kind  : déjà résolu par kindFor ('' pour YouTube)
 * Renvoie { todo, wanted } (wanted : la file du format demandé).
 */
export function upcoming({ state, releases, assetsOf, target, kind, langs, minRelease = 0, minReleaseApp = DEFAULT_MIN_RELEASE_APP }) {
  const posted = state.posted.filter((p) => postedFor(p, target));
  const isNext = (item) => item.tag === NEXT_TAG;
  const isGlobe = (item) => !isNext(item) && item.group.startsWith('globe');
  // Modes de jeu animés (style plateau TV) : plus ou moins, quiz-capitals…
  const isJeu = (item) => !isNext(item) && /^(plusmoins|quiz-)/.test(item.group);
  const releaseNumber = (item) => Number(item.tag.slice(7));
  // Jamais deux fois de suite le même jeu : parmi les vidéos de l'app, le jeu
  // publié il y a le plus longtemps (ou jamais) passe d'abord, puis la release
  // la plus récente.
  const lastPosted = {};
  for (const p of posted) {
    const game = p.group.replace(/-[a-z]{2}$/, '');
    lastPosted[game] = Math.max(lastPosted[game] || 0, Date.parse(p.at) || 0);
  }
  const gameOf = (item) => item.group.replace(/-[a-z]{2}$/, '');
  const all = queue({ posted, releases, assetsOf, target, langs, minRelease })
    .filter((item) => isNext(item) || isGlobe(item) || releaseNumber(item) >= minReleaseApp);
  const nexts = all.filter(isNext);
  const apps = all
    .filter((item) => !isNext(item) && !isGlobe(item) && !isJeu(item))
    .sort((a, b) => (lastPosted[gameOf(a)] || 0) - (lastPosted[gameOf(b)] || 0) || releaseNumber(b) - releaseNumber(a));
  const globes = all.filter(isGlobe);
  // Le mode publié il y a le plus longtemps d'abord, dans sa partie la plus récente.
  const jeux = all
    .filter(isJeu)
    .sort((a, b) => (lastPosted[gameOf(a)] || 0) - (lastPosted[gameOf(b)] || 0) || releaseNumber(b) - releaseNumber(a));
  const FALLBACK = { globe: [globes, jeux, apps], jeu: [jeux, apps, globes], plusmoins: [jeux, apps, globes], app: [apps, jeux, globes] };
  const order = [nexts, ...(FALLBACK[kind] ?? [all])];
  return { todo: [...new Set(order.flat())], wanted: order[1] };
}
