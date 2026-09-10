// Relève de terrain : ouvre l'app, va sur un écran, imprime son arbre
// d'accessibilité. C'est ce qui permet d'écrire le scénario avec les vrais
// libellés plutôt qu'avec des approximations — et de le corriger vite quand un
// écran change de mots.
//
//   node explore.mjs                 # le menu
//   node explore.mjs Solo Silhouette # menu → Solo → Silhouette
import { serve } from './lib/serve.mjs';
import { openApp } from './lib/browser.mjs';
import { WEB_DIST, PORT, DEVICES, DEVICE, LOCALE, HEADED } from './config.mjs';

const path = process.argv.slice(2);
const d = DEVICES[DEVICE];
const { url, close } = await serve(WEB_DIST, PORT);

const { browser, page } = await openApp({ device: d, locale: LOCALE, headed: HEADED });
page.on('pageerror', (e) => console.error('!! erreur page :', e.message));
page.on('console', (m) => m.type() === 'error' && console.error('!! console :', m.text().slice(0, 300)));

await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(4000);

for (const step of path) {
  const el = page.getByRole('button', { name: step, exact: true }).first();
  const alt = page.getByText(step, { exact: true }).first();
  const target = (await el.count()) ? el : alt;
  await target.waitFor({ state: 'visible', timeout: 10000 });
  await target.click();
  await page.waitForTimeout(2500);
  console.log(`— après « ${step} » —`);
}

console.log(await page.locator('body').ariaSnapshot());
await browser.close();
await close();
