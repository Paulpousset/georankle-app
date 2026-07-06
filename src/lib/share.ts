/**
 * Wordle-style share message for a daily result.
 *
 * Each mode produces its own emoji `grid` (it has the data at game-over); this
 * module only composes the final shareable text — title line, grid (or a score
 * fallback), streak, and a link. Handed to React Native's built-in `Share` API
 * by DailyResultCard, so no extra dependency is needed.
 */
import type { Language } from '../types';
import type { DailyResult } from './daily';
import { dailyModeLabel, getPuzzleNumber } from './daily';

/** Public link advertised in shared results. */
const SHARE_LINK = 'georankle.app';

/** One-line score summary used when a mode ships no emoji grid yet. */
function scoreLine(result: DailyResult, language: Language): string {
  switch (result.mode) {
    case 'classic':
      return `${result.score}%`;
    case 'streak':
    case 'higherlower':
      return tr(language, `Série de ${result.score}`, `Streak of ${result.score}`);
    case 'silhouette':
      // DUO/CARRÉ/CASH points (the 🟩/🟥 grid already shows how many were right).
      return tr(language, `${result.score} pts`, `${result.score} pts`);
    case 'borders':
      return result.score > 0
        ? tr(language, `Relié ! ${result.score} pts`, `Linked! ${result.score} pts`)
        : tr(language, 'Non relié', 'Not linked');
    default:
      return tr(language, `Score : ${result.score}`, `Score: ${result.score}`);
  }
}

// Local copy to avoid importing the i18n React surface into this pure helper.
function tr(language: Language, fr: string, en: string): string {
  return language === 'fr' ? fr : en;
}

/**
 * Build the shareable text block, e.g.:
 *   🌍 GeoRankle — Rankle #312
 *   🟩🟩🟨🟩🟥🟩🟨🟩  87%
 *   🔥 Série 5
 *   georankle.app
 */
export function buildShareMessage(
  result: DailyResult,
  streak: number,
  language: Language,
): string {
  const puzzle = getPuzzleNumber(new Date(result.date + 'T00:00:00Z'));
  const title = `🌍 GeoRankle — ${dailyModeLabel(result.mode, language)} #${puzzle}`;

  const body = result.grid
    ? `${result.grid}  ${scoreLine(result, language)}`
    : scoreLine(result, language);

  const lines = [title, body];
  if (streak > 1) lines.push(`🔥 ${tr(language, 'Série', 'Streak')} ${streak}`);
  lines.push(SHARE_LINK);

  return lines.join('\n');
}
