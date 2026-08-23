/** Chemins du build. `site/` vit à la racine du dépôt, à côté de `assets/`. */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE = dirname(dirname(fileURLToPath(import.meta.url)));
export const ROOT = dirname(SITE);
export const DIST = join(ROOT, 'dist');
export const CONTENT = join(SITE, 'content');

/** Le domaine public. Doit rester aligné sur `SITE_DOMAIN` de src/lib/links.ts. */
export const ORIGIN = 'https://playgeog.com';
