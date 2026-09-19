/**
 * Les textes des notifications poussées, dans les seize langues.
 *
 * ⚠️ Fichier GÉNÉRÉ par `node scripts/gen_push_i18n.mjs` depuis
 * `src/i18n/catalog/` — ne pas éditer à la main : la prochaine génération
 * écraserait la retouche. Pour corriger une traduction, corriger le catalogue.
 *
 * Le serveur écrit ces quelques phrases lui-même (l'app n'est pas là pour le
 * faire) : elles sont donc extraites du même endroit que le reste, et pas
 * retapées ici.
 */
export type PushLang = keyof typeof PUSH_STRINGS;

const PUSH_STRINGS = {
  "en": {
    "New Challenge!": "New Challenge!",
    "{0} challenges you in {2}!": "{0} challenges you in {2}!",
    "{0} wants to be friends": "{0} wants to be friends",
    "A player": "A player",
    "Rankle": "Rankle",
    "Streak": "Streak",
    "Versus": "Versus",
    "Geo Globe": "Geo Globe",
    "Guess the Country": "Guess the Country",
    "Country Challenges": "Country Challenges",
    "Country Quiz": "Country Quiz",
    "Higher or Lower": "Higher or Lower",
    "Silhouette": "Silhouette",
    "Pin on the Globe": "Pin on the Globe",
    "Borders": "Borders",
    "Languages": "Languages"
  },
  "fr": {
    "New Challenge!": "Nouveau défi !",
    "{0} challenges you in {2}!": "{0} vous défie en {1} !",
    "{0} wants to be friends": "{0} veut être votre ami",
    "A player": "Un joueur",
    "Rankle": "Rankle",
    "Streak": "Streak",
    "Versus": "Versus",
    "Geo Globe": "Globe Géo",
    "Guess the Country": "Devinez le Pays",
    "Country Challenges": "Défis Pays",
    "Country Quiz": "Quiz Pays",
    "Higher or Lower": "Plus ou Moins",
    "Silhouette": "Silhouette",
    "Pin on the Globe": "Point sur le Globe",
    "Borders": "Frontières",
    "Languages": "Langues"
  },
  "es": {
    "New Challenge!": "¡Nuevo reto!",
    "{0} challenges you in {2}!": "¡{0} te reta en {2}!",
    "{0} wants to be friends": "{0} quiere ser tu amigo",
    "A player": "Un jugador",
    "Rankle": "Rankle",
    "Streak": "Racha",
    "Versus": "Versus",
    "Geo Globe": "Globo Geo",
    "Guess the Country": "Adivina el país",
    "Country Challenges": "Retos de países",
    "Country Quiz": "Test de países",
    "Higher or Lower": "Más o menos",
    "Silhouette": "Silueta",
    "Pin on the Globe": "Punto en el Globo",
    "Borders": "Fronteras",
    "Languages": "Idiomas"
  },
  "pt": {
    "New Challenge!": "Novo desafio!",
    "{0} challenges you in {2}!": "{0} desafia você em {2}!",
    "{0} wants to be friends": "{0} quer ser seu amigo",
    "A player": "Um jogador",
    "Rankle": "Rankle",
    "Streak": "Sequência",
    "Versus": "Versus",
    "Geo Globe": "Globo Geo",
    "Guess the Country": "Adivinhe o país",
    "Country Challenges": "Desafios de países",
    "Country Quiz": "Quiz de países",
    "Higher or Lower": "Maior ou menor",
    "Silhouette": "Contorno",
    "Pin on the Globe": "Ponto no Globo",
    "Borders": "Fronteiras",
    "Languages": "Idiomas"
  },
  "de": {
    "New Challenge!": "Neue Herausforderung!",
    "{0} challenges you in {2}!": "{0} fordert dich heraus in {2}!",
    "{0} wants to be friends": "{0} möchte dein Freund sein",
    "A player": "Ein Spieler",
    "Rankle": "Rankle",
    "Streak": "Serie",
    "Versus": "Versus",
    "Geo Globe": "Geo-Globus",
    "Guess the Country": "Errate das Land",
    "Country Challenges": "Länder-Challenges",
    "Country Quiz": "Länderquiz",
    "Higher or Lower": "Höher oder niedriger",
    "Silhouette": "Umriss",
    "Pin on the Globe": "Punkt auf dem Globus",
    "Borders": "Grenzen",
    "Languages": "Sprachen"
  },
  "it": {
    "New Challenge!": "Nuova sfida!",
    "{0} challenges you in {2}!": "{0} ti sfida a {2}!",
    "{0} wants to be friends": "{0} vuole essere tuo amico",
    "A player": "Un giocatore",
    "Rankle": "Rankle",
    "Streak": "Serie",
    "Versus": "Versus",
    "Geo Globe": "Globo Geo",
    "Guess the Country": "Indovina il paese",
    "Country Challenges": "Sfide sui paesi",
    "Country Quiz": "Quiz sui paesi",
    "Higher or Lower": "Più o meno",
    "Silhouette": "Profilo",
    "Pin on the Globe": "Punto sul Globo",
    "Borders": "Confini",
    "Languages": "Lingue"
  },
  "ru": {
    "New Challenge!": "Новый вызов!",
    "{0} challenges you in {2}!": "{0} вызывает тебя в режиме {2}!",
    "{0} wants to be friends": "{0} хочет добавить тебя в друзья",
    "A player": "Игрок",
    "Rankle": "Rankle",
    "Streak": "Серия",
    "Versus": "Версус",
    "Geo Globe": "Гео-глобус",
    "Guess the Country": "Угадай страну",
    "Country Challenges": "Испытания по странам",
    "Country Quiz": "Викторина по странам",
    "Higher or Lower": "Больше или меньше",
    "Silhouette": "Силуэт",
    "Pin on the Globe": "Точка на глобусе",
    "Borders": "Границы",
    "Languages": "Языки"
  },
  "tr": {
    "New Challenge!": "Yeni meydan okuma!",
    "{0} challenges you in {2}!": "{0} seni {2} modunda çağırıyor!",
    "{0} wants to be friends": "{0} arkadaşın olmak istiyor",
    "A player": "Bir oyuncu",
    "Rankle": "Rankle",
    "Streak": "Seri",
    "Versus": "Versus",
    "Geo Globe": "Geo Küre",
    "Guess the Country": "Ülkeyi bil",
    "Country Challenges": "Ülke görevleri",
    "Country Quiz": "Ülke testi",
    "Higher or Lower": "Daha çok mu az mı",
    "Silhouette": "Silüet",
    "Pin on the Globe": "Küredeki Nokta",
    "Borders": "Sınırlar",
    "Languages": "Diller"
  },
  "pl": {
    "New Challenge!": "Nowe wyzwanie!",
    "{0} challenges you in {2}!": "{0} wyzywa cię w trybie {2}!",
    "{0} wants to be friends": "{0} chce cię dodać do znajomych",
    "A player": "Gracz",
    "Rankle": "Rankle",
    "Streak": "Seria",
    "Versus": "Versus",
    "Geo Globe": "Globus Geo",
    "Guess the Country": "Zgadnij kraj",
    "Country Challenges": "Wyzwania krajowe",
    "Country Quiz": "Quiz o krajach",
    "Higher or Lower": "Więcej czy mniej",
    "Silhouette": "Kształt",
    "Pin on the Globe": "Punkt na globusie",
    "Borders": "Granice",
    "Languages": "Języki"
  },
  "nl": {
    "New Challenge!": "Nieuwe uitdaging!",
    "{0} challenges you in {2}!": "{0} daagt je uit in {2}!",
    "{0} wants to be friends": "{0} wil je vriend worden",
    "A player": "Een speler",
    "Rankle": "Rankle",
    "Streak": "Reeks",
    "Versus": "Versus",
    "Geo Globe": "Geo-globe",
    "Guess the Country": "Raad het land",
    "Country Challenges": "Landuitdagingen",
    "Country Quiz": "Landenquiz",
    "Higher or Lower": "Hoger of lager",
    "Silhouette": "Silhouet",
    "Pin on the Globe": "Punt op de globe",
    "Borders": "Grenzen",
    "Languages": "Talen"
  },
  "id": {
    "New Challenge!": "Tantangan baru!",
    "{0} challenges you in {2}!": "{0} menantangmu di {2}!",
    "{0} wants to be friends": "{0} ingin berteman denganmu",
    "A player": "Seorang pemain",
    "Rankle": "Rankle",
    "Streak": "Rentetan",
    "Versus": "Versus",
    "Geo Globe": "Bola dunia Geo",
    "Guess the Country": "Tebak negara",
    "Country Challenges": "Tantangan negara",
    "Country Quiz": "Kuis negara",
    "Higher or Lower": "Lebih besar atau lebih kecil",
    "Silhouette": "Siluet",
    "Pin on the Globe": "Titik di Bola Dunia",
    "Borders": "Perbatasan",
    "Languages": "Bahasa"
  },
  "vi": {
    "New Challenge!": "Thử thách mới!",
    "{0} challenges you in {2}!": "{0} thách đấu bạn ở {2}!",
    "{0} wants to be friends": "{0} muốn kết bạn với bạn",
    "A player": "Một người chơi",
    "Rankle": "Rankle",
    "Streak": "Chuỗi",
    "Versus": "Đối đầu",
    "Geo Globe": "Quả cầu Geo",
    "Guess the Country": "Đoán quốc gia",
    "Country Challenges": "Thử thách quốc gia",
    "Country Quiz": "Trắc nghiệm quốc gia",
    "Higher or Lower": "Cao hơn hay thấp hơn",
    "Silhouette": "Hình bóng",
    "Pin on the Globe": "Điểm trên quả cầu",
    "Borders": "Biên giới",
    "Languages": "Ngôn ngữ"
  },
  "th": {
    "New Challenge!": "ท้าดวลใหม่!",
    "{0} challenges you in {2}!": "{0} ท้าคุณในโหมด {2}!",
    "{0} wants to be friends": "{0} อยากเป็นเพื่อนกับคุณ",
    "A player": "ผู้เล่นคนหนึ่ง",
    "Rankle": "Rankle",
    "Streak": "สถิติต่อเนื่อง",
    "Versus": "ประลอง",
    "Geo Globe": "ลูกโลก Geo",
    "Guess the Country": "ทายประเทศ",
    "Country Challenges": "ภารกิจประจำประเทศ",
    "Country Quiz": "แบบทดสอบประเทศ",
    "Higher or Lower": "มากกว่าหรือน้อยกว่า",
    "Silhouette": "เงารูปร่าง",
    "Pin on the Globe": "จุดบนลูกโลก",
    "Borders": "พรมแดน",
    "Languages": "ภาษา"
  },
  "uk": {
    "New Challenge!": "Новий виклик!",
    "{0} challenges you in {2}!": "{0} кидає тобі виклик у режимі {2}!",
    "{0} wants to be friends": "{0} хоче додати тебе у друзі",
    "A player": "Гравець",
    "Rankle": "Rankle",
    "Streak": "Серія",
    "Versus": "Версус",
    "Geo Globe": "Гео-глобус",
    "Guess the Country": "Угадай країну",
    "Country Challenges": "Випробування по країнах",
    "Country Quiz": "Вікторина про країни",
    "Higher or Lower": "Більше чи менше",
    "Silhouette": "Силует",
    "Pin on the Globe": "Точка на глобусі",
    "Borders": "Кордони",
    "Languages": "Мови"
  },
  "ro": {
    "New Challenge!": "Provocare nouă!",
    "{0} challenges you in {2}!": "{0} te provoacă la {2}!",
    "{0} wants to be friends": "{0} vrea să-ți fie prieten",
    "A player": "Un jucător",
    "Rankle": "Rankle",
    "Streak": "Serie",
    "Versus": "Versus",
    "Geo Globe": "Globul Geo",
    "Guess the Country": "Ghicește țara",
    "Country Challenges": "Provocări pe țări",
    "Country Quiz": "Test despre țări",
    "Higher or Lower": "Mai mult sau mai puțin",
    "Silhouette": "Contur",
    "Pin on the Globe": "Punct pe Glob",
    "Borders": "Granițe",
    "Languages": "Limbi"
  },
  "el": {
    "New Challenge!": "Νέα πρόκληση!",
    "{0} challenges you in {2}!": "Ο/Η {0} σε προκαλεί στο {2}!",
    "{0} wants to be friends": "Ο/Η {0} θέλει να γίνετε φίλοι",
    "A player": "Ένας παίκτης",
    "Rankle": "Rankle",
    "Streak": "Σερί",
    "Versus": "Αναμέτρηση",
    "Geo Globe": "Υδρόγειος Geo",
    "Guess the Country": "Μάντεψε τη χώρα",
    "Country Challenges": "Προκλήσεις χωρών",
    "Country Quiz": "Κουίζ χωρών",
    "Higher or Lower": "Πάνω ή κάτω",
    "Silhouette": "Περίγραμμα",
    "Pin on the Globe": "Σημείο στην Υδρόγειο",
    "Borders": "Σύνορα",
    "Languages": "Γλώσσες"
  }
} as const;

/** La langue du destinataire, ou l'anglais si l'app ne la parle pas (ou plus). */
export function pushLang(value: string | null | undefined): PushLang {
  return value && value in PUSH_STRINGS ? (value as PushLang) : 'en';
}

/** Traduit une clé anglaise, en remplaçant les trous `{0}`, `{1}`… */
export function pushText(lang: PushLang, key: string, args: (string | number)[] = []): string {
  const table = PUSH_STRINGS[lang] as Record<string, string>;
  const text = table[key] ?? key;
  return text.replace(/\{(\d+)\}/g, (whole, index) => {
    const value = args[Number(index)];
    return value === undefined ? whole : String(value);
  });
}
