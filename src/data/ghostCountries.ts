/**
 * « Pays fantômes » — le défi spécial d'Halloween.
 *
 * Des pays qui n'existent plus, dessinés avec la silhouette qu'ils avaient. Deux
 * familles, et c'est voulu :
 *  - les unions dissoutes (URSS, Yougoslavie…) : leur forme est la réunion des
 *    pays actuels qui les composaient (`members`) ;
 *  - les noms disparus (Zaïre, Siam…) : même forme qu'aujourd'hui, l'astuce est
 *    de reconnaître le pays sous son ancien nom.
 *
 * Les frontières sont celles des pays actuels (assets/world_polygons.json) :
 * pour la Grande Colombie ou l'Union de Kalmar, c'est une approximation honnête,
 * pas une carte d'historien. Le Kosovo manque au fond de carte : `patches`
 * comble le trou au milieu de la Yougoslavie (sommets repris des voisins, donc
 * jointif).
 */
import type { Language } from '../types';

export interface GhostCountry {
  /** Identifiant stable (pas un cca3 : ces pays n'en ont plus). */
  id: string;
  /** Pays actuels qui forment la silhouette (cca3). */
  members: string[];
  /** Anneaux [lng, lat] ajoutés à la silhouette (territoires absents du fond). */
  patches?: number[][][];
  /** Anneaux au nord de cette latitude écartés (Svalbard : norvégien seulement depuis 1925). */
  maxLat?: number;
  /** Période affichée après la réponse. */
  years: string;
  /** Le nom dans les seize langues de l'app. */
  names: Record<Language, string>;
  /** Orthographes acceptées en plus des noms (sigles, variantes). */
  aliases?: string[];
}

/** Le Kosovo, absent du fond de carte, découpé sur les sommets de ses voisins. */
const KOSOVO: number[][] = [
  [20.07, 42.59], [20.28, 42.32], [20.52, 42.22], [20.59, 41.86], [20.72, 41.85],
  [20.76, 42.05], [21.35, 42.21], [21.58, 42.25], [21.54, 42.32], [21.66, 42.44],
  [21.77, 42.68], [21.63, 42.68], [21.44, 42.86], [21.27, 42.91], [21.14, 43.07],
  [20.96, 43.13], [20.81, 43.27], [20.63, 43.22], [20.5, 42.88], [20.26, 42.81],
  [20.07, 42.59],
];

export const GHOST_COUNTRIES: GhostCountry[] = [
  {
    id: 'ussr',
    members: ['RUS', 'UKR', 'BLR', 'EST', 'LVA', 'LTU', 'MDA', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'],
    years: '1922–1991',
    names: {
      fr: 'URSS', en: 'Soviet Union', es: 'Unión Soviética', pt: 'União Soviética', de: 'Sowjetunion',
      it: 'Unione Sovietica', ru: 'СССР', tr: 'Sovyetler Birliği', pl: 'Związek Radziecki', nl: 'Sovjet-Unie',
      id: 'Uni Soviet', vi: 'Liên Xô', th: 'สหภาพโซเวียต', uk: 'СРСР', ro: 'Uniunea Sovietică', el: 'Σοβιετική Ένωση',
    },
    aliases: ['USSR', 'UdSSR', 'CCCP', 'Union soviétique', 'URSS', 'Советский Союз'],
  },
  {
    id: 'yugoslavia',
    members: ['SVN', 'HRV', 'BIH', 'SRB', 'MNE', 'MKD'],
    patches: [KOSOVO],
    years: '1918–1992',
    names: {
      fr: 'Yougoslavie', en: 'Yugoslavia', es: 'Yugoslavia', pt: 'Iugoslávia', de: 'Jugoslawien',
      it: 'Jugoslavia', ru: 'Югославия', tr: 'Yugoslavya', pl: 'Jugosławia', nl: 'Joegoslavië',
      id: 'Yugoslavia', vi: 'Nam Tư', th: 'ยูโกสลาเวีย', uk: 'Югославія', ro: 'Iugoslavia', el: 'Γιουγκοσλαβία',
    },
  },
  {
    id: 'czechoslovakia',
    members: ['CZE', 'SVK'],
    years: '1918–1992',
    names: {
      fr: 'Tchécoslovaquie', en: 'Czechoslovakia', es: 'Checoslovaquia', pt: 'Tchecoslováquia', de: 'Tschechoslowakei',
      it: 'Cecoslovacchia', ru: 'Чехословакия', tr: 'Çekoslovakya', pl: 'Czechosłowacja', nl: 'Tsjecho-Slowakije',
      id: 'Cekoslowakia', vi: 'Tiệp Khắc', th: 'เชโกสโลวาเกีย', uk: 'Чехословаччина', ro: 'Cehoslovacia', el: 'Τσεχοσλοβακία',
    },
  },
  {
    id: 'gran-colombia',
    members: ['COL', 'VEN', 'ECU', 'PAN'],
    years: '1819–1831',
    names: {
      fr: 'Grande Colombie', en: 'Gran Colombia', es: 'Gran Colombia', pt: 'Grã-Colômbia', de: 'Großkolumbien',
      it: 'Grande Colombia', ru: 'Великая Колумбия', tr: 'Büyük Kolombiya', pl: 'Wielka Kolumbia', nl: 'Groot-Colombia',
      id: 'Kolombia Raya', vi: 'Đại Colombia', th: 'แกรนโคลอมเบีย', uk: 'Велика Колумбія', ro: 'Marea Columbie', el: 'Μεγάλη Κολομβία',
    },
  },
  {
    id: 'uar',
    members: ['EGY', 'SYR'],
    years: '1958–1961',
    names: {
      fr: 'République arabe unie', en: 'United Arab Republic', es: 'República Árabe Unida', pt: 'República Árabe Unida',
      de: 'Vereinigte Arabische Republik', it: 'Repubblica Araba Unita', ru: 'Объединённая Арабская Республика',
      tr: 'Birleşik Arap Cumhuriyeti', pl: 'Zjednoczona Republika Arabska', nl: 'Verenigde Arabische Republiek',
      id: 'Republik Persatuan Arab', vi: 'Cộng hòa Ả Rập Thống nhất', th: 'สหสาธารณรัฐอาหรับ',
      uk: 'Обʼєднана Арабська Республіка', ro: 'Republica Arabă Unită', el: 'Ηνωμένη Αραβική Δημοκρατία',
    },
    aliases: ['RAU', 'UAR'],
  },
  {
    id: 'mali-federation',
    members: ['SEN', 'MLI'],
    years: '1959–1960',
    names: {
      fr: 'Fédération du Mali', en: 'Mali Federation', es: 'Federación de Malí', pt: 'Federação do Mali',
      de: 'Mali-Föderation', it: 'Federazione del Mali', ru: 'Федерация Мали', tr: 'Mali Federasyonu',
      pl: 'Federacja Mali', nl: 'Mali-federatie', id: 'Federasi Mali', vi: 'Liên bang Mali',
      th: 'สหพันธรัฐมาลี', uk: 'Федерація Малі', ro: 'Federația Mali', el: 'Ομοσπονδία του Μάλι',
    },
  },
  {
    id: 'central-america',
    members: ['GTM', 'SLV', 'HND', 'NIC', 'CRI'],
    years: '1823–1841',
    names: {
      fr: 'Provinces-Unies d’Amérique centrale', en: 'Federal Republic of Central America',
      es: 'República Federal de Centro América', pt: 'República Federal da América Central',
      de: 'Zentralamerikanische Föderation', it: 'Repubblica Federale del Centro America',
      ru: 'Соединённые провинции Центральной Америки', tr: 'Orta Amerika Federal Cumhuriyeti',
      pl: 'Federacja Ameryki Środkowej', nl: 'Federale Republiek van Centraal-Amerika',
      id: 'Republik Federal Amerika Tengah', vi: 'Cộng hòa Liên bang Trung Mỹ', th: 'สหพันธ์สาธารณรัฐอเมริกากลาง',
      uk: 'Федеративна Республіка Центральної Америки', ro: 'Republica Federală a Americii Centrale',
      el: 'Ομοσπονδιακή Δημοκρατία της Κεντρικής Αμερικής',
    },
    aliases: ['Amérique centrale', 'Central America', 'Centroamérica'],
  },
  {
    id: 'sweden-norway',
    members: ['SWE', 'NOR'],
    maxLat: 75,
    years: '1814–1905',
    names: {
      fr: 'Suède-Norvège', en: 'Sweden-Norway', es: 'Suecia-Noruega', pt: 'Suécia-Noruega', de: 'Schweden-Norwegen',
      it: 'Svezia-Norvegia', ru: 'Шведско-норвежская уния', tr: 'İsveç-Norveç', pl: 'Szwecja-Norwegia',
      nl: 'Zweden-Noorwegen', id: 'Swedia-Norwegia', vi: 'Thụy Điển–Na Uy', th: 'สวีเดน-นอร์เวย์',
      uk: 'Шведсько-норвезька унія', ro: 'Suedia-Norvegia', el: 'Σουηδία-Νορβηγία',
    },
  },
  {
    id: 'kalmar',
    members: ['DNK', 'NOR', 'SWE', 'FIN', 'ISL'],
    maxLat: 75,
    years: '1397–1523',
    names: {
      fr: 'Union de Kalmar', en: 'Kalmar Union', es: 'Unión de Kalmar', pt: 'União de Kalmar', de: 'Kalmarer Union',
      it: 'Unione di Kalmar', ru: 'Кальмарская уния', tr: 'Kalmar Birliği', pl: 'Unia kalmarska', nl: 'Unie van Kalmar',
      id: 'Uni Kalmar', vi: 'Liên minh Kalmar', th: 'สหภาพคาลมาร์', uk: 'Кальмарська унія', ro: 'Uniunea de la Kalmar',
      el: 'Ένωση του Κάλμαρ',
    },
  },
  {
    id: 'rhodesia-nyasaland',
    members: ['ZWE', 'ZMB', 'MWI'],
    years: '1953–1963',
    names: {
      fr: 'Fédération de Rhodésie et du Nyassaland', en: 'Federation of Rhodesia and Nyasaland',
      es: 'Federación de Rodesia y Nyasalandia', pt: 'Federação da Rodésia e Niassalândia',
      de: 'Föderation von Rhodesien und Njassaland', it: 'Federazione della Rhodesia e del Nyasaland',
      ru: 'Федерация Родезии и Ньясаленда', tr: 'Rodezya ve Nyasaland Federasyonu', pl: 'Federacja Rodezji i Niasy',
      nl: 'Federatie van Rhodesië en Nyasaland', id: 'Federasi Rhodesia dan Nyasaland',
      vi: 'Liên bang Rhodesia và Nyasaland', th: 'สหพันธรัฐโรดีเชียและไนแอซาแลนด์',
      uk: 'Федерація Родезії і Ньясаленду', ro: 'Federația Rhodesiei și Nyasalandului',
      el: 'Ομοσπονδία της Ροδεσίας και της Νυασαλάνδης',
    },
    aliases: ['Rhodésie', 'Rhodesia'],
  },
  {
    id: 'zaire',
    members: ['COD'],
    years: '1971–1997',
    names: {
      fr: 'Zaïre', en: 'Zaire', es: 'Zaire', pt: 'Zaire', de: 'Zaire', it: 'Zaire', ru: 'Заир', tr: 'Zaire',
      pl: 'Zair', nl: 'Zaïre', id: 'Zaire', vi: 'Zaire', th: 'ซาอีร์', uk: 'Заїр', ro: 'Zair', el: 'Ζαΐρ',
    },
  },
  {
    id: 'ceylon',
    members: ['LKA'],
    years: '1948–1972',
    names: {
      fr: 'Ceylan', en: 'Ceylon', es: 'Ceilán', pt: 'Ceilão', de: 'Ceylon', it: 'Ceylon', ru: 'Цейлон', tr: 'Seylan',
      pl: 'Cejlon', nl: 'Ceylon', id: 'Ceylon', vi: 'Tích Lan', th: 'ซีลอน', uk: 'Цейлон', ro: 'Ceylon', el: 'Κεϋλάνη',
    },
  },
  {
    id: 'persia',
    members: ['IRN'],
    years: '→ 1935',
    names: {
      fr: 'Perse', en: 'Persia', es: 'Persia', pt: 'Pérsia', de: 'Persien', it: 'Persia', ru: 'Персия', tr: 'Pers',
      pl: 'Persja', nl: 'Perzië', id: 'Persia', vi: 'Ba Tư', th: 'เปอร์เซีย', uk: 'Персія', ro: 'Persia', el: 'Περσία',
    },
  },
  {
    id: 'siam',
    members: ['THA'],
    years: '→ 1939',
    names: {
      fr: 'Siam', en: 'Siam', es: 'Siam', pt: 'Sião', de: 'Siam', it: 'Siam', ru: 'Сиам', tr: 'Siyam', pl: 'Syjam',
      nl: 'Siam', id: 'Siam', vi: 'Xiêm', th: 'สยาม', uk: 'Сіам', ro: 'Siam', el: 'Σιάμ',
    },
  },
  {
    id: 'upper-volta',
    members: ['BFA'],
    years: '1958–1984',
    names: {
      fr: 'Haute-Volta', en: 'Upper Volta', es: 'Alto Volta', pt: 'Alto Volta', de: 'Obervolta', it: 'Alto Volta',
      ru: 'Верхняя Вольта', tr: 'Yukarı Volta', pl: 'Górna Wolta', nl: 'Opper-Volta', id: 'Volta Hulu',
      vi: 'Thượng Volta', th: 'อัปเปอร์วอลตา', uk: 'Верхня Вольта', ro: 'Volta Superioară', el: 'Άνω Βόλτα',
    },
  },
  {
    id: 'dahomey',
    members: ['BEN'],
    years: '1958–1975',
    names: {
      fr: 'Dahomey', en: 'Dahomey', es: 'Dahomey', pt: 'Daomé', de: 'Dahome', it: 'Dahomey', ru: 'Дагомея',
      tr: 'Dahomey', pl: 'Dahomej', nl: 'Dahomey', id: 'Dahomey', vi: 'Dahomey', th: 'ดาโฮมีย์', uk: 'Дагомея',
      ro: 'Dahomey', el: 'Νταχομέη',
    },
  },
  {
    id: 'gold-coast',
    members: ['GHA'],
    years: '1867–1957',
    names: {
      fr: 'Côte-de-l’Or', en: 'Gold Coast', es: 'Costa de Oro', pt: 'Costa do Ouro', de: 'Goldküste', it: 'Costa d’Oro',
      ru: 'Золотой Берег', tr: 'Altın Sahili', pl: 'Złote Wybrzeże', nl: 'Goudkust', id: 'Pantai Emas',
      vi: 'Bờ Biển Vàng', th: 'โกลด์โคสต์', uk: 'Золотий Берег', ro: 'Coasta de Aur', el: 'Χρυσή Ακτή',
    },
  },
  {
    id: 'tanganyika',
    members: ['TZA'],
    years: '1961–1964',
    names: {
      fr: 'Tanganyika', en: 'Tanganyika', es: 'Tanganica', pt: 'Tanganica', de: 'Tanganjika', it: 'Tanganica',
      ru: 'Танганьика', tr: 'Tanganika', pl: 'Tanganika', nl: 'Tanganyika', id: 'Tanganyika', vi: 'Tanganyika',
      th: 'แทนกันยีกา', uk: 'Танганьїка', ro: 'Tanganica', el: 'Τανγκανίκα',
    },
  },
];

/**
 * Les jours (UTC, comme le défi du jour) où le slot « Silhouette » devient
 * « Pays fantômes ». Le score part dans le même classement quotidien que la
 * Silhouette : aucune migration serveur, et le défi s'éteint tout seul le 2/11.
 */
export const GHOST_DAYS: readonly string[] = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
