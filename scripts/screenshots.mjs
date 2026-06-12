import pw from '/Users/paulpousset/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pw;
import { mkdirSync } from 'fs';

const URL = process.env.SHOT_URL || 'http://localhost:5577';
const OUT = '/Users/paulpousset/rankle/georankle-app/store-screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, // 6.7" -> 1290x2796 @ DSF3
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const log = (...a) => console.log('•', ...a);

const fresh = async () => {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
};
const tap = async (label, wait = 1500) => {
  const el = page.getByText(label, { exact: true }).first();
  await el.waitFor({ state: 'visible', timeout: 9000 });
  await el.click();
  await page.waitForTimeout(wait);
};
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); log('shot', name); };

// 1. Home menu
await fresh();
await shot('01-menu-home');

// 2. Solo modes list
await fresh();
await tap('Solo');
await shot('02-modes');

// 3..N each solo mode — fresh nav each time
const modes = [
  ['Mode Classique', '03-classique'],
  ['Globe Géo', '04-globe'],
  ['Capitales', '05-capitales'],
  ['Devinez le Pays', '06-devine'],
  ['Mode Streak', '07-streak'],
  ['Drapeaux', '08-drapeaux'],
];
for (const [label, name] of modes) {
  try {
    await fresh();
    await tap('Solo');
    await tap(label, 3000);
    await shot(name);
  } catch (e) { log('FAIL', label, '-', e.message.split('\n')[0]); }
}

await browser.close();
log('done ->', OUT);
