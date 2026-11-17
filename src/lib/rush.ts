/**
 * « Duel 20h » : chaque soir de 19h à 20h UTC (20h–21h à Paris en hiver),
 * un duel en ligne fini rapporte une seconde fois ses pièces. Une heure fixe
 * pour tout le monde, pour que les joueurs se retrouvent en même temps et que
 * les files d'attente se remplissent. Bonus réclamé côté serveur
 * (`claim_rush_bonus`, une fois par joueur et par match).
 */
import { supabase } from './supabase';
import { track } from './analytics';

/** Heure UTC de début de l'heure de pointe — en phase avec `claim_rush_bonus`. */
export const RUSH_START_UTC = 19;

/** Vrai pendant l'heure de pointe. */
export function isRushHour(d: Date = new Date()): boolean {
  return d.getUTCHours() === RUSH_START_UTC;
}

/** Début de la prochaine heure de pointe (celle en cours si on y est). */
export function nextRushStart(d: Date = new Date()): Date {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), RUSH_START_UTC),
  );
  if (d.getTime() >= start.getTime() + 3_600_000) start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

/** Millisecondes restantes avant la fin de l'heure de pointe en cours (0 hors fenêtre). */
export function msLeftInRush(d: Date = new Date()): number {
  if (!isRushHour(d)) return 0;
  return nextRushStart(d).getTime() + 3_600_000 - d.getTime();
}

function formatHour(date: Date, language: string): string {
  const h = date.getHours();
  if (language === 'en') return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
  return `${h}h`;
}

/** L'heure locale du début, « 20h » / « 8 PM », pour la pastille. */
export function rushLocalHour(d: Date = new Date(), language: string = 'fr'): string {
  return formatHour(nextRushStart(d), language);
}

/** L'heure locale de fin (« 21h »). */
export function rushLocalEndHour(d: Date = new Date(), language: string = 'fr'): string {
  return formatHour(new Date(nextRushStart(d).getTime() + 3_600_000), language);
}

/**
 * Réclame le bonus d'un duel fini. Le serveur vérifie l'heure de création du
 * match et que le bonus n'a pas déjà été versé : sans risque à appeler.
 */
export async function claimRushBonus(matchId: string, createdAt?: string | null): Promise<number> {
  if (createdAt && new Date(createdAt).getUTCHours() !== RUSH_START_UTC) return 0;
  const { data, error } = await supabase.rpc('claim_rush_bonus', { p_match_id: matchId });
  if (error) return 0;
  const coins = ((data ?? {}) as { coins?: number }).coins ?? 0;
  if (coins > 0) track('rush_bonus', { coins });
  return coins;
}
