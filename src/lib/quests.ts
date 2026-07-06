/**
 * Daily quests — 3 rotating missions per UTC day, rewarded in coins.
 *
 * All real logic is server-side (quests.sql): `get_daily_quests()` returns the
 * day's selection with authoritative progress, `claim_quest()` re-validates the
 * condition and credits the wallet (idempotent). This module only types the
 * payloads and localizes the labels — adding a quest to quest_defs() in SQL
 * plus one label here is a complete new mission.
 */
import { supabase } from './supabase';
import type { Language } from '../types';
import { tr } from '../i18n';

export interface DailyQuest {
  id: string;
  reward: number;
  target: number;
  current: number;
  done: boolean;
  claimed: boolean;
}

export interface ClaimQuestResult {
  claimed: boolean;
  coins_awarded?: number;
  reason?: 'not_todays_quest' | 'incomplete' | 'already_claimed' | string;
}

/** [fr, en] label per quest id (ids mirror quest_defs() in quests.sql). */
const QUEST_LABELS: Record<string, [string, string]> = {
  daily_1: ['Termine 1 défi quotidien', 'Finish 1 daily challenge'],
  daily_3: ['Termine 3 défis quotidiens', 'Finish 3 daily challenges'],
  solo_2modes: ['Joue 2 modes solo différents', 'Play 2 different solo modes'],
  solo_5games: ['Joue 5 parties solo', 'Play 5 solo games'],
  online_play: ['Termine 1 match en ligne', 'Finish 1 online match'],
  online_win: ['Gagne 1 match en ligne', 'Win 1 online match'],
  ranked_play: ['Termine 1 match classé', 'Finish 1 ranked match'],
  ranked_win: ['Gagne 1 match classé', 'Win 1 ranked match'],
};

export function questLabel(id: string, language: Language): string {
  const pair = QUEST_LABELS[id];
  return pair ? tr(language, pair[0], pair[1]) : id;
}

/** Today's 3 quests with authoritative progress/claim state. */
export async function fetchDailyQuests(): Promise<DailyQuest[]> {
  const { data, error } = await supabase.rpc('get_daily_quests');
  if (error) throw error;
  return (data ?? []) as unknown as DailyQuest[];
}

/** Claim a completed quest; the server re-checks everything. */
export async function claimQuest(id: string): Promise<ClaimQuestResult> {
  const { data, error } = await supabase.rpc('claim_quest', { p_quest_id: id });
  if (error) throw error;
  return (data ?? { claimed: false }) as unknown as ClaimQuestResult;
}
