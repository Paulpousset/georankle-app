/**
 * Messages push prêts à l'emploi, déjà traduits dans les 16 langues de l'app.
 * Choisir un modèle dans l'écran admin remplit le titre et le message (en
 * français) et envoie à chaque joueur la version de sa langue (profiles.push_lang).
 */
export type PushCopy = { title: string; body: string };

export interface PushTemplate {
  id: string;
  /** Nom du modèle dans l'écran admin. */
  label: string;
  i18n: Record<string, PushCopy>;
}

export const PUSH_TEMPLATES: PushTemplate[] = [
  {
    id: 'nouveautes-2026-10',
    label: 'Plein de nouveautés',
    i18n: {
      fr: { title: '🌍 Plein de nouveautés !', body: 'Nouveau mode, 1000 niveaux et nouveaux globes. Mets l’app à jour pour en profiter.' },
      en: { title: '🌍 Lots of new stuff!', body: 'A new mode, 1000 levels and new globes. Update the app to enjoy them.' },
      es: { title: '🌍 ¡Muchas novedades!', body: 'Un modo nuevo, 1000 niveles y globos nuevos. Actualiza la app para disfrutarlos.' },
      pt: { title: '🌍 Muitas novidades!', body: 'Um novo modo, 1000 níveis e novos globos. Atualize o app para aproveitar.' },
      de: { title: '🌍 Jede Menge Neues!', body: 'Ein neuer Modus, 1000 Level und neue Globen. Aktualisiere die App, um sie zu entdecken.' },
      it: { title: '🌍 Tante novità!', body: 'Una nuova modalità, 1000 livelli e nuovi globi. Aggiorna l’app per scoprirli.' },
      ru: { title: '🌍 Много нового!', body: 'Новый режим, 1000 уровней и новые глобусы. Обновите приложение, чтобы попробовать.' },
      tr: { title: '🌍 Bir sürü yenilik!', body: 'Yeni bir mod, 1000 seviye ve yeni küreler. Keyfini çıkarmak için uygulamayı güncelle.' },
      pl: { title: '🌍 Mnóstwo nowości!', body: 'Nowy tryb, 1000 poziomów i nowe globusy. Zaktualizuj aplikację, aby z nich skorzystać.' },
      nl: { title: '🌍 Veel nieuws!', body: 'Een nieuwe modus, 1000 levels en nieuwe globes. Werk de app bij om ervan te genieten.' },
      id: { title: '🌍 Banyak fitur baru!', body: 'Mode baru, 1000 level, dan bola dunia baru. Perbarui aplikasi untuk menikmatinya.' },
      vi: { title: '🌍 Rất nhiều điều mới!', body: 'Chế độ mới, 1000 màn chơi và quả địa cầu mới. Cập nhật ứng dụng để trải nghiệm.' },
      th: { title: '🌍 ของใหม่เพียบ!', body: 'โหมดใหม่ 1000 ด่าน และลูกโลกแบบใหม่ อัปเดตแอปเพื่อสนุกกับทั้งหมดนี้' },
      uk: { title: '🌍 Багато нового!', body: 'Новий режим, 1000 рівнів і нові глобуси. Оновіть застосунок, щоб спробувати.' },
      ro: { title: '🌍 O mulțime de noutăți!', body: 'Un mod nou, 1000 de niveluri și globuri noi. Actualizează aplicația ca să te bucuri de ele.' },
      el: { title: '🌍 Πολλά νέα!', body: 'Νέα λειτουργία, 1000 επίπεδα και νέες υδρόγειοι. Ενημέρωσε την εφαρμογή για να τα απολαύσεις.' },
    },
  },
];
