import { CCA3_TO_CCA2 } from '../data/countryCodes';

const FLAG_CDN = 'https://flagcdn.com/w160';

/**
 * Builds a flag image URL for an ISO alpha-3 country code.
 * Falls back to the UN flag when the code is unknown.
 */
export function getFlagUrl(cca3: string): string {
  const code = CCA3_TO_CCA2[cca3];
  if (!code) return `${FLAG_CDN}/un.png`;
  return `${FLAG_CDN}/${code.toLowerCase()}.png`;
}
