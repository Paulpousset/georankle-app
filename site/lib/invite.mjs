/**
 * La page d'invitation (`/invite.html`), rendue dans chacune des seize langues.
 *
 * C'est la page d'atterrissage de deux liens :
 *   - le lien de parrainage `…/invite.html?code=XXXX&lang=xx` partagé depuis
 *     l'app — la page dit « rejoins-moi », montre le code et la récompense ;
 *   - le bouton « Installe l'app » de la version web (sans code) — la même page
 *     en **mode neutre** : « Installe GeoG », sans code ni récompense, sans
 *     « j'ai déjà l'app ». Le mode se décide côté client sur la présence du
 *     `?code=`, les deux variantes sont dans le HTML.
 *
 * Une coquille PAR LANGUE plutôt qu'un dictionnaire JavaScript : les aperçus
 * de lien (WhatsApp, iMessage, Messenger) lisent les balises Open Graph sans
 * exécuter de script — le titre de la carte doit déjà être dans la bonne
 * langue. La langue vient du `?lang=` du lien (celle du parrain, qui est aussi
 * presque toujours celle du filleul) ; `vercel.json` réécrit
 * `/invite.html?lang=xx` vers `/invite-xx.html`, et `/invite.html` nu vers la
 * version française (les liens déjà partagés avant cette page). Un lien nu
 * ouvert dans un navigateur d'une autre langue est redirigé côté client.
 *
 * Les badges des magasins sont des SVG en ligne (logos Apple et Google Play)
 * pour ne dépendre d'aucune image et rester nets à toute densité.
 */
import { LOCALES, LOCALE_META, href } from './routes.mjs';
import { ORIGIN } from './paths.mjs';
import { attr } from './layout.mjs';

export const STORE_IOS = 'https://apps.apple.com/app/id6779650018';
export const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.paulpousset.geog';

/**
 * Le texte de la page, par langue. `{reward}` est remplacé par la mention de
 * la récompense (mise en valeur). Les petites lignes des badges reprennent la
 * formulation officielle des magasins dans chaque langue.
 */
export const INVITE_COPY = {
  fr: {
    title: 'GeoG — Ton invitation',
    ogTitle: 'Rejoins-moi sur GeoG 🌍',
    ogDescription: "Le quiz de géographie du jour. Installe l'app avec mon lien : on gagne tous les deux 50 pièces.",
    eyebrow: 'Le quiz de géographie du jour',
    h1: 'Rejoins-moi sur GeoG',
    sub: "Installe l'app avec mon lien et on gagne {reward}.",
    reward: 'tous les deux 50 pièces',
    chip: '+50 pièces pour toi · +50 pour moi',
    h1Neutral: 'Installe GeoG',
    subNeutral: 'Pays, capitales, drapeaux, globe 3D et un défi par jour. Gratuit, sur iPhone et Android.',
    codeLabel: "Ton code d'invitation",
    playNow: 'Jouer maintenant, sans installer',
    iosSmall: "Télécharger dans l'",
    iosBig: 'App Store',
    androidSmall: 'DISPONIBLE SUR',
    androidBig: 'Google Play',
    openApp: "J'ai déjà l'app — l'ouvrir",
    foot: 'Ton code s’applique automatiquement à ta première partie. Sinon, entre-le dans Amis → Parrainage.',
    haveApp: "Tu as déjà l'application ?",
    openInApp: "Ouvrir dans l'app",
    dismiss: 'Fermer',
  },
  en: {
    title: 'GeoG — Your invitation',
    ogTitle: 'Join me on GeoG 🌍',
    ogDescription: 'The daily geography quiz. Install the app with my link and we both earn 50 coins.',
    eyebrow: 'The daily geography quiz',
    h1: 'Join me on GeoG',
    sub: 'Install the app with my link and {reward}.',
    reward: 'we both earn 50 coins',
    chip: '+50 coins for you · +50 for me',
    h1Neutral: 'Get GeoG',
    subNeutral: 'Countries, capitals, flags, a 3D globe and one challenge a day. Free, on iPhone and Android.',
    codeLabel: 'Your invite code',
    playNow: 'Play now, no install',
    iosSmall: 'Download on the',
    iosBig: 'App Store',
    androidSmall: 'GET IT ON',
    androidBig: 'Google Play',
    openApp: 'I already have the app — open it',
    foot: 'Your code is applied automatically on your first game. Otherwise, enter it under Friends → Referral.',
    haveApp: 'Already have the app?',
    openInApp: 'Open in the app',
    dismiss: 'Dismiss',
  },
  es: {
    title: 'GeoG — Tu invitación',
    ogTitle: 'Únete a mí en GeoG 🌍',
    ogDescription: 'El quiz de geografía del día. Instala la app con mi enlace y los dos ganamos 50 monedas.',
    eyebrow: 'El quiz de geografía del día',
    h1: 'Únete a mí en GeoG',
    sub: 'Instala la app con mi enlace y {reward}.',
    reward: 'los dos ganamos 50 monedas',
    chip: '+50 monedas para ti · +50 para mí',
    h1Neutral: 'Instala GeoG',
    subNeutral: 'Países, capitales, banderas, un globo 3D y un reto al día. Gratis, en iPhone y Android.',
    codeLabel: 'Tu código de invitación',
    playNow: 'Jugar ahora, sin instalar',
    iosSmall: 'Consíguelo en el',
    iosBig: 'App Store',
    androidSmall: 'DISPONIBLE EN',
    androidBig: 'Google Play',
    openApp: 'Ya tengo la app — abrirla',
    foot: 'Tu código se aplica automáticamente en tu primera partida. Si no, introdúcelo en Amigos → Invitaciones.',
    haveApp: '¿Ya tienes la app?',
    openInApp: 'Abrir en la app',
    dismiss: 'Cerrar',
  },
  pt: {
    title: 'GeoG — Seu convite',
    ogTitle: 'Junte-se a mim no GeoG 🌍',
    ogDescription: 'O quiz de geografia do dia. Instale o app com o meu link e nós dois ganhamos 50 moedas.',
    eyebrow: 'O quiz de geografia do dia',
    h1: 'Junte-se a mim no GeoG',
    sub: 'Instale o app com o meu link e {reward}.',
    reward: 'nós dois ganhamos 50 moedas',
    chip: '+50 moedas para você · +50 para mim',
    h1Neutral: 'Baixe o GeoG',
    subNeutral: 'Países, capitais, bandeiras, um globo 3D e um desafio por dia. Grátis, no iPhone e no Android.',
    codeLabel: 'Seu código de convite',
    playNow: 'Jogar agora, sem instalar',
    iosSmall: 'Disponível na',
    iosBig: 'App Store',
    androidSmall: 'DISPONÍVEL NO',
    androidBig: 'Google Play',
    openApp: 'Já tenho o app — abrir',
    foot: 'Seu código é aplicado automaticamente na primeira partida. Se não, digite-o em Amigos → Indicações.',
    haveApp: 'Já tem o app?',
    openInApp: 'Abrir no app',
    dismiss: 'Fechar',
  },
  de: {
    title: 'GeoG — Deine Einladung',
    ogTitle: 'Spiel mit mir GeoG 🌍',
    ogDescription: 'Das tägliche Geografie-Quiz. Installiere die App über meinen Link – wir bekommen beide 50 Münzen.',
    eyebrow: 'Das tägliche Geografie-Quiz',
    h1: 'Spiel mit mir GeoG',
    sub: 'Installiere die App über meinen Link und {reward}.',
    reward: 'wir bekommen beide 50 Münzen',
    chip: '+50 Münzen für dich · +50 für mich',
    h1Neutral: 'Hol dir GeoG',
    subNeutral: 'Länder, Hauptstädte, Flaggen, ein 3D-Globus und jeden Tag eine Challenge. Kostenlos, für iPhone und Android.',
    codeLabel: 'Dein Einladungscode',
    playNow: 'Jetzt spielen, ohne Installation',
    iosSmall: 'Laden im',
    iosBig: 'App Store',
    androidSmall: 'JETZT BEI',
    androidBig: 'Google Play',
    openApp: 'Ich habe die App schon – öffnen',
    foot: 'Dein Code wird beim ersten Spiel automatisch angewendet. Sonst gib ihn unter Freunde → Empfehlung ein.',
    haveApp: 'Hast du die App schon?',
    openInApp: 'In der App öffnen',
    dismiss: 'Schließen',
  },
  it: {
    title: 'GeoG — Il tuo invito',
    ogTitle: 'Unisciti a me su GeoG 🌍',
    ogDescription: 'Il quiz di geografia del giorno. Installa l’app con il mio link: guadagniamo entrambi 50 monete.',
    eyebrow: 'Il quiz di geografia del giorno',
    h1: 'Unisciti a me su GeoG',
    sub: 'Installa l’app con il mio link e {reward}.',
    reward: 'guadagniamo entrambi 50 monete',
    chip: '+50 monete per te · +50 per me',
    h1Neutral: 'Scarica GeoG',
    subNeutral: 'Paesi, capitali, bandiere, un globo 3D e una sfida al giorno. Gratis, su iPhone e Android.',
    codeLabel: 'Il tuo codice di invito',
    playNow: 'Gioca subito, senza installare',
    iosSmall: 'Scarica su',
    iosBig: 'App Store',
    androidSmall: 'DISPONIBILE SU',
    androidBig: 'Google Play',
    openApp: 'Ho già l’app — aprila',
    foot: 'Il tuo codice viene applicato automaticamente alla prima partita. Altrimenti inseriscilo in Amici → Inviti.',
    haveApp: 'Hai già l’app?',
    openInApp: 'Apri nell’app',
    dismiss: 'Chiudi',
  },
  ru: {
    title: 'GeoG — Ваше приглашение',
    ogTitle: 'Присоединяйся ко мне в GeoG 🌍',
    ogDescription: 'Ежедневная викторина по географии. Установи приложение по моей ссылке — мы оба получим 50 монет.',
    eyebrow: 'Ежедневная викторина по географии',
    h1: 'Присоединяйся ко мне в GeoG',
    sub: 'Установи приложение по моей ссылке, и {reward}.',
    reward: 'мы оба получим 50 монет',
    chip: '+50 монет тебе · +50 мне',
    h1Neutral: 'Установи GeoG',
    subNeutral: 'Страны, столицы, флаги, 3D-глобус и одно задание в день. Бесплатно, на iPhone и Android.',
    codeLabel: 'Твой код приглашения',
    playNow: 'Играть сейчас, без установки',
    iosSmall: 'Загрузите в',
    iosBig: 'App Store',
    androidSmall: 'ДОСТУПНО В',
    androidBig: 'Google Play',
    openApp: 'У меня уже есть приложение — открыть',
    foot: 'Код применится автоматически в первой игре. Иначе введи его в разделе Друзья → Приглашения.',
    haveApp: 'Уже есть приложение?',
    openInApp: 'Открыть в приложении',
    dismiss: 'Закрыть',
  },
  tr: {
    title: 'GeoG — Davetin',
    ogTitle: 'GeoG’de bana katıl 🌍',
    ogDescription: 'Günün coğrafya bilgi yarışması. Uygulamayı bağlantımla yükle, ikimiz de 50 altın kazanalım.',
    eyebrow: 'Günün coğrafya bilgi yarışması',
    h1: 'GeoG’de bana katıl',
    sub: 'Uygulamayı bağlantımla yükle, {reward}.',
    reward: 'ikimiz de 50 altın kazanalım',
    chip: 'Sana +50 altın · Bana +50',
    h1Neutral: 'GeoG’yi indir',
    subNeutral: 'Ülkeler, başkentler, bayraklar, 3B dünya küresi ve her gün bir görev. iPhone ve Android’de ücretsiz.',
    codeLabel: 'Davet kodun',
    playNow: 'Hemen oyna, yüklemeden',
    iosSmall: 'Şuradan indirin:',
    iosBig: 'App Store',
    androidSmall: 'ŞURADAN ALIN:',
    androidBig: 'Google Play',
    openApp: 'Uygulama bende var — aç',
    foot: 'Kodun ilk oyununda otomatik uygulanır. Uygulanmazsa Arkadaşlar → Davet bölümüne gir.',
    haveApp: 'Uygulama zaten yüklü mü?',
    openInApp: 'Uygulamada aç',
    dismiss: 'Kapat',
  },
  pl: {
    title: 'GeoG — Twoje zaproszenie',
    ogTitle: 'Dołącz do mnie w GeoG 🌍',
    ogDescription: 'Codzienny quiz z geografii. Zainstaluj aplikację z mojego linku — oboje dostaniemy 50 monet.',
    eyebrow: 'Codzienny quiz z geografii',
    h1: 'Dołącz do mnie w GeoG',
    sub: 'Zainstaluj aplikację z mojego linku, a {reward}.',
    reward: 'oboje dostaniemy 50 monet',
    chip: '+50 monet dla Ciebie · +50 dla mnie',
    h1Neutral: 'Pobierz GeoG',
    subNeutral: 'Kraje, stolice, flagi, globus 3D i jedno wyzwanie dziennie. Za darmo, na iPhone i Androida.',
    codeLabel: 'Twój kod zaproszenia',
    playNow: 'Graj teraz, bez instalacji',
    iosSmall: 'Pobierz w',
    iosBig: 'App Store',
    androidSmall: 'POBIERZ Z',
    androidBig: 'Google Play',
    openApp: 'Mam już aplikację — otwórz',
    foot: 'Kod zostanie zastosowany automatycznie w pierwszej grze. Jeśli nie, wpisz go w Znajomi → Polecenia.',
    haveApp: 'Masz już aplikację?',
    openInApp: 'Otwórz w aplikacji',
    dismiss: 'Zamknij',
  },
  nl: {
    title: 'GeoG — Je uitnodiging',
    ogTitle: 'Speel mee op GeoG 🌍',
    ogDescription: 'De dagelijkse aardrijkskundequiz. Installeer de app via mijn link en we krijgen allebei 50 munten.',
    eyebrow: 'De dagelijkse aardrijkskundequiz',
    h1: 'Speel mee op GeoG',
    sub: 'Installeer de app via mijn link en {reward}.',
    reward: 'we krijgen allebei 50 munten',
    chip: '+50 munten voor jou · +50 voor mij',
    h1Neutral: 'Download GeoG',
    subNeutral: 'Landen, hoofdsteden, vlaggen, een 3D-wereldbol en elke dag een uitdaging. Gratis, op iPhone en Android.',
    codeLabel: 'Je uitnodigingscode',
    playNow: 'Nu spelen, zonder installatie',
    iosSmall: 'Download in de',
    iosBig: 'App Store',
    androidSmall: 'ONTDEK HET OP',
    androidBig: 'Google Play',
    openApp: 'Ik heb de app al — openen',
    foot: 'Je code wordt automatisch toegepast bij je eerste spel. Anders vul je hem in bij Vrienden → Uitnodigen.',
    haveApp: 'Heb je de app al?',
    openInApp: 'Openen in de app',
    dismiss: 'Sluiten',
  },
  id: {
    title: 'GeoG — Undanganmu',
    ogTitle: 'Gabung denganku di GeoG 🌍',
    ogDescription: 'Kuis geografi harian. Pasang aplikasinya lewat tautanku, kita berdua dapat 50 koin.',
    eyebrow: 'Kuis geografi harian',
    h1: 'Gabung denganku di GeoG',
    sub: 'Pasang aplikasinya lewat tautanku dan {reward}.',
    reward: 'kita berdua dapat 50 koin',
    chip: '+50 koin untukmu · +50 untukku',
    h1Neutral: 'Pasang GeoG',
    subNeutral: 'Negara, ibu kota, bendera, globe 3D, dan satu tantangan setiap hari. Gratis, di iPhone dan Android.',
    codeLabel: 'Kode undanganmu',
    playNow: 'Main sekarang, tanpa instal',
    iosSmall: 'Unduh di',
    iosBig: 'App Store',
    androidSmall: 'DAPATKAN DI',
    androidBig: 'Google Play',
    openApp: 'Sudah punya aplikasinya — buka',
    foot: 'Kodemu otomatis diterapkan di permainan pertama. Jika tidak, masukkan di Teman → Undangan.',
    haveApp: 'Sudah punya aplikasinya?',
    openInApp: 'Buka di aplikasi',
    dismiss: 'Tutup',
  },
  vi: {
    title: 'GeoG — Lời mời của bạn',
    ogTitle: 'Chơi GeoG cùng mình nhé 🌍',
    ogDescription: 'Câu đố địa lý mỗi ngày. Cài ứng dụng qua liên kết của mình, cả hai cùng nhận 50 xu.',
    eyebrow: 'Câu đố địa lý mỗi ngày',
    h1: 'Chơi GeoG cùng mình nhé',
    sub: 'Cài ứng dụng qua liên kết của mình và {reward}.',
    reward: 'cả hai cùng nhận 50 xu',
    chip: '+50 xu cho bạn · +50 cho mình',
    h1Neutral: 'Tải GeoG',
    subNeutral: 'Quốc gia, thủ đô, quốc kỳ, quả địa cầu 3D và một thử thách mỗi ngày. Miễn phí trên iPhone và Android.',
    codeLabel: 'Mã mời của bạn',
    playNow: 'Chơi ngay, không cần cài',
    iosSmall: 'Tải về trên',
    iosBig: 'App Store',
    androidSmall: 'TẢI VỀ TRÊN',
    androidBig: 'Google Play',
    openApp: 'Mình đã có ứng dụng — mở',
    foot: 'Mã sẽ tự động áp dụng ở ván đầu tiên. Nếu không, hãy nhập trong Bạn bè → Giới thiệu.',
    haveApp: 'Đã có ứng dụng?',
    openInApp: 'Mở trong ứng dụng',
    dismiss: 'Đóng',
  },
  th: {
    title: 'GeoG — คำเชิญของคุณ',
    ogTitle: 'มาเล่น GeoG กับฉันสิ 🌍',
    ogDescription: 'ควิซภูมิศาสตร์ประจำวัน ติดตั้งแอปผ่านลิงก์ของฉัน แล้วเราทั้งคู่จะได้รับ 50 เหรียญ',
    eyebrow: 'ควิซภูมิศาสตร์ประจำวัน',
    h1: 'มาเล่น GeoG กับฉันสิ',
    sub: 'ติดตั้งแอปผ่านลิงก์ของฉัน แล้ว{reward}',
    reward: 'เราทั้งคู่จะได้รับ 50 เหรียญ',
    chip: '+50 เหรียญให้คุณ · +50 ให้ฉัน',
    h1Neutral: 'ติดตั้ง GeoG',
    subNeutral: 'ประเทศ เมืองหลวง ธงชาติ ลูกโลก 3 มิติ และภารกิจใหม่ทุกวัน ฟรี บน iPhone และ Android',
    codeLabel: 'รหัสคำเชิญของคุณ',
    playNow: 'เล่นเลย ไม่ต้องติดตั้ง',
    iosSmall: 'ดาวน์โหลดบน',
    iosBig: 'App Store',
    androidSmall: 'ดาวน์โหลดที่',
    androidBig: 'Google Play',
    openApp: 'มีแอปอยู่แล้ว — เปิด',
    foot: 'รหัสจะถูกใช้อัตโนมัติในเกมแรกของคุณ หากไม่ ให้กรอกที่ เพื่อน → แนะนำเพื่อน',
    haveApp: 'มีแอปอยู่แล้วใช่ไหม',
    openInApp: 'เปิดในแอป',
    dismiss: 'ปิด',
  },
  uk: {
    title: 'GeoG — Ваше запрошення',
    ogTitle: 'Приєднуйся до мене в GeoG 🌍',
    ogDescription: 'Щоденна вікторина з географії. Встанови застосунок за моїм посиланням — ми обоє отримаємо 50 монет.',
    eyebrow: 'Щоденна вікторина з географії',
    h1: 'Приєднуйся до мене в GeoG',
    sub: 'Встанови застосунок за моїм посиланням, і {reward}.',
    reward: 'ми обоє отримаємо 50 монет',
    chip: '+50 монет тобі · +50 мені',
    h1Neutral: 'Встанови GeoG',
    subNeutral: 'Країни, столиці, прапори, 3D-глобус і одне завдання щодня. Безкоштовно, на iPhone та Android.',
    codeLabel: 'Твій код запрошення',
    playNow: 'Грати зараз, без встановлення',
    iosSmall: 'Завантажити в',
    iosBig: 'App Store',
    androidSmall: 'ЗАВАНТАЖИТИ В',
    androidBig: 'Google Play',
    openApp: 'У мене вже є застосунок — відкрити',
    foot: 'Код застосується автоматично в першій грі. Інакше введи його в розділі Друзі → Запрошення.',
    haveApp: 'Уже є застосунок?',
    openInApp: 'Відкрити в застосунку',
    dismiss: 'Закрити',
  },
  ro: {
    title: 'GeoG — Invitația ta',
    ogTitle: 'Joacă GeoG cu mine 🌍',
    ogDescription: 'Quizul zilnic de geografie. Instalează aplicația cu linkul meu și primim amândoi 50 de monede.',
    eyebrow: 'Quizul zilnic de geografie',
    h1: 'Joacă GeoG cu mine',
    sub: 'Instalează aplicația cu linkul meu și {reward}.',
    reward: 'primim amândoi 50 de monede',
    chip: '+50 de monede pentru tine · +50 pentru mine',
    h1Neutral: 'Instalează GeoG',
    subNeutral: 'Țări, capitale, steaguri, un glob 3D și o provocare pe zi. Gratuit, pe iPhone și Android.',
    codeLabel: 'Codul tău de invitație',
    playNow: 'Joacă acum, fără instalare',
    iosSmall: 'Descarcă din',
    iosBig: 'App Store',
    androidSmall: 'DISPONIBIL PE',
    androidBig: 'Google Play',
    openApp: 'Am deja aplicația — deschide',
    foot: 'Codul se aplică automat la prima partidă. Altfel, introdu-l în Prieteni → Recomandări.',
    haveApp: 'Ai deja aplicația?',
    openInApp: 'Deschide în aplicație',
    dismiss: 'Închide',
  },
  el: {
    title: 'GeoG — Η πρόσκλησή σου',
    ogTitle: 'Έλα μαζί μου στο GeoG 🌍',
    ogDescription: 'Το καθημερινό κουίζ γεωγραφίας. Εγκατέστησε την εφαρμογή με τον σύνδεσμό μου και κερδίζουμε και οι δύο 50 νομίσματα.',
    eyebrow: 'Το καθημερινό κουίζ γεωγραφίας',
    h1: 'Έλα μαζί μου στο GeoG',
    sub: 'Εγκατέστησε την εφαρμογή με τον σύνδεσμό μου και {reward}.',
    reward: 'κερδίζουμε και οι δύο 50 νομίσματα',
    chip: '+50 νομίσματα για σένα · +50 για μένα',
    h1Neutral: 'Κατέβασε το GeoG',
    subNeutral: 'Χώρες, πρωτεύουσες, σημαίες, μια 3D υδρόγειος και μία πρόκληση κάθε μέρα. Δωρεάν, σε iPhone και Android.',
    codeLabel: 'Ο κωδικός πρόσκλησής σου',
    playNow: 'Παίξε τώρα, χωρίς εγκατάσταση',
    iosSmall: 'Διαθέσιμο στο',
    iosBig: 'App Store',
    androidSmall: 'ΔΙΑΘΕΣΙΜΟ ΣΤΟ',
    androidBig: 'Google Play',
    openApp: 'Έχω ήδη την εφαρμογή — άνοιγμα',
    foot: 'Ο κωδικός εφαρμόζεται αυτόματα στο πρώτο σου παιχνίδι. Αλλιώς, βάλ’ τον στο Φίλοι → Προσκλήσεις.',
    haveApp: 'Έχεις ήδη την εφαρμογή;',
    openInApp: 'Άνοιγμα στην εφαρμογή',
    dismiss: 'Κλείσιμο',
  },
};

/** Le fichier servi pour une langue (`/invite.html?lang=xx` y est réécrit). */
export function inviteFile(locale) {
  return `/invite-${locale}.html`;
}

// Le logo Apple (Simple Icons, CC0) et le logo Google Play, en quatre pans aux
// couleurs de la marque — deux SVG en ligne, aucun fichier à charger.
const APPLE_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>`;

const PLAY_SVG = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"><defs><linearGradient id="gp-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00A0FF"/><stop offset="1" stop-color="#00E3FF"/></linearGradient><linearGradient id="gp-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#32A071"/><stop offset="1" stop-color="#00F076"/></linearGradient><linearGradient id="gp-y" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFE000"/><stop offset="1" stop-color="#FFBC00"/></linearGradient><linearGradient id="gp-r" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3A44"/><stop offset="1" stop-color="#C31162"/></linearGradient></defs><path fill="url(#gp-b)" d="M3.609 1.814 13.792 12 3.61 22.186a.996.996 0 0 1-.61-.92V2.734a1 1 0 0 1 .609-.92z"/><path fill="url(#gp-r)" d="M14.499 12.707 16.801 15.009 5.864 21.342z"/><path fill="url(#gp-y)" d="M17.698 9.509 20.505 11.135a1 1 0 0 1 0 1.73L17.697 14.491 15.206 12z"/><path fill="url(#gp-g)" d="M5.864 2.658 16.8 8.99 14.498 11.292z"/></svg>`;

// Le globe filaire doré du bandeau, dans l'esprit de l'image Open Graph.
const GLOBE_SVG = `<svg class="globe" viewBox="0 0 200 200" aria-hidden="true" focusable="false"><g fill="none" stroke="#d4a53c" stroke-width="1.6"><circle cx="100" cy="100" r="92"/><ellipse cx="100" cy="100" rx="40" ry="92"/><ellipse cx="100" cy="100" rx="72" ry="92"/><line x1="100" y1="8" x2="100" y2="192"/><line x1="8" y1="100" x2="192" y2="100"/><path d="M14 58 Q100 24 186 58"/><path d="M14 142 Q100 176 186 142"/></g><circle cx="100" cy="100" r="4" fill="#d4a53c"/></svg>`;

const CSS = `
    :root {
      --bg: #f2e8d0; --card: #fffaf0; --ink: #1e2a22; --muted: #5a6b5f; --faint: #8a978d;
      --accent: #2a6e3f; --accent-ink: #ffffff; --border: #e2d6b8; --sky: #1c3a5e; --sky2: #2b5384;
      --gold: #d4a53c; --gold-ink: #5a3f05; --gold-bg: #fbf1d6;
      --store: #111111; --store-ink: #ffffff; --store-border: #3a3a3a;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1a15; --card: #1c2b23; --ink: #f2ede0; --muted: #a7b6ab; --faint: #7d8c81;
        --accent: #4fae6f; --accent-ink: #08130c; --border: #2c3d33; --sky: #10233d; --sky2: #1c3a5e;
        --gold-ink: #f5dfa0; --gold-bg: #2b2a1b;
        --store: #f6f1e6; --store-ink: #111111; --store-border: #d9d0bb;
      }
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0; min-height: 100dvh; background: var(--bg); color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex; flex-direction: column; align-items: center;
    }
    .sky {
      width: 100%; height: 230px; position: relative; overflow: hidden;
      background: radial-gradient(120% 90% at 50% 120%, var(--sky2) 0%, var(--sky) 60%);
      background-color: var(--sky);
    }
    .sky::before {
      content: ""; position: absolute; inset: 0; opacity: .12;
      background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px);
      background-size: 44px 44px;
    }
    .globe { position: absolute; right: -40px; top: -20px; width: 300px; height: 300px; opacity: .55; }
    .globe-l { left: -120px; right: auto; top: 60px; width: 260px; height: 260px; opacity: .22; }
    .wrap { width: 100%; max-width: 460px; padding: 0 16px 40px; margin-top: -110px; position: relative; }
    .card {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 26px; padding: 30px 26px 26px; text-align: center;
      box-shadow: 0 24px 60px rgba(10, 25, 45, .22);
    }
    .mark {
      width: 96px; height: 96px; border-radius: 26px; margin: -78px auto 16px; display: block;
      box-shadow: 0 10px 30px rgba(0,0,0,.25); border: 4px solid var(--card); background: var(--card);
    }
    .eyebrow {
      margin: 0 0 6px; font-size: .78rem; letter-spacing: .12em; text-transform: uppercase;
      color: var(--faint); font-weight: 600;
    }
    h1 {
      font-family: "Playfair Display", Georgia, "Times New Roman", serif;
      font-size: 1.85rem; line-height: 1.15; margin: 0 0 10px; letter-spacing: -.01em;
    }
    p.sub { color: var(--muted); margin: 0 0 18px; font-size: 1rem; line-height: 1.5; }
    .reward { color: var(--accent); font-weight: 700; }
    .chip {
      display: inline-flex; align-items: center; gap: 8px; margin: 0 0 18px;
      background: var(--gold-bg); color: var(--gold-ink); border: 1px solid var(--gold);
      border-radius: 999px; padding: 7px 14px; font-weight: 700; font-size: .9rem;
    }
    .chip .coin {
      width: 18px; height: 18px; border-radius: 50%; flex: none;
      background: radial-gradient(circle at 35% 35%, #ffe9a6, #d4a53c 70%, #9c7320);
      box-shadow: inset 0 0 0 2px rgba(255,255,255,.35);
    }
    .code-box {
      background: var(--bg); border: 1.5px dashed var(--gold); border-radius: 16px;
      padding: 12px 16px; margin: 0 0 18px; font-size: 1.5rem; font-weight: 800;
      letter-spacing: 4px; font-variant-numeric: tabular-nums;
    }
    .code-box small {
      display: block; font-size: .72rem; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
      color: var(--muted); margin-bottom: 4px;
    }
    a.btn {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      text-decoration: none; padding: 15px 18px; border-radius: 16px;
      font-weight: 700; font-size: 1.02rem; margin-bottom: 14px;
      background: var(--accent); color: var(--accent-ink);
      box-shadow: 0 8px 20px rgba(42, 110, 63, .28);
      transition: transform .12s ease, box-shadow .12s ease;
    }
    a.btn:active { transform: translateY(1px) scale(.99); box-shadow: 0 4px 12px rgba(42,110,63,.25); }
    a.btn.ghost { background: transparent; color: var(--accent); border: 1.5px solid var(--accent); box-shadow: none; margin-top: 4px; }
    .stores { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 4px; }
    a.store {
      flex: 1 1 170px; display: flex; align-items: center; gap: 10px; text-decoration: none;
      background: var(--store); color: var(--store-ink); border: 1px solid var(--store-border);
      border-radius: 12px; padding: 8px 14px 8px 12px; min-height: 58px; text-align: left;
      transition: transform .12s ease;
    }
    a.store:active { transform: translateY(1px) scale(.99); }
    a.store svg { flex: none; }
    a.store span { display: flex; flex-direction: column; line-height: 1.1; min-width: 0; }
    a.store small { font-size: .66rem; letter-spacing: .02em; opacity: .85; white-space: nowrap; }
    a.store b { font-size: 1.22rem; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; }
    .or { color: var(--faint); font-size: .8rem; margin: 6px 0 12px; display: flex; align-items: center; gap: 12px; }
    .or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--border); }
    .foot { color: var(--muted); font-size: .82rem; margin: 16px 0 0; line-height: 1.45; }
    .foot strong { color: var(--ink); font-weight: 600; }
    @media (max-width: 380px) { h1 { font-size: 1.6rem; } .card { padding: 26px 18px 22px; } }
`;

function replaceReward(text, reward) {
  return attr(text).replace('{reward}', `<span class="reward">${attr(reward)}</span>`);
}

/** Le HTML complet de la page pour une langue. */
export function renderInvite(locale) {
  const t = INVITE_COPY[locale];
  if (!t) throw new Error(`invite : pas de texte pour « ${locale} »`);
  const meta = LOCALE_META[locale];
  const playPath = href('play', locale);
  const canonical = `${ORIGIN}/invite.html${locale === 'fr' ? '' : `?lang=${locale}`}`;
  const appLink = JSON.stringify({ have: t.haveApp, open: t.openInApp, close: t.dismiss });
  const known = JSON.stringify(LOCALES);

  return `<!DOCTYPE html>
<html lang="${meta.htmlLang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <!-- Page personnelle (un code de parrainage par URL) : rien à indexer. -->
  <meta name="robots" content="noindex, follow" />
  <title>${attr(t.title)}</title>
  <link rel="icon" href="/favicon.ico" />
  <meta name="theme-color" content="#1c3a5e" />

  <!-- Open Graph / Twitter : un lien collé montre une vraie carte, dans la langue du parrain. -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="GeoG" />
  <meta property="og:title" content="${attr(t.ogTitle)}" />
  <meta property="og:description" content="${attr(t.ogDescription)}" />
  <meta property="og:image" content="${ORIGIN}/og-invite.png" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="${meta.ogLocale}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${attr(t.ogTitle)}" />
  <meta name="twitter:description" content="${attr(t.ogDescription)}" />
  <meta name="twitter:image" content="${ORIGIN}/og-invite.png" />

  <!-- Un lien sans langue (partagé avant cette page) ouvert par quelqu'un
       d'une autre langue : on le renvoie sur sa version, avant tout rendu. -->
  <script>
    (function () {
      var p = new URLSearchParams(location.search);
      if (p.get('lang')) return;
      var known = ${known};
      var tags = [].concat(navigator.languages || [], [navigator.language]);
      for (var i = 0; i < tags.length; i++) {
        var base = String(tags[i] || '').toLowerCase().split(/[-_]/)[0];
        if (known.indexOf(base) === -1) continue;
        if (base !== ${JSON.stringify(locale)}) { p.set('lang', base); location.replace(location.pathname + '?' + p.toString() + location.hash); }
        return;
      }
    })();
  </script>

  <link rel="preload" href="/fonts/playfair-display-700-latin.woff2" as="font" type="font/woff2" crossorigin />
  <link rel="stylesheet" href="/fonts/fonts.css" />

  <!-- Le pont web → app : redirection Android automatique + boutons ci-dessous. -->
  <script>window.GEOG_APP_LINK=${appLink};</script>
  <script src="/open-in-app.js"></script>

  <style>${CSS}  </style>
</head>
<body>
  <div class="sky">${GLOBE_SVG.replace('class="globe"', 'class="globe globe-l"')}${GLOBE_SVG}</div>
  <div class="wrap">
  <main class="card">
    <img class="mark" src="/logo-mark-168.png" alt="GeoG" width="96" height="96" />
    <p class="eyebrow">${attr(t.eyebrow)}</p>
    <h1 data-invite>${attr(t.h1)}</h1>
    <h1 data-neutral hidden>${attr(t.h1Neutral)}</h1>
    <p class="sub" data-invite>${replaceReward(t.sub, t.reward)}</p>
    <p class="sub" data-neutral hidden>${attr(t.subNeutral)}</p>
    <div class="chip" data-invite><span class="coin"></span>${attr(t.chip)}</div>

    <div class="code-box" id="codeBox" hidden>
      <small>${attr(t.codeLabel)}</small>
      <span id="codeText">—</span>
    </div>

    <a class="btn" id="playBtn" href="${playPath}?web=1">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
      ${attr(t.playNow)}
    </a>

    <div class="stores">
      <a class="store" id="iosBtn" href="${STORE_IOS}" rel="noopener">${APPLE_SVG}<span><small>${attr(t.iosSmall)}</small><b>${attr(t.iosBig)}</b></span></a>
      <a class="store" id="androidBtn" href="${STORE_ANDROID}" rel="noopener">${PLAY_SVG}<span><small>${attr(t.androidSmall)}</small><b>${attr(t.androidBig)}</b></span></a>
    </div>

    <a class="btn ghost" id="openBtn" data-geog-open data-invite href="#">${attr(t.openApp)}</a>

    <p class="foot" data-invite>${attr(t.foot)}</p>
  </main>
  </div>

  <script>
    (function () {
      var params = new URLSearchParams(location.search);
      var code = (params.get('code') || params.get('ref') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      var invite = !!code;

      // Deux variantes dans le HTML : « rejoins-moi » avec un code, « installe
      // GeoG » sans (le bouton « Installe l'app » de la version web).
      var show = function (sel, on) {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) els[i].hidden = !on;
      };
      show('[data-invite]', invite);
      show('[data-neutral]', !invite);
      if (invite) {
        document.getElementById('codeText').textContent = code;
        document.getElementById('codeBox').hidden = false;
        document.getElementById('openBtn').href = 'geog://invite?code=' + code;
      }

      // « Jouer maintenant » ouvre le défi du jour dans le navigateur, avec le
      // code pour l'attribution. web=1 = choix explicite du navigateur :
      // open-in-app.js ne proposera plus l'app sur la page d'arrivée.
      document.getElementById('playBtn').href =
        ${JSON.stringify(playPath)} + '?web=1' + (code ? ('&code=' + code) : '');

      // Un seul badge par plateforme sur téléphone ; les deux sur ordinateur.
      var ua = navigator.userAgent || '';
      var isIOS = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      if (/android/i.test(ua)) document.getElementById('iosBtn').hidden = true;
      else if (isIOS) document.getElementById('androidBtn').hidden = true;
    })();
  </script>
</body>
</html>
`;
}
