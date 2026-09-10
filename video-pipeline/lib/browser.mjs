// Ouvre le navigateur qui filmera la prise.
//
// Deux environnements, un seul code : sur un Mac de développement, Playwright
// gère lui-même son Chromium ; dans un conteneur d'intégration, le binaire est
// déjà là et sa version ne correspond pas forcément à celle que le paquet npm
// attend. On préfère donc un exécutable fourni quand il existe, plutôt que de
// figer la version de Playwright pour faire plaisir à une seule des deux
// machines.
import { existsSync } from 'fs';
import { chromium } from 'playwright';
import { overlayInit } from './overlay.mjs';

const CANDIDATES = [process.env.PW_CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean);

export function chromiumPath() {
  return CANDIDATES.find((p) => existsSync(p));
}

export async function openApp({ device, locale, headed = false }) {
  const executablePath = chromiumPath();

  const browser = await chromium.launch({
    headless: !headed,
    ...(executablePath ? { executablePath } : {}),
    args: [
      // Le mode Globe et les visuels 3D passent par WebGL. Sans GPU, Chrome le
      // désactive en silence : le globe ne s'affiche pas et la prise est bonne
      // à jeter. SwiftShader rend en logiciel — lent, mais il rend.
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--hide-scrollbars',
      // Une bannière « Chrome est piloté par un logiciel de test » n'a rien à
      // faire dans une vidéo de fiche store.
      '--disable-infobars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--font-render-hinting=none',
    ],
  });

  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.scale,
    isMobile: true,
    hasTouch: true,
    locale,
    colorScheme: 'light',
    reducedMotion: 'no-preference', // on VEUT les animations : c'est le sujet
    timezoneId: 'Europe/Paris',
  });
  await context.addInitScript(overlayInit());

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  return { browser, context, page, cdp };
}
