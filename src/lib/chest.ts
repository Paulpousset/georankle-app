/**
 * « Coffre du jour » : une ouverture par jour UTC. La série J1→J7 fait
 * grossir les pièces, un jour manqué la remet à J1. Le serveur fait foi
 * (`claim_daily_chest`) ; le client garde un reflet local pour la pastille
 * de la bulle, y compris hors connexion.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from './supabase';
import { getTodayUTC } from './daily';
import { track } from './analytics';

/** Pièces des jours 1 à 7 du cycle — en phase avec `chest_reward` (SQL). */
export const CHEST_REWARDS = [10, 15, 20, 25, 30, 40, 75] as const;

/** Pièces pour le n-ième jour de série (le cycle de 7 recommence ensuite). */
export function chestReward(streak: number): number {
  const day = ((Math.max(1, Math.floor(streak)) - 1) % 7) + 1;
  return CHEST_REWARDS[day - 1];
}

/** Jour du cycle (1..7) pour une série. */
export function chestDay(streak: number): number {
  return ((Math.max(1, Math.floor(streak)) - 1) % 7) + 1;
}

export interface ChestState {
  /** Dernier jour UTC d'ouverture. */
  lastClaim: string | null;
  streak: number;
}

const KEY = 'chest:state';

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000);
}

/** Le coffre peut-il être ouvert aujourd'hui ? */
export function chestReady(state: ChestState, today = getTodayUTC()): boolean {
  return state.lastClaim !== today;
}

/** La série qu'aura le joueur s'il ouvre aujourd'hui (ce que montre la bulle). */
export function nextStreak(state: ChestState, today = getTodayUTC()): number {
  if (state.lastClaim === today) return state.streak;
  if (state.lastClaim && dayDiff(today, state.lastClaim) === 1) return state.streak + 1;
  return 1;
}

export async function getChestState(): Promise<ChestState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as ChestState;
  } catch {
    // Cache illisible : coffre neuf.
  }
  return { lastClaim: null, streak: 0 };
}

async function saveChestState(state: ChestState): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Reflet local seulement : le serveur garde la vraie série.
  }
}

/** Relit la série du compte (connecté) et met le reflet local à jour. */
export async function refreshChestState(userId: string): Promise<ChestState> {
  const { data } = await supabase
    .from('daily_chests')
    .select('last_claim, streak')
    .eq('user_id', userId)
    .maybeSingle();
  const state: ChestState = data
    ? { lastClaim: data.last_claim, streak: data.streak }
    : { lastClaim: null, streak: 0 };
  await saveChestState(state);
  return state;
}

export interface ChestClaim {
  claimed: boolean;
  streak: number;
  coins: number;
}

/** Ouvre le coffre du jour (compte requis). */
export async function claimDailyChest(): Promise<ChestClaim | null> {
  const { data, error } = await supabase.rpc('claim_daily_chest');
  if (error) return null;
  const r = (data ?? {}) as Partial<ChestClaim>;
  const claim = { claimed: !!r.claimed, streak: r.streak ?? 1, coins: r.coins ?? 0 };
  await saveChestState({ lastClaim: getTodayUTC(), streak: claim.streak });
  if (claim.claimed) track('chest_claimed', { streak: claim.streak, coins: claim.coins });
  return claim;
}
