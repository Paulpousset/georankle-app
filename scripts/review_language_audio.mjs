// Génère une page d'écoute locale pour valider les extraits déjà en ligne.
//
//   set -a; source .env; set +a
//   node scripts/review_language_audio.mjs && open /tmp/langues-ecoute.html
//   ONLY=fr,pt node scripts/review_language_audio.mjs   # sous-ensemble
//
// L'écoute est l'étape qu'AUCUN test ne remplace : le modèle multilingue peut
// lire une phrase portugaise avec un accent espagnol, ce qui rend la « bonne »
// réponse objectivement fausse. On vérifie donc trois choses par clip :
//   1. l'accent correspond bien à la langue annoncée ;
//   2. la phrase est lue en entier, sans troncature ;
//   3. le volume est comparable aux autres (le loudnorm a fait son travail).
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('Manque EXPO_PUBLIC_SUPABASE_URL — fais d’abord :  set -a; source .env; set +a');
  process.exit(1);
}

const ROOT = new URL('../', import.meta.url).pathname;
const CORPUS = JSON.parse(readFileSync(join(ROOT, 'assets/languages.json'), 'utf8'));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const OUT = process.env.OUT || '/tmp/langues-ecoute.html';

const fnv1a32 = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};
const hash8 = (s) => fnv1a32(s).toString(16).padStart(8, '0');
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Comme pour la génération : ONLY prime sur `audio:false`, afin de pouvoir
// écouter une langue candidate avant de l'activer.
const langs = ONLY
  ? CORPUS.languages.filter((l) => ONLY.has(l.code))
  : CORPUS.languages.filter((l) => l.audio);
const rtl = new Set(['arabic', 'hebrew']);

const sections = langs.map((l) => {
  const rows = l.phrases.map((p) => {
    const url = `${SUPABASE_URL}/storage/v1/object/public/game-audio`
      + `/languages/v${CORPUS.version}/${l.code}/${p.id}.${hash8(p.text)}.mp3`;
    return `<tr data-lang="${l.code}">
      <td class="id">${p.id}</td>
      <td class="txt"${rtl.has(l.script) ? ' dir="rtl"' : ''}>${esc(p.text)}</td>
      <td><audio preload="none" controls src="${url}"></audio></td>
      <td class="verdict">
        <button class="ok"   title="accent correct">✓</button>
        <button class="bad"  title="accent faux / clip coupé">✗</button>
      </td>
    </tr>`;
  }).join('\n');
  return `<section>
    <h2>${esc(l.nameFr)} <small>${l.code} · ${esc(l.endonym)} · ${l.ttsModel.replace('eleven_', '')}</small></h2>
    <table>${rows}</table>
  </section>`;
}).join('\n');

const html = `<!doctype html><meta charset="utf-8">
<title>Langues — écoute de validation</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0 auto; padding: 24px; max-width: 1000px; }
  h1 { margin-bottom: 4px; }
  .lead { color: #666; margin-top: 0; }
  section { margin: 28px 0; }
  h2 { border-bottom: 2px solid currentColor; padding-bottom: 6px; }
  h2 small { font-weight: 400; opacity: .6; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 6px; border-bottom: 1px solid rgba(128,128,128,.25); vertical-align: middle; }
  .id { font: 12px ui-monospace, monospace; opacity: .55; width: 70px; }
  .txt { font-size: 17px; }
  audio { height: 34px; width: 260px; }
  .verdict { width: 90px; text-align: right; white-space: nowrap; }
  .verdict button { font-size: 15px; padding: 3px 9px; margin-left: 4px; cursor: pointer;
                    border: 1px solid rgba(128,128,128,.5); border-radius: 6px; background: transparent; }
  tr.is-ok  { background: rgba(42,110,63,.14); }
  tr.is-bad { background: rgba(180,30,30,.16); }
  #bilan { position: sticky; top: 0; padding: 12px 0; backdrop-filter: blur(8px);
           background: rgba(128,128,128,.12); z-index: 2; }
  #bilan button { padding: 6px 12px; margin-right: 8px; cursor: pointer; }
  code { background: rgba(128,128,128,.18); padding: 1px 5px; border-radius: 4px; }
</style>
<h1>Langues — écoute de validation</h1>
<p class="lead">
  Pour chaque clip : l’accent correspond-il à la langue annoncée, la phrase est-elle
  lue en entier, le volume est-il comparable aux autres ? Marque ✗ au moindre doute.
</p>
<div id="bilan">
  <strong id="score">0 / ${langs.reduce((n, l) => n + l.phrases.length, 0)} écoutés</strong>
  — <span id="ko">0 à refaire</span>
  <div style="margin-top:8px">
    <button id="copy">Copier la commande de regénération</button>
    <button id="reset">Tout réinitialiser</button>
  </div>
</div>
${sections}
<script>
  const rows = [...document.querySelectorAll('tr[data-lang]')];
  const mark = (tr, ok) => {
    tr.classList.toggle('is-ok', ok);
    tr.classList.toggle('is-bad', !ok);
    bilan();
  };
  const bilan = () => {
    const done = rows.filter((r) => r.className).length;
    const bad = rows.filter((r) => r.classList.contains('is-bad'));
    document.getElementById('score').textContent = done + ' / ' + rows.length + ' écoutés';
    document.getElementById('ko').textContent = bad.length + ' à refaire';
  };
  rows.forEach((tr) => {
    tr.querySelector('.ok').onclick = () => mark(tr, true);
    tr.querySelector('.bad').onclick = () => mark(tr, false);
    // Enchaîne automatiquement sur le clip suivant.
    tr.querySelector('audio').onended = () => {
      const next = rows[rows.indexOf(tr) + 1];
      if (next) next.querySelector('audio').play().catch(() => {});
    };
  });
  document.getElementById('copy').onclick = () => {
    const codes = [...new Set(rows.filter((r) => r.classList.contains('is-bad'))
      .map((r) => r.dataset.lang))];
    const cmd = codes.length
      ? 'FORCE=1 ONLY=' + codes.join(',') + ' node scripts/gen_language_audio.mjs'
      : '# rien à refaire 🎉';
    navigator.clipboard.writeText(cmd);
    document.getElementById('copy').textContent = 'Copié : ' + cmd;
  };
  document.getElementById('reset').onclick = () => {
    rows.forEach((r) => { r.className = ''; });
    bilan();
  };
</script>`;

writeFileSync(OUT, html);
console.log(`Page écrite : ${OUT}`);
console.log(`${langs.length} langue(s), ${langs.reduce((n, l) => n + l.phrases.length, 0)} extraits.`);
console.log(`Ouvre-la avec :  open ${OUT}`);
