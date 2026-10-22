/**
 * Heure dorée — créneaux où chaque pub récompensée rapporte plus (×3 par
 * défaut) et où le plafond quotidien de pubs monte (10 au lieu de 5).
 *
 * Les créneaux sont programmés depuis le HQ (table golden_hours) ; l'app lit
 * seulement golden_hour_status(). Comme pour les flags, ce cache ne décide que
 * de l'affichage : claim_rewarded_ad recalcule le gain et le plafond côté
 * serveur.
 */
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export interface GoldenHourStatus {
  active: boolean;
  /** 1 hors créneau. */
  multiplier: number;
  /** Plafond quotidien de pubs en ce moment (5 hors créneau). */
  adCap: number;
  endsAt: Date | null;
  nextStartsAt: Date | null;
  nextMultiplier: number | null;
}

/** Must mirror the defaults of golden_hour_status() / claim_rewarded_ad. */
export const NO_GOLDEN_HOUR: GoldenHourStatus = {
  active: false,
  multiplier: 1,
  adCap: 5,
  endsAt: null,
  nextStartsAt: null,
  nextMultiplier: null,
};

const TTL_MS = 60 * 1000;

let cache: { at: number; status: GoldenHourStatus } | null = null;

const toDate = (v: unknown): Date | null => {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Current status, cached a minute. Unreachable → no golden hour. */
export async function fetchGoldenHour(): Promise<GoldenHourStatus> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.status;
  try {
    const { data, error } = await supabase.rpc('golden_hour_status');
    if (error || !data) throw error ?? new Error('empty');
    const raw = data as Record<string, unknown>;
    const status: GoldenHourStatus = {
      active: raw.active === true,
      multiplier: Number(raw.multiplier) || 1,
      adCap: Number(raw.ad_cap) || NO_GOLDEN_HOUR.adCap,
      endsAt: toDate(raw.ends_at),
      nextStartsAt: toDate(raw.next_starts_at),
      nextMultiplier: Number(raw.next_multiplier) || null,
    };
    cache = { at: Date.now(), status };
    return status;
  } catch {
    return cache?.status ?? NO_GOLDEN_HOUR;
  }
}

/**
 * React hook over fetchGoldenHour. Re-reads when the current slot ends or the
 * next one starts, so a banner appears and disappears on time.
 */
export function useGoldenHour(): GoldenHourStatus {
  const [status, setStatus] = useState<GoldenHourStatus>(cache?.status ?? NO_GOLDEN_HOUR);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchGoldenHour()
      .then((s) => {
        if (alive) setStatus(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [tick]);

  useEffect(() => {
    const edge = status.active ? status.endsAt : status.nextStartsAt;
    if (!edge) return;
    // +2 s so the server already sees the new state; setTimeout caps at ~24 days.
    const wait = Math.min(edge.getTime() - Date.now() + 2000, 2 ** 31 - 1);
    const id = setTimeout(() => {
      cache = null;
      setTick((t) => t + 1);
    }, Math.max(wait, 1000));
    return () => clearTimeout(id);
  }, [status]);

  return status;
}

/** "18:00" in the device's time zone. */
export function formatClock(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "45 min" / "3 h" / "2 h 15" — time left until `d`, rounded up to the minute. */
export function formatCountdown(d: Date, now = Date.now()): string {
  const mins = Math.max(1, Math.ceil((d.getTime() - now) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Test hook: drop the in-memory cache. */
export function __resetGoldenHourCache(): void {
  cache = null;
}
