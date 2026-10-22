/**
 * Source « Heure dorée » : créneaux où les pubs récompensées rapportent plus
 * (table golden_hours, migration 20261022_01_golden_hour.sql).
 *
 * Les heures sont stockées en UTC (jour 0 = dimanche), comme les campagnes
 * push : la page /hq convertit depuis et vers l'heure du navigateur. Un
 * créneau hebdo peut avoir sa notification, une ligne de notification_campaigns
 * envoyée par run-campaigns au début du créneau.
 */
import { SUPABASE_URL, env, need, http } from './lib.mjs';

function headers() {
  need(['SUPABASE_SERVICE_ROLE_KEY']);
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=representation' };
}
const rest = (path) => `${SUPABASE_URL()}/rest/v1/${path}`;

export async function golden() {
  const slots = await http(
    rest('golden_hours?select=id,weekday,hour,starts_at,duration_min,multiplier,ad_cap,enabled,campaign_id&order=starts_at.desc.nullsfirst,weekday,hour'),
    { headers: headers() },
  );
  return { slots };
}

const int = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const span = (min) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

/** Texte de la notif dans les six langues des campagnes. */
function pushCopy(mult, min) {
  const d = span(min);
  const t = {
    fr: ['Heure dorée ✨', `Pendant ${d}, chaque pub rapporte ${mult} fois plus de pièces. C’est maintenant !`],
    en: ['Golden hour ✨', `For ${d}, every ad pays ${mult} times the coins. It’s on now!`],
    es: ['Hora dorada ✨', `Durante ${d}, cada anuncio da ${mult} veces más monedas. ¡Es ahora!`],
    pt: ['Hora dourada ✨', `Durante ${d}, cada anúncio dá ${mult} vezes mais moedas. É agora!`],
    de: ['Goldene Stunde ✨', `${d} lang bringt jede Werbung ${mult}-mal so viele Münzen. Jetzt!`],
    it: ['Ora d’oro ✨', `Per ${d}, ogni pubblicità vale ${mult} volte le monete. È adesso!`],
  };
  const i18n = Object.fromEntries(Object.entries(t).map(([k, [title, body]]) => [k, { title, body }]));
  return { title: t.fr[0], body: t.fr[1], i18n };
}

/**
 * POST { add: { weekday, hour, duration, multiplier, adCap, push } } → créneau hebdo (UTC)
 *      { now: { duration, multiplier, adCap } }                     → créneau ponctuel qui démarre tout de suite
 *      { toggle: id, enabled }                                       → active / met en pause (avec sa notif)
 *      { remove: id }                                                → supprime (avec sa notif)
 */
export async function goldenWrite(b) {
  const h = headers();
  const opts = (o) => {
    const duration = int(o.duration, 15, 360);
    const multiplier = int(o.multiplier, 2, 5);
    const adCap = int(o.adCap, 5, 20);
    if (duration == null || multiplier == null || adCap == null) throw new Error('durée, multiplicateur ou plafond invalide');
    return { duration_min: duration, multiplier, ad_cap: adCap };
  };

  if (b.add) {
    const weekday = int(b.add.weekday, 0, 6);
    const hour = int(b.add.hour, 0, 23);
    if (weekday == null || hour == null) throw new Error('jour ou heure invalide');
    const o = opts(b.add);
    let campaign_id = null;
    if (b.add.push) {
      const c = pushCopy(o.multiplier, o.duration_min);
      const [row] = await http(rest('notification_campaigns'), {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ ...c, segment: { type: 'everyone' }, schedule: 'weekly', hour, weekday, enabled: true }),
      });
      campaign_id = row.id;
    }
    const [row] = await http(rest('golden_hours'), {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ weekday, hour, ...o, campaign_id }),
    });
    return { row };
  }

  if (b.now) {
    const [row] = await http(rest('golden_hours'), {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ starts_at: new Date().toISOString(), ...opts(b.now) }),
    });
    return { row };
  }

  const id = int(b.toggle ?? b.remove, 1, Number.MAX_SAFE_INTEGER);
  if (id == null) throw new Error('id invalide');
  const [slot] = await http(rest(`golden_hours?id=eq.${id}&select=campaign_id`), { headers: h });
  if (!slot) throw new Error('créneau introuvable');
  const camp = slot.campaign_id ? rest(`notification_campaigns?id=eq.${slot.campaign_id}`) : null;

  if (b.toggle != null) {
    const enabled = b.enabled === true;
    await http(rest(`golden_hours?id=eq.${id}`), { method: 'PATCH', headers: h, body: JSON.stringify({ enabled }) });
    if (camp) await http(camp, { method: 'PATCH', headers: h, body: JSON.stringify({ enabled }) });
    return {};
  }
  await http(rest(`golden_hours?id=eq.${id}`), { method: 'DELETE', headers: h });
  if (camp) await http(camp, { method: 'DELETE', headers: h });
  return {};
}
