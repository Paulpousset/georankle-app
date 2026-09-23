/**
 * Sharing a daily result, done right on every surface.
 *
 * Measured on 60 days of prod data: 81 `daily_shared` events, 0 referral link
 * ever opened. Two causes lived here. (1) The referral code was fetched with a
 * network round-trip *between* the tap and `Share.share()`; on the mobile web
 * `navigator.share` requires a transient user activation, so the sheet was
 * rejected (`NotAllowedError`) and the rejection swallowed — while the event
 * had already been tracked. (2) On desktop there is no `navigator.share` at
 * all, and nothing else happened.
 *
 * So: the code is prefetched when the screen mounts and read synchronously at
 * tap time, the share sheet opens in the same tick as the tap, the clipboard is
 * the web fallback, and analytics reflect what actually happened.
 */
import { Platform, Share } from 'react-native';

import type { GameMode, Language } from '../types';
import type { DailyResult } from './daily';
import { getReferralInfo } from './referral';
import { buildShareMessage } from './share';
import { track } from './analytics';

let cachedCode: string | null = null;

/** Fetch the player's referral code once so `shareDailyResult` can use it synchronously. */
export async function prefetchReferralCode(): Promise<void> {
  try {
    const info = await getReferralInfo();
    cachedCode = info?.code ?? null;
  } catch {
    cachedCode = null;
  }
}

/** Test seam / explicit reset (e.g. on logout). */
export function setCachedReferralCode(code: string | null): void {
  cachedCode = code;
}

/** The prefetched code, read synchronously at tap time (null when logged out). */
export function getCachedReferralCode(): string | null {
  return cachedCode;
}

export type ShareOutcome = 'shared' | 'copied' | 'failed';

/**
 * Open the share sheet for a daily result. Must be called directly from the tap
 * handler (no `await` before it) so the web keeps its user activation.
 */
export function shareDailyResult(
  result: DailyResult,
  streak: number,
  language: Language,
  mode: GameMode,
  onCopied?: () => void,
): Promise<ShareOutcome> {
  const message = buildShareMessage(result, streak, language, cachedCode);
  const props = { mode, with_code: Boolean(cachedCode) };
  return Share.share({ message })
    .then((r) => {
      // iOS reports 'dismissedAction' when the user closes the sheet.
      if (r && (r as { action?: string }).action === 'dismissedAction') {
        track('daily_share_failed', { ...props, reason: 'dismissed' });
        return 'failed' as const;
      }
      track('daily_shared', props);
      return 'shared' as const;
    })
    .catch(async () => {
      // Web without navigator.share (desktop) or with the activation lost:
      // copy the text instead so the button always does something.
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(message);
          track('daily_shared', { ...props, via: 'clipboard' });
          onCopied?.();
          return 'copied' as const;
        } catch {
          /* fall through */
        }
      }
      track('daily_share_failed', { ...props, reason: 'unsupported' });
      return 'failed' as const;
    });
}
