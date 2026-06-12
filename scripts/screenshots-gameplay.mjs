import pw from '/Users/paulpousset/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.js';
const { chromium } = pw;

const URL = 'http://localhost:5577';
const OUT = '/Users/paulpousset/rankle/georankle-app/store-screenshots';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
});
const page = await ctx.newPage();
const log = (...a) => console.log('•', ...a);
const fresh = async () => { await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(3000); };
const tap = async (label, wait = 1500) => {
  const el = page.getByText(label, { exact: true }).first();
  await el.waitFor({ state: 'visible', timeout: 9000 });
  await el.click(); await page.waitForTimeout(wait);
};
const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); log('shot', name); };

// Capitales -> JOUER -> quiz
try { await fresh(); await tap('Solo'); await tap('Capitales'); await tap('JOUER', 3000); await shot('05-capitales'); }
catch (e) { log('capitales FAIL', e.message.split('\n')[0]); }

// Drapeaux -> JOUER -> quiz
try { await fresh(); await tap('Solo'); await tap('Drapeaux'); await tap('JOUER', 3000); await shot('08-drapeaux'); }
catch (e) { log('drapeaux FAIL', e.message.split('\n')[0]); }

// Devine -> type a country -> submit
try {
  await fresh(); await tap('Solo'); await tap('Devinez le Pays', 2000);
  const input = page.getByPlaceholder('Tapez un pays...').first();
  await input.waitFor({ state: 'visible', timeout: 9000 });
  await input.fill('France');
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await shot('06-devine');
} catch (e) { log('devine FAIL', e.message.split('\n')[0]); }

await browser.close();
log('done');
