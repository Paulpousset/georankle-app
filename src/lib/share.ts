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
import { playLink } from './links';
import { tr } from '../i18n';

/** One-line score summary used when a mode ships no emoji grid yet. */
function scoreLine(result: DailyResult, language: Language): string {
  switch (result.mode) {
    case 'classic':
      return `${result.score}%`;
    case 'streak':
    case 'higherlower':
      return tr(language, 'Série de {0}', 'Streak of {0}', [result.score]);
    case 'silhouette':
    case 'languages':
    case 'challenge':
      // DUO/CARRÉ/CASH points (the 🟩/🟥 grid already shows how many were right).
      return tr(language, '{0} pts', '{0} pts', [result.score]);
    case 'borders':
      return result.score > 0
        ? tr(language, 'Relié ! {0} pts', 'Linked! {0} pts', [result.score])
        : tr(language, 'Non relié', 'Not linked');
    default:
      return tr(language, 'Score : {0}', 'Score: {0}', [result.score]);
  }
}

/**
 * Build the shareable text block, e.g.:
 *   🌍 GeoG — Rankle #312
 *   🟩🟩🟨🟩🟥🟩🟨🟩  87%
 *   🔥 Série 5
 *   playgeog.com
 */
export function buildShareMessage(
  result: DailyResult,
  streak: number,
  language: Language,
  refCode?: string | null,
): string {
  const puzzle = getPuzzleNumber(new Date(result.date + 'T00:00:00Z'));
  const title = `🌍 GeoG — ${dailyModeLabel(result.mode, language)} #${puzzle}`;

  const body = result.grid
    ? `${result.grid}  ${scoreLine(result, language)}`
    : scoreLine(result, language);

  const lines = [title, body];
  if (streak > 1) lines.push(`🔥 ${tr(language, 'Série', 'Streak')} ${streak}`);
  // Call to action + an instant-play link: tapping it drops you straight into
  // today's challenge in the browser (no install) — and carries the referral
  // code so playing then installing credits both players.
  lines.push(tr(language, 'À toi de faire mieux 👇', 'Beat my score 👇'));
  // No code (logged-out player): still a real URL, tagged so opens are measurable.
  lines.push(refCode ? playLink(refCode) : `${playLink()}?s=daily`);

  return lines.join('\n');
}
