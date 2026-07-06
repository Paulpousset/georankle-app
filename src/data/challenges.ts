/**
 * Country challenges — the data behind "Défis Pays" (Country Challenges).
 *
 * A challenge is a country-specific quiz played with the same CARRÉ / DUO / CASH
 * scoring as the country↔capital game: each question shows a prompt (a text label
 * or a flag image) and the player either picks from generated options (DUO = 2,
 * CARRÉ = 4) or types the answer (CASH). The set is fully data-driven so new
 * challenges (other départements, US state capitals, German Länder, …) are just
 * new entries here — no new screen needed.
 *
 * Examples shipped: France · département number (name → number) and
 * USA · state flags (flag → state name).
 */

import { getSubdivisionFlagUrl } from '../lib/flags';

/** What the question shows. */
export type ChallengePromptKind = 'text' | 'flag';
/** How a typed (CASH) answer is checked: numbers exactly, names fuzzily. */
export type ChallengeAnswerKind = 'number' | 'name';

export interface ChallengeEntity {
  id: string;
  /** The correct answer, per language (also the label on option buttons). */
  answerFr: string;
  answerEn: string;
  /** Prompt text when promptKind = 'text' (e.g. the département name). */
  promptFr?: string;
  promptEn?: string;
  /** flagcdn subdivision slug when promptKind = 'flag' (e.g. 'us-ca'). */
  flagSlug?: string;
  /** Extra accepted spellings for CASH (e.g. the other language's name). */
  aliases?: string[];
}

export interface Challenge {
  id: string;
  /** Owning country (cca3) — used to group the hub by country. */
  country: string;
  /** Country flag emoji for the hub card. */
  emoji: string;
  titleFr: string;
  titleEn: string;
  subtitleFr: string;
  subtitleEn: string;
  /** The per-question instruction, e.g. "Quel est le numéro de ce département ?". */
  questionFr: string;
  questionEn: string;
  promptKind: ChallengePromptKind;
  answerKind: ChallengeAnswerKind;
  entities: ChallengeEntity[];
}

// ── France — départements (name → number) ────────────────────────────────────
// [code, name]; English name is identical (proper nouns). 101 départements
// (Corsica split 2A/2B, no "20"; overseas 971–976).
const FR_DEPARTMENTS: [string, string][] = [
  ['01', 'Ain'], ['02', 'Aisne'], ['03', 'Allier'], ['04', 'Alpes-de-Haute-Provence'],
  ['05', 'Hautes-Alpes'], ['06', 'Alpes-Maritimes'], ['07', 'Ardèche'], ['08', 'Ardennes'],
  ['09', 'Ariège'], ['10', 'Aube'], ['11', 'Aude'], ['12', 'Aveyron'], ['13', 'Bouches-du-Rhône'],
  ['14', 'Calvados'], ['15', 'Cantal'], ['16', 'Charente'], ['17', 'Charente-Maritime'],
  ['18', 'Cher'], ['19', 'Corrèze'], ['2A', 'Corse-du-Sud'], ['2B', 'Haute-Corse'],
  ['21', "Côte-d'Or"], ["22", "Côtes-d'Armor"], ['23', 'Creuse'], ['24', 'Dordogne'],
  ['25', 'Doubs'], ['26', 'Drôme'], ['27', 'Eure'], ['28', 'Eure-et-Loir'], ['29', 'Finistère'],
  ['30', 'Gard'], ['31', 'Haute-Garonne'], ['32', 'Gers'], ['33', 'Gironde'], ['34', 'Hérault'],
  ['35', 'Ille-et-Vilaine'], ['36', 'Indre'], ['37', 'Indre-et-Loire'], ['38', 'Isère'],
  ['39', 'Jura'], ['40', 'Landes'], ['41', 'Loir-et-Cher'], ['42', 'Loire'], ['43', 'Haute-Loire'],
  ['44', 'Loire-Atlantique'], ['45', 'Loiret'], ['46', 'Lot'], ['47', 'Lot-et-Garonne'],
  ['48', 'Lozère'], ['49', 'Maine-et-Loire'], ['50', 'Manche'], ['51', 'Marne'], ['52', 'Haute-Marne'],
  ['53', 'Mayenne'], ['54', 'Meurthe-et-Moselle'], ['55', 'Meuse'], ['56', 'Morbihan'], ['57', 'Moselle'],
  ['58', 'Nièvre'], ['59', 'Nord'], ['60', 'Oise'], ['61', 'Orne'], ['62', 'Pas-de-Calais'],
  ['63', 'Puy-de-Dôme'], ['64', 'Pyrénées-Atlantiques'], ['65', 'Hautes-Pyrénées'],
  ['66', 'Pyrénées-Orientales'], ['67', 'Bas-Rhin'], ['68', 'Haut-Rhin'], ['69', 'Rhône'],
  ['70', 'Haute-Saône'], ['71', 'Saône-et-Loire'], ['72', 'Sarthe'], ['73', 'Savoie'],
  ['74', 'Haute-Savoie'], ['75', 'Paris'], ['76', 'Seine-Maritime'], ['77', 'Seine-et-Marne'],
  ['78', 'Yvelines'], ['79', 'Deux-Sèvres'], ['80', 'Somme'], ['81', 'Tarn'], ['82', 'Tarn-et-Garonne'],
  ['83', 'Var'], ['84', 'Vaucluse'], ['85', 'Vendée'], ['86', 'Vienne'], ['87', 'Haute-Vienne'],
  ['88', 'Vosges'], ['89', 'Yonne'], ['90', 'Territoire de Belfort'], ['91', 'Essonne'],
  ['92', 'Hauts-de-Seine'], ['93', 'Seine-Saint-Denis'], ['94', 'Val-de-Marne'], ['95', "Val-d'Oise"],
  ['971', 'Guadeloupe'], ['972', 'Martinique'], ['973', 'Guyane'], ['974', 'La Réunion'], ['976', 'Mayotte'],
];

// ── USA — states (flag → name) ───────────────────────────────────────────────
// [postal, name_en, name_fr]; flagcdn slug is `us-<postal>`.
const US_STATES: [string, string, string][] = [
  ['AL', 'Alabama', 'Alabama'], ['AK', 'Alaska', 'Alaska'], ['AZ', 'Arizona', 'Arizona'],
  ['AR', 'Arkansas', 'Arkansas'], ['CA', 'California', 'Californie'], ['CO', 'Colorado', 'Colorado'],
  ['CT', 'Connecticut', 'Connecticut'], ['DE', 'Delaware', 'Delaware'], ['FL', 'Florida', 'Floride'],
  ['GA', 'Georgia', 'Géorgie'], ['HI', 'Hawaii', 'Hawaï'], ['ID', 'Idaho', 'Idaho'],
  ['IL', 'Illinois', 'Illinois'], ['IN', 'Indiana', 'Indiana'], ['IA', 'Iowa', 'Iowa'],
  ['KS', 'Kansas', 'Kansas'], ['KY', 'Kentucky', 'Kentucky'], ['LA', 'Louisiana', 'Louisiane'],
  ['ME', 'Maine', 'Maine'], ['MD', 'Maryland', 'Maryland'], ['MA', 'Massachusetts', 'Massachusetts'],
  ['MI', 'Michigan', 'Michigan'], ['MN', 'Minnesota', 'Minnesota'], ['MS', 'Mississippi', 'Mississippi'],
  ['MO', 'Missouri', 'Missouri'], ['MT', 'Montana', 'Montana'], ['NE', 'Nebraska', 'Nebraska'],
  ['NV', 'Nevada', 'Nevada'], ['NH', 'New Hampshire', 'New Hampshire'], ['NJ', 'New Jersey', 'New Jersey'],
  ['NM', 'New Mexico', 'Nouveau-Mexique'], ['NY', 'New York', 'New York'],
  ['NC', 'North Carolina', 'Caroline du Nord'], ['ND', 'North Dakota', 'Dakota du Nord'],
  ['OH', 'Ohio', 'Ohio'], ['OK', 'Oklahoma', 'Oklahoma'], ['OR', 'Oregon', 'Oregon'],
  ['PA', 'Pennsylvania', 'Pennsylvanie'], ['RI', 'Rhode Island', 'Rhode Island'],
  ['SC', 'South Carolina', 'Caroline du Sud'], ['SD', 'South Dakota', 'Dakota du Sud'],
  ['TN', 'Tennessee', 'Tennessee'], ['TX', 'Texas', 'Texas'], ['UT', 'Utah', 'Utah'],
  ['VT', 'Vermont', 'Vermont'], ['VA', 'Virginia', 'Virginie'], ['WA', 'Washington', 'Washington'],
  ['WV', 'West Virginia', 'Virginie-Occidentale'], ['WI', 'Wisconsin', 'Wisconsin'], ['WY', 'Wyoming', 'Wyoming'],
];

const frDeptEntities: ChallengeEntity[] = FR_DEPARTMENTS.map(([code, name]) => ({
  id: `FR-D-${code}`,
  answerFr: code,
  answerEn: code,
  promptFr: name,
  promptEn: name,
}));

const usStateEntities: ChallengeEntity[] = US_STATES.map(([postal, nameEn, nameFr]) => ({
  id: `US-${postal}`,
  answerFr: nameFr,
  answerEn: nameEn,
  flagSlug: `us-${postal.toLowerCase()}`,
  // Accept either language's spelling when typed.
  aliases: nameEn === nameFr ? [postal] : [nameEn, nameFr, postal],
}));

// ── Generic "subdivision → capital" data ─────────────────────────────────────
// [id, promptFr, promptEn, capitalFr, capitalEn, ...aliases]. The two capital
// spellings are auto-accepted in CASH; aliases add local/other spellings.
type CapitalRow = [string, string, string, string, string, ...string[]];

function capitalEntities(prefix: string, rows: CapitalRow[]): ChallengeEntity[] {
  return rows.map(([id, promptFr, promptEn, capFr, capEn, ...aliases]) => ({
    id: `${prefix}-${id}`,
    answerFr: capFr,
    answerEn: capEn,
    promptFr,
    promptEn,
    // answerFr/answerEn are auto-accepted; aliases only add extra spellings.
    ...(aliases.length ? { aliases } : {}),
  }));
}

// France — 13 metropolitan régions → chef-lieu.
const FR_REGIONS: CapitalRow[] = [
  ['ARA', 'Auvergne-Rhône-Alpes', 'Auvergne-Rhône-Alpes', 'Lyon', 'Lyon'],
  ['BFC', 'Bourgogne-Franche-Comté', 'Bourgogne-Franche-Comté', 'Dijon', 'Dijon'],
  ['BRE', 'Bretagne', 'Brittany', 'Rennes', 'Rennes'],
  ['CVL', 'Centre-Val de Loire', 'Centre-Val de Loire', 'Orléans', 'Orléans', 'Orleans'],
  ['COR', 'Corse', 'Corsica', 'Ajaccio', 'Ajaccio'],
  ['GES', 'Grand Est', 'Grand Est', 'Strasbourg', 'Strasbourg'],
  ['HDF', 'Hauts-de-France', 'Hauts-de-France', 'Lille', 'Lille'],
  ['IDF', 'Île-de-France', 'Île-de-France', 'Paris', 'Paris'],
  ['NOR', 'Normandie', 'Normandy', 'Rouen', 'Rouen'],
  ['NAQ', 'Nouvelle-Aquitaine', 'Nouvelle-Aquitaine', 'Bordeaux', 'Bordeaux'],
  ['OCC', 'Occitanie', 'Occitania', 'Toulouse', 'Toulouse'],
  ['PDL', 'Pays de la Loire', 'Pays de la Loire', 'Nantes', 'Nantes'],
  ['PAC', "Provence-Alpes-Côte d'Azur", "Provence-Alpes-Côte d'Azur", 'Marseille', 'Marseille', 'Marseilles'],
];

// USA — 50 state capitals.
const US_CAPITALS: CapitalRow[] = [
  ['AL', 'Alabama', 'Alabama', 'Montgomery', 'Montgomery'],
  ['AK', 'Alaska', 'Alaska', 'Juneau', 'Juneau'],
  ['AZ', 'Arizona', 'Arizona', 'Phoenix', 'Phoenix'],
  ['AR', 'Arkansas', 'Arkansas', 'Little Rock', 'Little Rock'],
  ['CA', 'Californie', 'California', 'Sacramento', 'Sacramento'],
  ['CO', 'Colorado', 'Colorado', 'Denver', 'Denver'],
  ['CT', 'Connecticut', 'Connecticut', 'Hartford', 'Hartford'],
  ['DE', 'Delaware', 'Delaware', 'Dover', 'Dover'],
  ['FL', 'Floride', 'Florida', 'Tallahassee', 'Tallahassee'],
  ['GA', 'Géorgie', 'Georgia', 'Atlanta', 'Atlanta'],
  ['HI', 'Hawaï', 'Hawaii', 'Honolulu', 'Honolulu'],
  ['ID', 'Idaho', 'Idaho', 'Boise', 'Boise'],
  ['IL', 'Illinois', 'Illinois', 'Springfield', 'Springfield'],
  ['IN', 'Indiana', 'Indiana', 'Indianapolis', 'Indianapolis'],
  ['IA', 'Iowa', 'Iowa', 'Des Moines', 'Des Moines'],
  ['KS', 'Kansas', 'Kansas', 'Topeka', 'Topeka'],
  ['KY', 'Kentucky', 'Kentucky', 'Frankfort', 'Frankfort'],
  ['LA', 'Louisiane', 'Louisiana', 'Baton Rouge', 'Baton Rouge'],
  ['ME', 'Maine', 'Maine', 'Augusta', 'Augusta'],
  ['MD', 'Maryland', 'Maryland', 'Annapolis', 'Annapolis'],
  ['MA', 'Massachusetts', 'Massachusetts', 'Boston', 'Boston'],
  ['MI', 'Michigan', 'Michigan', 'Lansing', 'Lansing'],
  ['MN', 'Minnesota', 'Minnesota', 'Saint Paul', 'Saint Paul', 'St. Paul', 'St Paul'],
  ['MS', 'Mississippi', 'Mississippi', 'Jackson', 'Jackson'],
  ['MO', 'Missouri', 'Missouri', 'Jefferson City', 'Jefferson City'],
  ['MT', 'Montana', 'Montana', 'Helena', 'Helena'],
  ['NE', 'Nebraska', 'Nebraska', 'Lincoln', 'Lincoln'],
  ['NV', 'Nevada', 'Nevada', 'Carson City', 'Carson City'],
  ['NH', 'New Hampshire', 'New Hampshire', 'Concord', 'Concord'],
  ['NJ', 'New Jersey', 'New Jersey', 'Trenton', 'Trenton'],
  ['NM', 'Nouveau-Mexique', 'New Mexico', 'Santa Fe', 'Santa Fe'],
  ['NY', 'New York', 'New York', 'Albany', 'Albany'],
  ['NC', 'Caroline du Nord', 'North Carolina', 'Raleigh', 'Raleigh'],
  ['ND', 'Dakota du Nord', 'North Dakota', 'Bismarck', 'Bismarck'],
  ['OH', 'Ohio', 'Ohio', 'Columbus', 'Columbus'],
  ['OK', 'Oklahoma', 'Oklahoma', 'Oklahoma City', 'Oklahoma City'],
  ['OR', 'Oregon', 'Oregon', 'Salem', 'Salem'],
  ['PA', 'Pennsylvanie', 'Pennsylvania', 'Harrisburg', 'Harrisburg'],
  ['RI', 'Rhode Island', 'Rhode Island', 'Providence', 'Providence'],
  ['SC', 'Caroline du Sud', 'South Carolina', 'Columbia', 'Columbia'],
  ['SD', 'Dakota du Sud', 'South Dakota', 'Pierre', 'Pierre'],
  ['TN', 'Tennessee', 'Tennessee', 'Nashville', 'Nashville'],
  ['TX', 'Texas', 'Texas', 'Austin', 'Austin'],
  ['UT', 'Utah', 'Utah', 'Salt Lake City', 'Salt Lake City'],
  ['VT', 'Vermont', 'Vermont', 'Montpelier', 'Montpelier'],
  ['VA', 'Virginie', 'Virginia', 'Richmond', 'Richmond'],
  ['WA', 'Washington', 'Washington', 'Olympia', 'Olympia'],
  ['WV', 'Virginie-Occidentale', 'West Virginia', 'Charleston', 'Charleston'],
  ['WI', 'Wisconsin', 'Wisconsin', 'Madison', 'Madison'],
  ['WY', 'Wyoming', 'Wyoming', 'Cheyenne', 'Cheyenne'],
];

// Germany — 13 Länder → capital (the three city-states Berlin/Hamburg/Bremen
// are their own capitals, which makes degenerate questions — skipped).
const DE_LAENDER: CapitalRow[] = [
  ['BW', 'Bade-Wurtemberg', 'Baden-Württemberg', 'Stuttgart', 'Stuttgart'],
  ['BY', 'Bavière', 'Bavaria', 'Munich', 'Munich', 'München', 'Munchen'],
  ['BB', 'Brandebourg', 'Brandenburg', 'Potsdam', 'Potsdam'],
  ['HE', 'Hesse', 'Hesse', 'Wiesbaden', 'Wiesbaden'],
  ['MV', 'Mecklembourg-Poméranie-Occidentale', 'Mecklenburg-Vorpommern', 'Schwerin', 'Schwerin'],
  ['NI', 'Basse-Saxe', 'Lower Saxony', 'Hanovre', 'Hanover', 'Hannover'],
  ['NW', 'Rhénanie-du-Nord-Westphalie', 'North Rhine-Westphalia', 'Düsseldorf', 'Düsseldorf', 'Dusseldorf'],
  ['RP', 'Rhénanie-Palatinat', 'Rhineland-Palatinate', 'Mayence', 'Mainz'],
  ['SL', 'Sarre', 'Saarland', 'Sarrebruck', 'Saarbrücken', 'Saarbrucken'],
  ['SN', 'Saxe', 'Saxony', 'Dresde', 'Dresden'],
  ['ST', 'Saxe-Anhalt', 'Saxony-Anhalt', 'Magdebourg', 'Magdeburg'],
  ['SH', 'Schleswig-Holstein', 'Schleswig-Holstein', 'Kiel', 'Kiel'],
  ['TH', 'Thuringe', 'Thuringia', 'Erfurt', 'Erfurt'],
];

// Spain — comunidades autónomas → capital. Skipped: Canary Islands (two
// co-capitals) and Madrid / Murcia (the answer is in the name).
const ES_COMUNIDADES: CapitalRow[] = [
  ['AN', 'Andalousie', 'Andalusia', 'Séville', 'Seville', 'Sevilla'],
  ['AR', 'Aragon', 'Aragon', 'Saragosse', 'Zaragoza', 'Saragossa'],
  ['AS', 'Asturies', 'Asturias', 'Oviedo', 'Oviedo'],
  ['IB', 'Îles Baléares', 'Balearic Islands', 'Palma', 'Palma', 'Palma de Majorque', 'Palma de Mallorca'],
  ['CB', 'Cantabrie', 'Cantabria', 'Santander', 'Santander'],
  ['CL', 'Castille-et-León', 'Castile and León', 'Valladolid', 'Valladolid'],
  ['CM', 'Castille-La Manche', 'Castilla-La Mancha', 'Tolède', 'Toledo'],
  ['CT', 'Catalogne', 'Catalonia', 'Barcelone', 'Barcelona'],
  ['EX', 'Estrémadure', 'Extremadura', 'Mérida', 'Mérida', 'Merida'],
  ['GA', 'Galice', 'Galicia', 'Saint-Jacques-de-Compostelle', 'Santiago de Compostela', 'Santiago', 'Saint-Jacques'],
  ['RI', 'La Rioja', 'La Rioja', 'Logroño', 'Logroño', 'Logrono'],
  ['NC', 'Navarre', 'Navarre', 'Pampelune', 'Pamplona'],
  ['PV', 'Pays basque', 'Basque Country', 'Vitoria-Gasteiz', 'Vitoria-Gasteiz', 'Vitoria'],
  ['VC', 'Communauté valencienne', 'Valencian Community', 'Valence', 'Valencia'],
];

// Italy — 20 regioni → capoluogo.
const IT_REGIONS: CapitalRow[] = [
  ['ABR', 'Abruzzes', 'Abruzzo', "L'Aquila", "L'Aquila", 'Aquila'],
  ['BAS', 'Basilicate', 'Basilicata', 'Potenza', 'Potenza'],
  ['CAL', 'Calabre', 'Calabria', 'Catanzaro', 'Catanzaro'],
  ['CAM', 'Campanie', 'Campania', 'Naples', 'Naples', 'Napoli'],
  ['EMR', 'Émilie-Romagne', 'Emilia-Romagna', 'Bologne', 'Bologna'],
  ['FVG', 'Frioul-Vénétie Julienne', 'Friuli Venezia Giulia', 'Trieste', 'Trieste'],
  ['LAZ', 'Latium', 'Lazio', 'Rome', 'Rome', 'Roma'],
  ['LIG', 'Ligurie', 'Liguria', 'Gênes', 'Genoa', 'Genova', 'Genes'],
  ['LOM', 'Lombardie', 'Lombardy', 'Milan', 'Milan', 'Milano'],
  ['MAR', 'Marches', 'Marche', 'Ancône', 'Ancona', 'Ancone'],
  ['MOL', 'Molise', 'Molise', 'Campobasso', 'Campobasso'],
  ['PIE', 'Piémont', 'Piedmont', 'Turin', 'Turin', 'Torino'],
  ['PUG', 'Pouilles', 'Apulia', 'Bari', 'Bari'],
  ['SAR', 'Sardaigne', 'Sardinia', 'Cagliari', 'Cagliari'],
  ['SIC', 'Sicile', 'Sicily', 'Palerme', 'Palermo'],
  ['TOS', 'Toscane', 'Tuscany', 'Florence', 'Florence', 'Firenze'],
  ['TAA', 'Trentin-Haut-Adige', 'Trentino-Alto Adige', 'Trente', 'Trento'],
  ['UMB', 'Ombrie', 'Umbria', 'Pérouse', 'Perugia', 'Perouse'],
  ['VDA', "Vallée d'Aoste", 'Aosta Valley', 'Aoste', 'Aosta'],
  ['VEN', 'Vénétie', 'Veneto', 'Venise', 'Venice', 'Venezia'],
];

// Canada — 13 provinces & territories → capital.
const CA_PROVINCES: CapitalRow[] = [
  ['AB', 'Alberta', 'Alberta', 'Edmonton', 'Edmonton'],
  ['BC', 'Colombie-Britannique', 'British Columbia', 'Victoria', 'Victoria'],
  ['MB', 'Manitoba', 'Manitoba', 'Winnipeg', 'Winnipeg'],
  ['NB', 'Nouveau-Brunswick', 'New Brunswick', 'Fredericton', 'Fredericton'],
  ['NL', 'Terre-Neuve-et-Labrador', 'Newfoundland and Labrador', 'Saint-Jean', "St. John's", 'St Johns', 'Saint Johns', 'Saint-Jean de Terre-Neuve'],
  ['NS', 'Nouvelle-Écosse', 'Nova Scotia', 'Halifax', 'Halifax'],
  ['ON', 'Ontario', 'Ontario', 'Toronto', 'Toronto'],
  ['PE', 'Île-du-Prince-Édouard', 'Prince Edward Island', 'Charlottetown', 'Charlottetown'],
  ['QC', 'Québec', 'Quebec', 'Québec', 'Quebec City', 'Quebec', 'Ville de Québec'],
  ['SK', 'Saskatchewan', 'Saskatchewan', 'Regina', 'Regina'],
  ['NT', 'Territoires du Nord-Ouest', 'Northwest Territories', 'Yellowknife', 'Yellowknife'],
  ['NU', 'Nunavut', 'Nunavut', 'Iqaluit', 'Iqaluit'],
  ['YT', 'Yukon', 'Yukon', 'Whitehorse', 'Whitehorse'],
];

export const CHALLENGES: Challenge[] = [
  {
    id: 'fr-dept-number',
    country: 'FRA',
    emoji: '🇫🇷',
    titleFr: 'Numéro de département',
    titleEn: 'Department number',
    subtitleFr: 'Trouve le numéro à partir du nom',
    subtitleEn: 'Find the number from the name',
    questionFr: 'Quel est le numéro de ce département ?',
    questionEn: 'What is this department’s number?',
    promptKind: 'text',
    answerKind: 'number',
    entities: frDeptEntities,
  },
  {
    id: 'fr-region-capital',
    country: 'FRA',
    emoji: '🇫🇷',
    titleFr: 'Chefs-lieux des régions',
    titleEn: 'Regional capitals',
    subtitleFr: 'Trouve le chef-lieu de chaque région',
    subtitleEn: 'Find each region’s capital',
    questionFr: 'Quel est le chef-lieu de cette région ?',
    questionEn: 'What is this region’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('FR-R', FR_REGIONS),
  },
  {
    id: 'us-state-flag',
    country: 'USA',
    emoji: '🇺🇸',
    titleFr: 'Drapeaux des États',
    titleEn: 'State flags',
    subtitleFr: "Trouve l'État à partir de son drapeau",
    subtitleEn: 'Find the state from its flag',
    questionFr: 'Quel est cet État ?',
    questionEn: 'Which state is this?',
    promptKind: 'flag',
    answerKind: 'name',
    entities: usStateEntities,
  },
  {
    id: 'us-state-capital',
    country: 'USA',
    emoji: '🇺🇸',
    titleFr: 'Capitales des États',
    titleEn: 'State capitals',
    subtitleFr: 'Trouve la capitale de chaque État',
    subtitleEn: 'Find each state’s capital',
    questionFr: 'Quelle est la capitale de cet État ?',
    questionEn: 'What is this state’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('US-C', US_CAPITALS),
  },
  {
    id: 'de-land-capital',
    country: 'DEU',
    emoji: '🇩🇪',
    titleFr: 'Capitales des Länder',
    titleEn: 'Länder capitals',
    subtitleFr: 'Trouve la capitale de chaque Land',
    subtitleEn: 'Find each Land’s capital',
    questionFr: 'Quelle est la capitale de ce Land ?',
    questionEn: 'What is this Land’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('DE-L', DE_LAENDER),
  },
  {
    id: 'es-comunidad-capital',
    country: 'ESP',
    emoji: '🇪🇸',
    titleFr: 'Capitales des communautés',
    titleEn: 'Community capitals',
    subtitleFr: 'Trouve la capitale de chaque communauté autonome',
    subtitleEn: 'Find each autonomous community’s capital',
    questionFr: 'Quelle est la capitale de cette communauté ?',
    questionEn: 'What is this community’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('ES-C', ES_COMUNIDADES),
  },
  {
    id: 'it-region-capital',
    country: 'ITA',
    emoji: '🇮🇹',
    titleFr: 'Chefs-lieux des régions',
    titleEn: 'Regional capitals',
    subtitleFr: 'Trouve le chef-lieu de chaque région',
    subtitleEn: 'Find each region’s capital',
    questionFr: 'Quel est le chef-lieu de cette région ?',
    questionEn: 'What is this region’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('IT-R', IT_REGIONS),
  },
  {
    id: 'ca-province-capital',
    country: 'CAN',
    emoji: '🇨🇦',
    titleFr: 'Capitales des provinces',
    titleEn: 'Provincial capitals',
    subtitleFr: 'Trouve la capitale de chaque province et territoire',
    subtitleEn: 'Find each province and territory’s capital',
    questionFr: 'Quelle est la capitale de cette province ?',
    questionEn: 'What is this province’s capital?',
    promptKind: 'text',
    answerKind: 'name',
    entities: capitalEntities('CA-P', CA_PROVINCES),
  },
];

/** Display names for the countries that own challenges. */
const COUNTRY_LABELS: Record<string, [string, string]> = {
  FRA: ['France', 'France'],
  USA: ['États-Unis', 'United States'],
  DEU: ['Allemagne', 'Germany'],
  ESP: ['Espagne', 'Spain'],
  ITA: ['Italie', 'Italy'],
  CAN: ['Canada', 'Canada'],
};

export function countryLabel(cca3: string, lang: 'fr' | 'en'): string {
  const l = COUNTRY_LABELS[cca3];
  return l ? (lang === 'fr' ? l[0] : l[1]) : cca3;
}

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}

/** The challenges available for a given country (cca3) — empty for most. */
export function challengesForCountry(cca3: string): Challenge[] {
  return CHALLENGES.filter((c) => c.country === cca3);
}

/** Challenges grouped by country, preserving declaration order. */
export function challengesByCountry(): { country: string; emoji: string; items: Challenge[] }[] {
  const out: { country: string; emoji: string; items: Challenge[] }[] = [];
  for (const ch of CHALLENGES) {
    let group = out.find((g) => g.country === ch.country);
    if (!group) {
      group = { country: ch.country, emoji: ch.emoji, items: [] };
      out.push(group);
    }
    group.items.push(ch);
  }
  return out;
}

// ── Per-entity accessors (language-aware) ────────────────────────────────────

export function entityAnswer(e: ChallengeEntity, lang: 'fr' | 'en'): string {
  return lang === 'fr' ? e.answerFr : e.answerEn;
}

export function entityPrompt(e: ChallengeEntity, lang: 'fr' | 'en'): string {
  return (lang === 'fr' ? e.promptFr : e.promptEn) ?? '';
}

export function entityFlagUrl(e: ChallengeEntity): string | null {
  return e.flagSlug ? getSubdivisionFlagUrl(e.flagSlug) : null;
}

/** Every accepted spelling for a CASH answer (both languages + aliases). */
export function entityAcceptedAnswers(e: ChallengeEntity): string[] {
  return Array.from(new Set([e.answerFr, e.answerEn, ...(e.aliases ?? [])].filter(Boolean)));
}

/**
 * `count` distinct wrong answers (in `lang`) drawn from the other entities, for
 * the DUO/CARRÉ option grids. Deterministic when `rng` is seeded. Pure.
 */
export function pickDistractors(
  entities: ChallengeEntity[],
  correct: ChallengeEntity,
  count: number,
  lang: 'fr' | 'en',
  rng: () => number,
): string[] {
  const correctAns = entityAnswer(correct, lang);
  const pool = entities.filter((e) => e.id !== correct.id);
  // Fisher–Yates partial shuffle, collecting distinct answers.
  const picked: string[] = [];
  const seen = new Set<string>([correctAns]);
  const idxs = pool.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0 && picked.length < count; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    const ans = entityAnswer(pool[idxs[i]], lang);
    if (!seen.has(ans)) {
      seen.add(ans);
      picked.push(ans);
    }
  }
  return picked;
}
