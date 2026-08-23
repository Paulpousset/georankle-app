/**
 * Refonte des tableaux de bord PostHog, décrite en code plutôt qu'à la souris.
 *
 * Pourquoi : ANALYTICS_FUNNELS.md listait depuis un an les insights « à créer
 * dans PostHog » à la main. Résultat, ils ne l'ont jamais tous été, et personne
 * ne sait lesquels existent. Ici la configuration est versionnée, relisible en
 * revue de code, et rejouable : le script rapproche par nom, met à jour ce qui
 * existe et crée le reste. Le relancer deux fois ne duplique rien.
 *
 * Usage :
 *   node scripts/posthog_dashboards.mjs --dry-run   # n'écrit rien, montre le plan
 *   node scripts/posthog_dashboards.mjs             # applique
 *   node scripts/posthog_dashboards.mjs --only "Vue d'ensemble"
 *
 * La clé personnelle se lit dans .env.secrets (gitignoré), jamais en dur :
 *   POSTHOG_PERSONAL_API_KEY=phx_...
 * Portées nécessaires : dashboard:write, insight:write, project:read.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HOST = process.env.POSTHOG_HOST ?? 'https://eu.posthog.com';
const DRY = process.argv.includes('--dry-run');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

/* ------------------------------------------------------------------ clé ---- */

function readKey() {
  if (process.env.POSTHOG_PERSONAL_API_KEY) return process.env.POSTHOG_PERSONAL_API_KEY;
  const f = join(process.cwd(), '.env.secrets');
  if (existsSync(f)) {
    const m = readFileSync(f, 'utf8').match(/^POSTHOG_PERSONAL_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  console.error(
    'POSTHOG_PERSONAL_API_KEY introuvable.\n' +
      'Crée une clé personnelle sur ' + HOST + '/settings/user-api-keys\n' +
      'avec les portées dashboard:write, insight:write, project:read,\n' +
      'puis ajoute-la dans .env.secrets (gitignoré) :\n' +
      '  POSTHOG_PERSONAL_API_KEY=phx_...',
  );
  process.exit(1);
}

const KEY = readKey();

/* ------------------------------------------------------------------ API ---- */

async function api(method, path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}\n${text.slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Parcourt une liste paginée jusqu'au bout (PostHog plafonne à 100 par page). */
async function apiList(path) {
  const out = [];
  let next = `${path}${path.includes('?') ? '&' : '?'}limit=100`;
  while (next) {
    const page = await api('GET', next.replace(HOST, ''));
    out.push(...(page.results ?? []));
    next = page.next ? page.next.replace(HOST, '') : null;
  }
  return out;
}

/* ------------------------------------------- fabriques de requêtes ---------- */

const ev = (event, extra = {}) => ({ kind: 'EventsNode', event, name: event, ...extra });

/** Courbe temporelle. `math: 'dau'` compte les utilisateurs uniques, pas les events. */
const trend = (series, { days = 30, interval = 'day', breakdown, display, formula } = {}) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'TrendsQuery',
    dateRange: { date_from: `-${days}d` },
    interval,
    series,
    ...(breakdown
      ? { breakdownFilter: { breakdowns: [{ property: breakdown.key, type: breakdown.type ?? 'event' }] } }
      : {}),
    trendsFilter: {
      ...(display ? { display } : {}),
      ...(formula ? { formula } : {}),
    },
  },
});

const funnel = (series, { days = 30, windowDays = 7 } = {}) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'FunnelsQuery',
    dateRange: { date_from: `-${days}d` },
    series,
    funnelsFilter: { funnelWindowInterval: windowDays, funnelWindowIntervalUnit: 'day' },
  },
});

const retention = (target, returning, { period = 'Day', intervals = 14, type = 'retention_first_time' } = {}) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'RetentionQuery',
    retentionFilter: {
      targetEntity: { id: target, name: target, type: 'events' },
      returningEntity: { id: returning, name: returning, type: 'events' },
      retentionType: type,
      period,
      totalIntervals: intervals,
    },
  },
});

/** Cycle de vie : nouveaux, récurrents, revenus, endormis — le « growth accounting ». */
const lifecycle = (series, { days = 60, interval = 'week' } = {}) => ({
  kind: 'InsightVizNode',
  source: { kind: 'LifecycleQuery', dateRange: { date_from: `-${days}d` }, interval, series },
});

const stickiness = (series, { days = 30 } = {}) => ({
  kind: 'InsightVizNode',
  source: { kind: 'StickinessQuery', dateRange: { date_from: `-${days}d` }, series },
});

/**
 * Tableau HogQL, pour ce qu'aucun insight standard ne sait faire — typiquement
 * réunir deux événements qui nomment la même chose différemment.
 */
const hogql = (query) => ({ kind: 'DataTableNode', source: { kind: 'HogQLQuery', query } });

/** Filtre de propriété d'événement, p. ex. surface = content. */
const prop = (key, value) => ({ key, value: [value], operator: 'exact', type: 'event' });

/* ------------------------------------------------- la refonte, en données --- */

const DASHBOARDS = [
  {
    name: 'GeoG · Vue d’ensemble',
    description:
      "Qui joue, sur quelle surface, et d'où viennent les nouveaux. Le point de départ quotidien.",
    pinned: true,
    insights: [
      {
        name: 'Joueurs actifs par jour (toutes surfaces)',
        description:
          'Utilisateurs uniques ayant émis au moins un événement. Compter les `$pageview` serait faux : le natif émet `$screen`, et le web ne pèse qu’une poignée d’événements.',
        query: trend([{ kind: 'EventsNode', name: 'Tous les événements', math: 'dau' }, ev('game_started', { math: 'dau' })], {
          days: 30,
        }),
      },
      {
        name: 'Joueurs actifs par plateforme',
        description:
          'Réparti sur `$os`, renseigné à 100 % depuis toujours — la super-propriété `platform` ne l’est que sur 0,2 % des événements tant que le parc natif ne s’est pas renouvelé. Avant le 2026-08-23 le web utilisait le SDK natif : un OS de bureau (Mac OS, Windows, Linux) y désigne donc un joueur web.',
        query: trend([ev('game_started', { math: 'dau' })], { days: 30, breakdown: { key: '$os' } }),
      },
      {
        name: 'Web : jeu vs site de contenu',
        description:
          '`surface` distingue la SPA (app) des guides et de la landing (content). Mesuré depuis le 2026-08-23 seulement : aucune comparaison avec l’avant n’a de sens.',
        query: trend([ev('$pageview', { math: 'dau' })], { days: 30, breakdown: { key: 'surface' } }),
      },
      {
        name: 'Nouveaux comptes par jour',
        query: trend([ev('signed_up')], { days: 60 }),
      },
      {
        name: 'Sources d’acquisition du site',
        description: 'Domaine référent des pages de contenu — mesurable seulement depuis le 23/08/2026.',
        query: trend([ev('$pageview', { math: 'dau', properties: [prop('surface', 'content')] })], {
          days: 30,
          breakdown: { key: '$referring_domain' },
          display: 'ActionsBarValue',
        }),
      },
      {
        name: 'Pages de contenu les plus lues',
        query: trend([ev('$pageview', { properties: [prop('surface', 'content')] })], {
          days: 30,
          breakdown: { key: '$pathname' },
          display: 'ActionsBarValue',
        }),
      },
      {
        name: 'Écrans du jeu les plus vus',
        description:
          'Réunit les deux surfaces : le natif nomme l’écran `$screen_name` sur un `$screen`, le web `screen` sur un `$pageview`. Ne regarder que l’un des deux ne montrait que 4 vues au lieu de plusieurs milliers.',
        query: hogql(
          "select coalesce(properties.$screen_name, properties.screen) as ecran, count() as vues, uniq(person_id) as joueurs " +
            "from events where event in ('$screen', '$pageview') and timestamp > now() - interval 30 day " +
            'and coalesce(properties.$screen_name, properties.screen) is not null ' +
            'group by ecran order by vues desc limit 40',
        ),
      },
      {
        name: 'Adoption des fonctionnalités',
        description:
          'Combien de joueurs uniques touchent à chaque grande fonction. Ce qui est bas est soit mal placé, soit inutile.',
        query: trend(
          [
            ev('daily_opened', { math: 'dau' }),
            ev('story_opened', { math: 'dau' }),
            ev('league_opened', { math: 'dau' }),
            ev('shop_opened', { math: 'dau' }),
            ev('leaderboard_opened', { math: 'dau' }),
            ev('matchmaking_started', { math: 'dau' }),
            ev('challenge_completed', { math: 'dau' }),
            ev('local_parcours_started', { math: 'dau' }),
          ],
          { days: 30, display: 'ActionsBarValue' },
        ),
      },
      {
        name: 'Entonnoir : lecteur d’un guide → joueur',
        description:
          'La raison d’être du site de contenu. Même distinct_id de bout en bout depuis la refonte du 23/08.',
        query: funnel(
          [
            ev('$pageview', { custom_name: 'Page de contenu', properties: [prop('surface', 'content')] }),
            ev('$pageview', { custom_name: 'Ouvre le jeu', properties: [prop('surface', 'app')] }),
            ev('game_started', { custom_name: 'Lance une partie' }),
          ],
          { windowDays: 1 },
        ),
      },
    ],
  },
  {
    name: 'GeoG · Rétention & habitude',
    description: 'Est-ce que les joueurs reviennent ? Le défi du jour est le moteur d’habitude.',
    insights: [
      {
        name: 'Rétention : nouveau compte → partie jouée',
        query: retention('signed_up', 'game_started', { intervals: 30 }),
      },
      {
        name: 'Rétention du défi du jour (jour après jour)',
        description: 'Mesure directe de l’efficacité du streak et du rappel quotidien.',
        query: retention('daily_completed', 'daily_completed', { intervals: 30, type: 'retention_recurring' }),
      },
      {
        name: 'Rétention hebdomadaire des joueurs',
        query: retention('game_started', 'game_started', { period: 'Week', intervals: 12, type: 'retention_recurring' }),
      },
      {
        name: 'Cycle de vie : nouveaux, revenus, endormis',
        description:
          'La seule vue qui dit si la base grandit vraiment : les nouveaux compensent-ils ceux qui s’endorment ?',
        query: lifecycle([ev('game_started')], { days: 90, interval: 'week' }),
      },
      {
        name: 'Fidélité : nombre de jours actifs sur 30',
        description: 'Combien de joueurs jouent 1 jour, 5 jours, 20 jours… Sépare curieux et habitués.',
        query: stickiness([ev('game_started')], { days: 30 }),
      },
      {
        name: 'Défi du jour : ouvert → terminé',
        query: funnel([ev('daily_opened'), ev('daily_completed')], { windowDays: 1 }),
      },
      {
        name: 'Partages du défi du jour',
        description: 'La grille partagée est le principal vecteur viral gratuit.',
        query: trend([ev('daily_completed'), ev('daily_shared')], { days: 30 }),
      },
      {
        name: 'Sentinelle : bonus de streak attribués',
        description:
          '⚠️ Jamais émis à ce jour, pour 1 013 défis quotidiens terminés — et `daily_completed` ne porte pas non plus de propriété `streak` (seulement `mode` et `score`). Soit la récompense de série ne se déclenche jamais, soit elle n’est pas instrumentée. Cette tuile doit rester à zéro tant que ce n’est pas tranché.',
        query: trend([ev('streak_bonus_awarded'), ev('daily_completed')], { days: 90 }),
      },
      {
        name: 'Rappels quotidiens activés',
        query: trend([ev('daily_reminder_set'), ev('league_reminder_set')], { days: 60 }),
      },
    ],
  },
  {
    name: 'GeoG · Modes de jeu',
    description: 'Ce que les joueurs jouent vraiment, et où ils abandonnent.',
    insights: [
      {
        name: 'Parties lancées par mode',
        query: trend([ev('game_started')], { days: 30, breakdown: { key: 'mode' }, display: 'ActionsBarValue' }),
      },
      {
        name: 'Parties lancées vs terminées',
        description: 'L’écart est le taux d’abandon en cours de partie.',
        query: trend([ev('game_started'), ev('game_completed')], { days: 30 }),
      },
      {
        name: 'Abandon par mode (terminées / lancées)',
        query: trend([ev('game_started'), ev('game_completed')], {
          days: 30,
          breakdown: { key: 'mode' },
          formula: 'B/A',
        }),
      },
      {
        name: 'Mode Histoire : niveaux joués et réussis',
        query: trend([ev('story_opened'), ev('story_level_started'), ev('story_level_completed')], { days: 30 }),
      },
      {
        name: 'Quiz Pays : défis terminés par thème',
        description:
          '`challenge_started` n’a jamais été émis en production — seul `challenge_completed` l’est, et il porte bien `challenge`.',
        query: trend([ev('challenge_completed')], { days: 90, breakdown: { key: 'challenge' }, display: 'ActionsBarValue' }),
      },
      {
        name: 'Ligues : création, participation, invitations',
        query: trend([ev('league_created'), ev('league_joined'), ev('league_invite_shared'), ev('league_left')], {
          days: 60,
        }),
      },
      {
        name: 'Santé du matchmaking : humains vs bots',
        description: 'Si la part de bots grimpe, la file classée manque de joueurs aux heures creuses.',
        query: trend([ev('match_started'), ev('bot_match_started')], { days: 30 }),
      },
      {
        name: 'Sentinelle : mode Langues, repli audio → texte',
        description:
          'À zéro tant que le mode Langues reste derrière son drapeau — c’est le comportement attendu. Une fois activé, un pic signale un problème de bucket Storage ou de CDN, pas un problème de jeu.',
        query: trend([ev('language_audio_fallback')], { days: 30 }),
      },
    ],
  },
  {
    name: 'GeoG · Économie & monétisation',
    description: 'Boutique, pubs récompensées et pièces. Le socle des revenus à venir.',
    insights: [
      {
        name: 'Entonnoir boutique : ouverture → aperçu → achat',
        query: funnel(
          [ev('shop_opened'), ev('shop_item_viewed'), ev('cosmetic_purchased')],
          { windowDays: 3 },
        ),
      },
      {
        name: 'Achats par type',
        query: trend([ev('cosmetic_purchased'), ev('bundle_purchased'), ev('featured_purchased')], { days: 30 }),
      },
      {
        name: 'Articles les plus achetés',
        query: trend([ev('cosmetic_purchased')], { days: 60, breakdown: { key: 'item_id' }, display: 'ActionsBarValue' }),
      },
      {
        name: 'Pub récompensée : demandée → obtenue → échec',
        description: 'Le taux d’échec est le vrai indicateur : une pub qui ne se charge pas est une pièce non gagnée.',
        query: trend([ev('rewarded_ad_requested'), ev('rewarded_ad_earned'), ev('rewarded_ad_failed')], { days: 30 }),
      },
      {
        name: 'Taux de réussite des pubs récompensées',
        query: trend([ev('rewarded_ad_requested'), ev('rewarded_ad_earned')], { days: 30, formula: 'B/A' }),
      },
      {
        name: 'Multiplicateur de pièces : demandé → obtenu',
        query: funnel([ev('coin_multiplier_requested'), ev('coin_multiplier_earned')], { windowDays: 1 }),
      },
      {
        name: 'Quêtes réclamées',
        query: trend([ev('quest_claimed')], { days: 30, breakdown: { key: 'quest' } }),
      },
    ],
  },
  {
    name: 'GeoG · Croissance & parrainage',
    description: 'Les boucles qui amènent de nouveaux joueurs sans budget publicitaire.',
    insights: [
      {
        name: 'Entonnoir de parrainage : partagé → ouvert → utilisé',
        description:
          '⚠️ `referral_shared` n’a été émis qu’une seule fois dans toute l’histoire du projet (2026-08-17), et jamais suivi d’une ouverture ni d’une conversion. La boucle n’est pas cassée : elle n’est pas trouvée par les joueurs.',
        query: funnel([ev('referral_shared'), ev('referral_link_opened'), ev('referral_redeemed')], { windowDays: 7 }),
      },
      {
        name: 'Sentinelle : parrainages aboutis',
        description:
          '⚠️ `referral_redeemed` n’a jamais été émis. Tant que cette tuile reste à zéro, le parrainage ne rapporte aucun joueur.',
        query: trend([ev('referral_redeemed'), ev('referral_shared')], { days: 90 }),
      },
      {
        name: 'Tous les partages sortants',
        description: 'Grille du défi, invitation de ligue, lien de parrainage : les trois portes d’entrée.',
        query: trend([ev('daily_shared'), ev('league_invite_shared'), ev('referral_shared')], { days: 30 }),
      },
      {
        name: 'Invitations de match : envoyées, acceptées, refusées',
        query: trend([ev('match_invite_sent'), ev('match_invite_accepted'), ev('match_invite_declined')], { days: 30 }),
      },
      {
        name: 'Nouveaux comptes par plateforme',
        description: 'Sur `$os`, pour la même raison que le tableau Vue d’ensemble.',
        query: trend([ev('signed_up')], { days: 90, breakdown: { key: '$os' } }),
      },
      {
        name: 'Installations par jour',
        description: 'Événement de cycle de vie du SDK natif — le web n’en émet pas.',
        query: trend([ev('Application Installed')], { days: 60 }),
      },
      {
        name: 'Installations par pays',
        query: trend([ev('Application Installed')], {
          days: 90,
          breakdown: { key: '$geoip_country_name' },
          display: 'ActionsBarValue',
        }),
      },
      {
        name: 'Installations par version d’app',
        description: 'Montre la vitesse de renouvellement du parc — utile avant de se fier à `platform`.',
        query: trend([ev('Application Installed')], {
          days: 90,
          breakdown: { key: '$app_version' },
          display: 'ActionsBarValue',
        }),
      },
      {
        name: 'Entonnoir : installation → inscription → première partie',
        description: 'Le vrai coût d’entrée du jeu, de l’ouverture du store à la première partie.',
        query: funnel([ev('Application Installed'), ev('signed_up'), ev('game_completed')], { windowDays: 7 }),
      },
    ],
  },
];

/* --------------------------------------------------------------- exécution -- */

// `/api/projects/` (niveau organisation) est refusé aux clés limitées à un
// projet — c'est le cas recommandé. `@current` est un endpoint de projet, donc
// accepté quelle que soit la portée de la clé.
const project = await api('GET', '/api/projects/@current/');
console.log(`Projet : ${project.name} (id ${project.id}) sur ${HOST}\n`);

const existingDashboards = await apiList(`/api/projects/${project.id}/dashboards/`);
const existingInsights = await apiList(`/api/projects/${project.id}/insights/`);
const byName = (list, name) => list.find((x) => x.name === name && !x.deleted);

let created = 0;
let updated = 0;

for (const def of DASHBOARDS) {
  if (ONLY && !def.name.includes(ONLY)) continue;

  let dashboard = byName(existingDashboards, def.name);
  if (dashboard) {
    console.log(`≡ tableau de bord « ${def.name} » (existe, id ${dashboard.id})`);
  } else if (DRY) {
    console.log(`+ tableau de bord « ${def.name} » (serait créé)`);
    dashboard = { id: '<nouveau>' };
  } else {
    dashboard = await api('POST', `/api/projects/${project.id}/dashboards/`, {
      name: def.name,
      description: def.description,
      pinned: !!def.pinned,
    });
    console.log(`+ tableau de bord « ${def.name} » créé (id ${dashboard.id})`);
    created += 1;
  }

  // Le rapprochement se fait par nom : renommer un insight en crée donc un
  // nouveau et laisse l'ancien accroché au tableau. Sans élagage, chaque
  // correction laissait une tuile fantôme — dont une qui affichait « aucune
  // donnée » parce qu'elle interrogeait une propriété inexistante.
  // On détache plutôt que supprimer : l'insight reste consultable dans la liste.
  if (!DRY && dashboard.id !== '<nouveau>') {
    const attendus = new Set(def.insights.map((i) => i.name));
    const complet = await api('GET', `/api/projects/${project.id}/dashboards/${dashboard.id}/`);
    for (const tile of complet.tiles ?? []) {
      const ins = tile.insight;
      if (!ins || attendus.has(ins.name)) continue;
      await api('PATCH', `/api/projects/${project.id}/insights/${ins.id}/`, {
        dashboards: (ins.dashboards ?? []).filter((x) => x !== dashboard.id),
      });
      console.log(`   − ${ins.name} (détaché : absent de la définition)`);
    }
  }

  for (const ins of def.insights) {
    const found = byName(existingInsights, ins.name);
    const payload = {
      name: ins.name,
      description: ins.description ?? '',
      query: ins.query,
      dashboards: [dashboard.id],
    };
    if (DRY) {
      console.log(`   ${found ? '≡' : '+'} ${ins.name}`);
      continue;
    }
    if (found) {
      await api('PATCH', `/api/projects/${project.id}/insights/${found.id}/`, payload);
      console.log(`   ≡ ${ins.name} (mis à jour)`);
      updated += 1;
    } else {
      await api('POST', `/api/projects/${project.id}/insights/`, payload);
      console.log(`   + ${ins.name}`);
      created += 1;
    }
  }
  console.log('');
}

console.log(DRY ? 'Simulation terminée, rien n’a été écrit.' : `Terminé : ${created} créé(s), ${updated} mis à jour.`);
