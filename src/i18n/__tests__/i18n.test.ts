import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { tr, pickLabel, format } from '../index';
import { LOCALES, LANGUAGE_CODES, isLanguage, matchLanguage } from '../locales';
import { catalogFor, allTranslations } from '../catalog';
import {
  countryName,
  capitalName,
  countryAnswerNames,
  capitalAnswerNames,
} from '../../lib/geoNames';

/** Les quatorze langues traduites — celles qui ont un catalogue. */
const TRANSLATED = LANGUAGE_CODES.filter((l) => l !== 'fr' && l !== 'en');

describe('format', () => {
  it('fills the numbered slots', () => {
    expect(format('{0} vs {1}', ['Ada', 'Grace'])).toBe('Ada vs Grace');
  });

  it('leaves the text alone without args', () => {
    expect(format('{0} points')).toBe('{0} points');
  });

  it('keeps a slot with no matching argument', () => {
    expect(format('{0} / {1}', [3])).toBe('3 / {1}');
  });
});

describe('tr', () => {
  it('selects the string for the active language', () => {
    expect(tr('fr', 'Bonjour', 'Hello')).toBe('Bonjour');
    expect(tr('en', 'Bonjour', 'Hello')).toBe('Hello');
  });

  it('looks the English string up in the catalogue', () => {
    // « Rejouer » est traduit dans les quatorze langues : la clé est l'anglais.
    const spanish = tr('es', 'Rejouer', 'Play again');
    expect(spanish).not.toBe('Play again');
    expect(spanish).toBe(catalogFor('es')['Play again']);
  });

  it('falls back to English when the key is missing', () => {
    expect(tr('th', 'Clé absente', 'A key nobody translated')).toBe('A key nobody translated');
  });

  it('falls back to French when the English variant is empty', () => {
    expect(tr('ru', 'Côtes', '')).toBe('Côtes');
  });

  it('fills the slots in the translated string', () => {
    // Le catalogue porte la chaîne à trous ; les valeurs arrivent à l'exécution.
    expect(tr('en', '{0} pays', '{0} countries', [195])).toBe('195 countries');
    expect(tr('de', '{0} pays', '{0} countries', [195])).toContain('195');
  });
});

describe('pickLabel', () => {
  it('returns the matching localized value', () => {
    const label = { fr: 'Population', en: 'Population' };
    expect(pickLabel(label, 'fr')).toBe('Population');
    expect(pickLabel(label, 'en')).toBe('Population');
  });

  it('falls back to French when the English variant is missing', () => {
    const label = { fr: 'Côtes', en: '' };
    expect(pickLabel(label, 'en')).toBe('Côtes');
  });
});

describe('locale registry', () => {
  it('describes every language exactly once', () => {
    expect(LANGUAGE_CODES).toHaveLength(16);
    expect(new Set(LANGUAGE_CODES).size).toBe(LANGUAGE_CODES.length);
    for (const code of LANGUAGE_CODES) {
      const meta = LOCALES[code];
      expect(meta.native.length).toBeGreaterThan(0);
      expect(meta.tag.startsWith(code)).toBe(true);
    }
  });

  it('names each language in its own script', () => {
    // Un joueur perdu dans une interface qu'il ne lit pas doit reconnaître sa
    // langue dans la liste : le libellé est écrit dans cette langue.
    expect(LOCALES.ru.native).toBe('Русский');
    expect(LOCALES.th.native).toBe('ไทย');
    expect(LOCALES.el.native).toBe('Ελληνικά');
  });

  it('recognises the languages it speaks, and only those', () => {
    expect(isLanguage('vi')).toBe(true);
    expect(isLanguage('sv')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });

  it('matches a system tag list down to its base language', () => {
    expect(matchLanguage(['pt-BR', 'en-US'])).toBe('pt');
    expect(matchLanguage(['pt-PT'])).toBe('pt');
    expect(matchLanguage(['sv-SE', 'de_DE'])).toBe('de');
    expect(matchLanguage(['sv-SE'])).toBeNull();
    expect(matchLanguage([null, undefined, ''])).toBeNull();
  });
});

describe('catalogues', () => {
  it('gives French and English no catalogue — their strings live in the code', () => {
    expect(Object.keys(catalogFor('fr'))).toHaveLength(0);
    expect(Object.keys(catalogFor('en'))).toHaveLength(0);
  });

  it('covers the same keys in all fourteen translated languages', () => {
    const reference = Object.keys(catalogFor('es')).sort();
    expect(reference.length).toBeGreaterThan(1000);
    for (const code of TRANSLATED) {
      expect(Object.keys(catalogFor(code)).sort()).toEqual(reference);
    }
  });

  it('never leaves a key empty — an empty string would render as a blank label', () => {
    for (const code of TRANSLATED) {
      const empty = Object.entries(catalogFor(code)).filter(([, value]) => !value.trim());
      expect({ code, empty: empty.map(([key]) => key) }).toEqual({ code, empty: [] });
    }
  });

  it('collects every known translation of a key', () => {
    const all = allTranslations('Play again');
    expect(all.length).toBeGreaterThan(8);
    expect(all).toContain(catalogFor('pl')['Play again']);
  });
});

describe('country and capital names', () => {
  const FRA = { cca3: 'FRA', name: 'France', name_en: 'France' };
  const DEU = { cca3: 'DEU', name: 'Allemagne', name_en: 'Germany' };
  const JPN = { cca3: 'JPN', name: 'Japon', name_en: 'Japan' };
  const BERLIN = { cca3: 'DEU', capital: 'Berlin', capital_fr: 'Berlin' };
  const TOKYO = { cca3: 'JPN', capital: 'Tokyo', capital_fr: 'Tokyo' };

  it('names a country in each language', () => {
    expect(countryName(FRA, 'fr')).toBe('France');
    expect(countryName(DEU, 'de')).toBe('Deutschland');
    expect(countryName(JPN, 'ru')).toBe('Япония');
    expect(countryName(JPN, 'el')).not.toBe('Japan');
  });

  it('falls back to English rather than to a code', () => {
    const nowhere = { cca3: 'ZZZ', name: 'Nulle part', name_en: 'Nowhere' };
    expect(countryName(nowhere, 'th')).toBe('Nowhere');
  });

  it('names a capital in every non-Latin script', () => {
    expect(capitalName(BERLIN, 'fr')).toBe('Berlin');
    for (const code of ['ru', 'uk', 'el', 'th'] as const) {
      // Les quatre écritures non latines ont une table complète : une capitale
      // laissée en alphabet latin au milieu d'une phrase grecque se voit.
      expect(capitalName(BERLIN, code)).not.toBe('Berlin');
      expect(capitalName(TOKYO, code)).not.toBe('Tokyo');
    }
  });

  it('accepts every known spelling when the answer is typed', () => {
    const spellings = countryAnswerNames(DEU);
    expect(spellings).toContain('Allemagne');
    expect(spellings).toContain('Germany');
    expect(spellings).toContain('Deutschland');
    expect(capitalAnswerNames(TOKYO)).toContain('Tokyo');
    expect(capitalAnswerNames(TOKYO).length).toBeGreaterThan(3);
  });
});

describe('site parity', () => {
  it('has a site content file for every translated language', () => {
    const dir = join(__dirname, '..', '..', '..', 'site', 'content', 'i18n');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.sort()).toEqual(TRANSLATED.map((l) => `${l}.json`).sort());
  });

  it('ships an application shell per language', () => {
    // `/es/play` sert `app-es.html` : sans le fichier, le bouton « Jouer » de
    // la page espagnole tombe sur un 404. Le fichier est produit par le build
    // du site, on ne le vérifie donc que s'il a déjà tourné.
    const dist = join(__dirname, '..', '..', '..', 'dist');
    if (!existsSync(join(dist, 'app.html'))) return;
    for (const code of TRANSLATED) {
      expect(existsSync(join(dist, `app-${code}.html`))).toBe(true);
    }
  });
});
