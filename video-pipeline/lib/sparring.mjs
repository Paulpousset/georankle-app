// Le partenaire d'entraînement : un second joueur, hors champ.
//
// Les modes en ligne ne se filment pas seul — une file d'attente classée sans
// adversaire reste une file d'attente. Ce module ouvre un DEUXIÈME téléphone
// dans le même navigateur (un autre contexte, donc une autre session), s'y
// connecte avec un autre compte de test, et fait ce qu'on lui dit : rejoindre
// la file, répondre aux questions. Il n'a aucune pause humaine : il n'est
// jamais à l'image, on veut seulement qu'il soit là quand le héros arrive.
//
// Les identifiants viennent de l'environnement (`SPARRING_EMAIL`,
// `SPARRING_PASSWORD`) et ne sont jamais écrits nulle part — ni dans le
// manifeste, ni dans le journal.
import { overlayInit } from './overlay.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openSparring(browser, { url, device, locale, email, password, log = () => {} }) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: 1, // jamais filmé : inutile de rendre en 3×
    isMobile: true,
    hasTouch: true,
    locale,
  });
  await context.addInitScript(overlayInit());
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.getByRole('button', { name: 'Solo', exact: true }).first().waitFor({ timeout: 60000 });

  const click = async (name, timeout = 15000) => {
    const b = page.getByRole('button', { name, exact: true }).first();
    await b.waitFor({ state: 'visible', timeout });
    await b.click();
  };

  // ── Connexion ─────────────────────────────────────────────────────────────
  await click('Connexion');
  await page.getByLabel('Email').first().fill(email);
  await page.getByLabel('Mot de passe').first().fill(password);
  await click('Se connecter');
  await page.getByRole('button', { name: 'Profil', exact: true }).first().waitFor({ timeout: 30000 });
  log('sparring : connecté');

  return {
    page,

    /** Rejoint la file classée et attend d'y être. */
    async queueRanked() {
      await click('En Ligne');
      await click('Mode Classé');
      await click('Trouver une partie classée', 20000);
      log('sparring : en file classée');
    },

    /**
     * Joue tout ce qui se présente, vite, jusqu'à ce que la partie finisse ou
     * que `ms` s'écoule. Le verdict lui est indifférent : il est là pour que le
     * match existe, pas pour le gagner.
     */
    async playAlong(ms = 180000) {
      const until = Date.now() + ms;
      const chrome = /^(Menu|Retour|Quitter|Annuler|Changer|Comment|Infos|Classement|Fermer|Profil|Boutique|Amis|Connexion)/;
      while (Date.now() < until) {
        const labels = await page.getByRole('button').evaluateAll((els) =>
          els.map((e) => (e.getAttribute('aria-label') || e.textContent || '').trim()).filter(Boolean),
        );
        const diff = labels.find((l) => /^(DUO|CARRÉ|CASH),/.test(l));
        const next = labels.find((l) => /^Suivant/.test(l));
        const choices = labels.filter((l) => !chrome.test(l) && !/^(DUO|CARRÉ|CASH),/.test(l) && l.length <= 42);
        try {
          if (diff) await click('DUO, 1 point', 3000);
          else if (next) await click(next, 3000);
          else if (choices.length) await click(choices[0], 3000);
        } catch { /* l'écran a changé entre-temps : on relit */ }
        await sleep(900);
      }
    },

    async close() {
      await context.close().catch(() => {});
    },
  };
}
