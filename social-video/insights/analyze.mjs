// Analyse des stats relevées par collect.mjs et réglages des prochaines vidéos.
//
//   node analyze.mjs   (après collect.mjs)
//   TUNING_IN  tuning.json précédent (release shorts-state), sinon tuning.default.json
//   OUT        dossier de collect.mjs (défaut social-video/insights/out)
//
// Écrit dans OUT :
//   tuning.json : réglages lus par composer/concepts.mjs (mélange des concepts,
//                 poids des accroches, format court) + constats ;
//   rapport.md  : le même bilan en clair (aussi dans le résumé GitHub Actions).
//
// Ce que les API donnent vraiment (Zernio, octobre 2026) : vues, likes,
// commentaires, partages, enregistrements, abonnés gagnés (TikTok), durée
// moyenne regardée et taux de visionnage complet. Pas de courbe de rétention
// seconde par seconde pour TikTok ni Instagram : « partir avant le début » se
// lit donc à la durée moyenne regardée (moins de 3 s = l'accroche ne retient
// pas), et au taux de « swipe » Instagram s'il apparaît dans les champs.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || join(HERE, 'out');
const DEFAULT = JSON.parse(readFileSync(join(HERE, 'tuning.default.json'), 'utf8'));
const prev = process.env.TUNING_IN && existsSync(process.env.TUNING_IN) ? JSON.parse(readFileSync(process.env.TUNING_IN, 'utf8')) : DEFAULT;

// Les accroches de la version vivante (écrites entre deux relevés) + celles
// ajoutées dans le dépôt depuis.
const hooks = structuredClone(prev.hooks ?? {});
for (const [concept, byLang] of Object.entries(DEFAULT.hooks)) {
  for (const [lang, list] of Object.entries(byLang)) {
    const mine = ((hooks[concept] ||= {})[lang] ||= []);
    for (const h of list) if (!mine.some((x) => x.id === h.id)) mine.push(h);
  }
}
const rules = { ...DEFAULT.rules, ...prev.rules };
const ATLAS = Object.keys(DEFAULT.mix);

const all = JSON.parse(readFileSync(join(OUT, 'posts.json'), 'utf8'));
const rows = all
  .filter((r) => r.key && r.ageHours >= rules.minAgeHours && r.views > 0)
  .map((r) => ({ ...r, watchPct: r.avgWatchS != null && r.durationS ? Math.min(1, r.avgWatchS / r.durationS) : null }));

const mean = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const sum = (rs, k) => rs.reduce((a, r) => a + (r[k] ?? 0), 0);
function stats(rs) {
  const views = sum(rs, 'views');
  return {
    n: rs.length,
    views: mean(rs.map((r) => r.views)),
    avgWatchS: mean(rs.map((r) => r.avgWatchS)),
    durationS: mean(rs.map((r) => r.durationS)),
    watchPct: mean(rs.map((r) => r.watchPct)),
    completion: mean(rs.map((r) => r.completionRate)),
    skipRate: mean(rs.map((r) => r.skipRate)),
    likeRate: views ? sum(rs, 'likes') / views : null,
    commentRate: views ? sum(rs, 'comments') / views : null,
    shareRate: views ? sum(rs, 'shares') / views : null,
    followRate: views && rs.some((r) => r.follows != null) ? sum(rs, 'follows') / views : null,
  };
}
// Note d'une vidéo : la part regardée (ce que TikTok et Instagram récompensent),
// un peu relevée par les likes et les partages.
const score = (s) => (s.watchPct == null ? null : s.watchPct * (1 + 5 * (s.likeRate ?? 0) + 10 * (s.shareRate ?? 0)));
const groupBy = (rs, f) => rs.reduce((acc, r) => ((acc[f(r)] ||= []).push(r), acc), {});

// ───────────────────────────── Constats ─────────────────────────────
// Sur TikTok d'abord : chaque vidéo y est montrée au même petit groupe test
// (250 à 300 vues), donc les chiffres se comparent d'une vidéo à l'autre.
const findings = [];
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const sec = (x) => (x == null ? '—' : `${x.toFixed(1).replace('.', ',')} s`);
function diagnose(label, s, ig) {
  const out = [];
  if (s.n < rules.minPosts) return out;
  const hookFail = (s.avgWatchS != null && s.avgWatchS < rules.hookFailWatchS) || (ig?.skipRate != null && ig.skipRate > rules.hookFailSkipRate);
  if (hookFail) {
    const why = ig?.skipRate != null && ig.skipRate > rules.hookFailSkipRate
      ? `${pct(ig.skipRate)} font défiler avant 3 s sur Instagram`
      : `${sec(s.avgWatchS)} regardées en moyenne sur TikTok`;
    out.push({ kind: 'accroche', label, text: `Les gens partent dès l'accroche (${why}).`, action: 'Accroche plus forte : nouvelles accroches à tester.' });
  } else if (s.watchPct != null && s.watchPct < rules.midDropWatchPct) {
    out.push({ kind: 'milieu', label, text: `L'accroche tient, mais on décroche au milieu (${pct(s.watchPct)} de la vidéo regardée, ${sec(s.avgWatchS)} sur ${sec(s.durationS)}).`, action: `Raccourcir : viser environ ${Math.max(12, Math.round((s.avgWatchS ?? 10) / 0.6))} s, et une réponse plus tôt.` });
  } else if (s.watchPct != null && s.watchPct >= rules.endDropWatchPct && s.completion != null && s.completion < rules.endDropCompletion) {
    out.push({ kind: 'fin', label, text: `Bien regardée (${pct(s.watchPct)}) mais peu vont au bout (${pct(s.completion)}).`, action: 'Fin plus courte : la réponse puis le logo, sans temps mort.' });
  }
  if (s.likeRate != null && s.likeRate < rules.lowLikeRate) {
    out.push({ kind: 'likes', label, text: `Peu de likes (${pct(s.likeRate)} des vues).`, action: 'Finir sur un défi ou une question qui fait réagir.' });
  }
  if (s.followRate != null && s.followRate < rules.lowFollowRate) {
    out.push({ kind: 'abonnés', label, text: `Presque aucun abonné gagné (${s.followRate === 0 ? 'aucun' : pct(s.followRate)}).`, action: 'Donner une raison de suivre : « un nouveau défi chaque jour ».' });
  }
  return out;
}

const tt = rows.filter((r) => r.platform === 'tiktok');
const ig = rows.filter((r) => r.platform === 'instagram');
const keyCF = (r) => `${r.concept} · ${r.format}`;
const byCF = { tt: groupBy(tt, keyCF), ig: groupBy(ig, keyCF) };
const cfTable = Object.keys({ ...byCF.tt, ...byCF.ig }).sort().map((k) => ({ k, tt: stats(byCF.tt[k] ?? []), ig: stats(byCF.ig[k] ?? []) }));
for (const { k, tt: s, ig: i } of cfTable) findings.push(...diagnose(k, s.n ? s : i, i));

// ───────────────────────────── Réglages ─────────────────────────────
// Mélange des concepts : au prorata de leur note, chacun gardant au moins
// mixFloor pour continuer à être testé. Peu de données : poids précédent.
const want = prev.short ?? DEFAULT.short ? 'court' : 'long';
const conceptScore = {};
for (const c of ATLAS) {
  const rs = tt.filter((r) => r.concept === c && r.format !== 'app');
  const same = rs.filter((r) => r.format === want);
  const s = stats(same.length >= rules.minPosts ? same : rs);
  conceptScore[c] = s.n >= rules.minPosts ? score(s) : null;
}
const prevMix = prev.mix ?? DEFAULT.mix;
const prevTotal = Object.values(prevMix).reduce((a, b) => a + b, 0) || 1;
const known = Object.values(conceptScore).filter((x) => x != null);
const rawMix = Object.fromEntries(ATLAS.map((c) => [c, conceptScore[c] ?? (known.length ? Math.max(...known) * (prevMix[c] ?? 0) / prevTotal * ATLAS.length : prevMix[c] ?? 0)]));
const totalRaw = Object.values(rawMix).reduce((a, b) => a + b, 0) || 1;
// Un concept mis à zéro à la main (ex. Rankle) le reste.
const mix = Object.fromEntries(ATLAS.map((c) => [c, (prevMix[c] ?? 0) === 0 ? 0 : Math.max(rules.mixFloor, rawMix[c] / totalRaw)]));
const mixTotal = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
for (const c of ATLAS) mix[c] = Math.round((mix[c] / mixTotal) * 100) / 100;

// Format : court tant qu'il fait au moins aussi bien que le long.
const fmt = (f) => stats(tt.filter((r) => ATLAS.includes(r.concept) && r.format === f));
const court = fmt('court');
const long = fmt('long');
const short = court.n >= rules.minPosts && long.n >= rules.minPosts ? (court.watchPct ?? 0) >= (long.watchPct ?? 0) * 0.9 : prev.short ?? DEFAULT.short;

// Accroches : poids au prorata de la note ; une accroche encore peu testée
// reçoit la note de la meilleure (on la teste) ; une accroche qui ne retient
// pas passe au minimum. needsNewHooks : il faut en écrire de nouvelles.
const hookWeights = {};
const needsNewHooks = [];
const hookTable = [];
for (const [concept, byLang] of Object.entries(hooks)) {
  for (const [lang, list] of Object.entries(byLang)) {
    // L'accroche se juge sur les 3 premières secondes : la part qui ne fait pas
    // défiler sur Instagram, sinon la part regardée sur TikTok.
    const mine = (rs, id) => rs.filter((r) => r.concept === concept && r.lang === lang && r.hook === id);
    const per = Object.fromEntries(list.map((h) => [h.id, stats(mine(tt, h.id))]));
    const perIg = Object.fromEntries(list.map((h) => [h.id, stats(mine(ig, h.id))]));
    const bySkip = list.some((h) => perIg[h.id].n >= rules.minPosts && perIg[h.id].skipRate != null);
    const hookScore = (id) => (bySkip
      ? (perIg[id].n >= rules.minPosts && perIg[id].skipRate != null ? 1 - perIg[id].skipRate : null)
      : (per[id].n >= rules.minPosts ? score(per[id]) : null));
    const scored = list.map((h) => [h.id, hookScore(h.id)]);
    const best = Math.max(0, ...scored.map(([, x]) => x ?? 0));
    const w = {};
    let failing = 0;
    for (const [id, sc] of scored) {
      const s = per[id];
      const i = perIg[id];
      const fail = (s.n >= rules.minPosts && s.avgWatchS != null && s.avgWatchS < rules.hookFailWatchS)
        || (i.n >= rules.minPosts && i.skipRate != null && i.skipRate > rules.hookFailSkipRate);
      if (fail) failing++;
      // Une accroche qui ne retient pas garde la moitié de sa note : les nouvelles passent devant.
      w[id] = fail ? (sc ?? 0) * 0.5 : sc ?? (best || 1);
      hookTable.push({ concept, lang, id, text: list.find((h) => h.id === id).text.join(' '), s, ig: i, fail });
    }
    const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
    for (const id of Object.keys(w)) w[id] = Math.round(Math.max(rules.hookFloor, w[id] / total) * 100) / 100;
    hookWeights[concept] = { ...hookWeights[concept], [lang]: w };
    // Toutes les accroches testées et aucune ne fait mieux que l'accroche d'origine
    // de plus de 10 %, ou une accroche retire les gens trop tôt : il en faut d'autres.
    const tested = scored.filter(([, x]) => x != null);
    const h0 = scored.find(([id]) => id === 'h0')?.[1];
    if (failing || (tested.length === list.length && list.length > 1 && tested.every(([id, x]) => id === 'h0' || h0 == null || x <= h0 * 1.1))) needsNewHooks.push(`${concept}/${lang}`);
  }
}

const tuning = {
  _comment: DEFAULT._comment,
  updatedAt: new Date().toISOString(),
  posts: rows.length,
  rules,
  mix,
  short,
  hooks,
  hookWeights,
  needsNewHooks,
  findings,
};
writeFileSync(join(OUT, 'tuning.json'), JSON.stringify(tuning, null, 2));

// ───────────────────────────── Rapport ─────────────────────────────
const md = [];
const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });
md.push(`# Stats des vidéos (${date})`, '');
md.push(`${rows.length} publications analysées (plus de ${rules.minAgeHours} h en ligne), ${tt.length} sur TikTok et ${ig.length} sur Instagram.`, '');
md.push('## Ce qu\'il faut changer', '');
if (!findings.length) md.push(`Rien à signaler (il faut au moins ${rules.minPosts} vidéos par concept).`);
for (const f of findings) md.push(`- **${f.label}** : ${f.text} → ${f.action}`);
md.push('', '## Par concept', '');
md.push('| Concept · format | Vidéos | Vues TT | Durée vue TT | Part vue TT | Fin TT | Likes TT | Abonnés TT | Vues Insta | Durée vue Insta | Partis avant 3 s (Insta) |', '|---|---|---|---|---|---|---|---|---|---|---|');
for (const { k, tt: s, ig: i } of cfTable) {
  md.push(`| ${k} | ${Math.max(s.n, i.n)} | ${s.views == null ? '—' : Math.round(s.views)} | ${sec(s.avgWatchS)} | ${pct(s.watchPct)} | ${pct(s.completion)} | ${pct(s.likeRate)} | ${s.followRate == null ? '—' : pct(s.followRate)} | ${i.views == null ? '—' : Math.round(i.views)} | ${sec(i.avgWatchS)} | ${pct(i.skipRate)} |`);
}
md.push('', '## Accroches', '');
md.push('| Concept | Langue | Accroche | Vidéos | Durée vue TT | Part vue TT | Partis avant 3 s (Insta) | Poids |', '|---|---|---|---|---|---|---|---|');
for (const h of hookTable) md.push(`| ${h.concept} | ${h.lang} | ${h.text.replace(/\|/g, '/')} | ${h.s.n} | ${sec(h.s.avgWatchS)} | ${pct(h.s.watchPct)} | ${pct(h.ig.skipRate)} | ${pct(hookWeights[h.concept][h.lang][h.id])}${h.fail ? ' ⚠️' : ''} |`);
md.push('', '## Prochain lot', '');
md.push(`- Mélange : ${ATLAS.map((c) => `${c} ${pct(mix[c])}`).join(', ')}.`);
md.push(`- Format : ${short ? 'court (~20 s)' : 'long'}${court.n && long.n ? ` (part vue court ${pct(court.watchPct)}, long ${pct(long.watchPct)})` : ''}.`);
md.push(`- Nouvelles accroches à écrire : ${needsNewHooks.length ? needsNewHooks.join(', ') : 'aucune'}.`);
md.push('', 'Limites : pas de courbe de rétention seconde par seconde par API. « Partis avant 3 s » vient d\'Instagram (taux de swipe) ; sur TikTok, seule la durée moyenne regardée le dit.');
const report = md.join('\n');
writeFileSync(join(OUT, 'rapport.md'), `${report}\n`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
console.log(report);
