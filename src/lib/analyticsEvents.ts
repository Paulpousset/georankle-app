/**
 * Le catalogue d'événements produit, partagé par les deux implémentations
 * d'`analytics` (native via posthog-react-native, web via posthog-js).
 *
 * Il vit dans son propre module pour qu'`analytics.ts` et `analytics.web.ts`
 * ne puissent pas diverger : un event ajouté ici existe sur les deux surfaces.
 */

/** Every product event we emit. Add new names here to keep call sites honest. */
export type AnalyticsEvent =
  // Auth
  | 'signed_up'
  | 'logged_in'
  | 'logged_out'
  | 'password_reset_requested'
  // "Continuer avec Apple / Google" tapped (props: provider). Success shows up
  // as the regular 'logged_in' fired by AuthContext on SIGNED_IN.
  | 'oauth_login_started'
  // Games (solo + local)
  | 'game_started'
  | 'game_completed'
  | 'local_parcours_started'
  | 'mode_intro_seen'
  | 'challenge_started'
  | 'challenge_completed'
  // Langues: a clip could not be played and the question fell back to text.
  // Watch this rate — a spike means the Storage bucket or the CDN is unhappy.
  | 'language_audio_fallback'
  // Daily challenge
  | 'daily_opened'
  | 'daily_completed'
  | 'daily_shared'
  // Share sheet rejected/dismissed (props: reason). See src/lib/shareDaily.ts.
  | 'daily_share_failed'
  | 'daily_reminder_set'
  // Store rating sheet requested after a daily with a streak (src/lib/reviewPrompt.ts).
  | 'review_prompted'
  // Leagues (friend groups over the daily challenge)
  | 'league_opened'
  | 'league_created'
  | 'league_joined'
  | 'league_left'
  | 'league_invite_shared'
  | 'league_reminder_set'
  // Story mode
  | 'story_opened'
  | 'story_level_started'
  | 'story_level_completed'
  | 'story_life_ad_claimed'
  // Quests & streak rewards
  | 'quest_claimed'
  | 'streak_bonus_awarded'
  // Multiplayer
  | 'matchmaking_started'
  | 'match_invite_sent'
  | 'match_invite_accepted'
  | 'match_invite_declined'
  | 'match_started'
  | 'round_completed'
  | 'match_completed'
  // Revanche depuis l'écran de fin de match (voir components/RematchPanel).
  | 'rematch_requested'
  | 'rematch_solo_replay'
  | 'bot_match_started'
  | 'bot_match_completed'
  // Economy
  | 'shop_opened'
  | 'shop_item_viewed'
  | 'cosmetic_purchased'
  | 'bundle_purchased'
  | 'featured_purchased'
  | 'shop_filter_changed'
  | 'avatar_equipped'
  | 'rewarded_ad_requested'
  | 'rewarded_ad_earned'
  | 'rewarded_ad_failed'
  | 'coin_multiplier_requested'
  | 'coin_multiplier_earned'
  | 'coin_multiplier_failed'
  | 'interstitial_shown'
  | 'interstitial_failed'
  // Social
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'friend_removed'
  | 'user_searched'
  | 'player_profile_viewed'
  // Referral (viral loop)
  | 'referral_link_opened'
  | 'referral_shared'
  | 'referral_redeemed'
  // Discovery
  | 'leaderboard_opened'
  // Settings
  | 'theme_toggled'
  | 'language_toggled'
  | 'tutorial_replayed'
  // Admin
  | 'admin_broadcast_sent'
  | 'admin_campaign_saved';

export type Props = Record<string, string | number | boolean | null | undefined>;

export type CleanProps = Record<string, string | number | boolean | null>;

/**
 * Drop `undefined` values — callers commonly pass `x ?? undefined` or omit a
 * field, but PostHog's property type rejects `undefined`.
 */
export function clean(props?: Props): CleanProps | undefined {
  if (!props) return undefined;
  const out: CleanProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
