/**
 * Supabase database types — GENERATED, do not edit by hand.
 *
 * Regenerate after any schema change with:
 *   supabase gen types typescript --project-id exwfggaytrywnfzcqpel > src/types/database.ts
 * (or via the Supabase MCP `generate_typescript_types` tool).
 *
 * The `supabase` client in src/lib/supabase.ts is parameterized with `Database`,
 * so `.from(...)` rows and `.rpc(...)` payloads are typed off this file. Prefer
 * the `Tables<'x'>` / `Functions` helpers below over `any` for query results.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_claims: {
        Row: {
          count: number
          day: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      coin_wallets: {
        Row: {
          balance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_wallets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cosmetic_bundles: {
        Row: {
          bundle_id: string
          created_at: string
          item_ids: string[]
          price: number
        }
        Insert: {
          bundle_id: string
          created_at?: string
          item_ids: string[]
          price: number
        }
        Update: {
          bundle_id?: string
          created_at?: string
          item_ids?: string[]
          price?: number
        }
        Relationships: []
      }
      cosmetic_prices: {
        Row: {
          category: string
          is_default: boolean
          item_id: string
          price: number
          rarity: string
        }
        Insert: {
          category: string
          is_default?: boolean
          item_id: string
          price: number
          rarity?: string
        }
        Update: {
          category?: string
          is_default?: boolean
          item_id?: string
          price?: number
          rarity?: string
        }
        Relationships: []
      }
      cron_run_log: {
        Row: {
          created_at: string
          detail: Json | null
          id: number
          job: string
          status: string
        }
        Insert: {
          created_at?: string
          detail?: Json | null
          id?: never
          job: string
          status: string
        }
        Update: {
          created_at?: string
          detail?: Json | null
          id?: never
          job?: string
          status?: string
        }
        Relationships: []
      }
      daily_results: {
        Row: {
          created_at: string
          game_mode: string
          puzzle_date: string
          score: number
          share_grid: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          game_mode: string
          puzzle_date: string
          score: number
          share_grid?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          game_mode?: string
          puzzle_date?: string
          score?: number
          share_grid?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_results_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      friends: {
        Row: {
          created_at: string
          id: string
          status: string | null
          user_id1: string | null
          user_id2: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string | null
          user_id1?: string | null
          user_id2?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          status?: string | null
          user_id1?: string | null
          user_id2?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friends_user_id1_fkey"
            columns: ["user_id1"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friends_user_id2_fkey"
            columns: ["user_id2"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      iap_grants: {
        Row: {
          coins: number
          created_at: string
          product_id: string
          transaction_id: string
          user_id: string
        }
        Insert: {
          coins: number
          created_at?: string
          product_id: string
          transaction_id: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          product_id?: string
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iap_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_players: {
        Row: {
          current_score: number
          finished_round: boolean
          joined_at: string
          match_id: string
          player_id: string
          rounds_won: number
          slot: number
          total_score: number
        }
        Insert: {
          current_score?: number
          finished_round?: boolean
          joined_at?: string
          match_id: string
          player_id: string
          rounds_won?: number
          slot: number
          total_score?: number
        }
        Update: {
          current_score?: number
          finished_round?: boolean
          joined_at?: string
          match_id?: string
          player_id?: string
          rounds_won?: number
          slot?: number
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_players_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          best_of: number | null
          coins_awarded: boolean
          created_at: string
          current_round: number | null
          game_data: Json | null
          game_mode: string
          id: string
          is_public: boolean | null
          is_ranked: boolean | null
          last_activity_at: string
          max_players: number
          p1_current_score: number | null
          p1_finished_round: boolean | null
          p1_rounds_won: number | null
          p2_current_score: number | null
          p2_finished_round: boolean | null
          p2_rounds_won: number | null
          player1_id: string | null
          player2_id: string | null
          rating_applied: boolean
          status: string | null
          updated_at: string
        }
        Insert: {
          best_of?: number | null
          coins_awarded?: boolean
          created_at?: string
          current_round?: number | null
          game_data?: Json | null
          game_mode: string
          id?: string
          is_public?: boolean | null
          is_ranked?: boolean | null
          last_activity_at?: string
          max_players?: number
          p1_current_score?: number | null
          p1_finished_round?: boolean | null
          p1_rounds_won?: number | null
          p2_current_score?: number | null
          p2_finished_round?: boolean | null
          p2_rounds_won?: number | null
          player1_id?: string | null
          player2_id?: string | null
          rating_applied?: boolean
          status?: string | null
          updated_at?: string
        }
        Update: {
          best_of?: number | null
          coins_awarded?: boolean
          created_at?: string
          current_round?: number | null
          game_data?: Json | null
          game_mode?: string
          id?: string
          is_public?: boolean | null
          is_ranked?: boolean | null
          last_activity_at?: string
          max_players?: number
          p1_current_score?: number | null
          p1_finished_round?: boolean | null
          p1_rounds_won?: number | null
          p2_current_score?: number | null
          p2_finished_round?: boolean | null
          p2_rounds_won?: number | null
          player1_id?: string | null
          player2_id?: string | null
          rating_applied?: boolean
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_player1_id_fkey"
            columns: ["player1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_player2_id_fkey"
            columns: ["player2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_campaigns: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          enabled: boolean
          hour: number
          id: string
          last_run_at: string | null
          schedule: string
          segment: Json
          title: string
          weekday: number | null
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          hour?: number
          id?: string
          last_run_at?: string | null
          schedule?: string
          segment: Json
          title: string
          weekday?: number | null
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          hour?: number
          id?: string
          last_run_at?: string | null
          schedule?: string
          segment?: Json
          title?: string
          weekday?: number | null
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string
          campaign_id: string | null
          created_at: string
          id: string
          recipients: number
          segment: Json
          sent: number
          sent_by: string | null
          source: string
          title: string
        }
        Insert: {
          body: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          recipients?: number
          segment: Json
          sent?: number
          sent_by?: string | null
          source?: string
          title: string
        }
        Update: {
          body?: string
          campaign_id?: string | null
          created_at?: string
          id?: string
          recipients?: number
          segment?: Json
          sent?: number
          sent_by?: string | null
          source?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      player_ratings: {
        Row: {
          created_at: string
          elo: number
          losses: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          created_at?: string
          elo?: number
          losses?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          created_at?: string
          elo?: number
          losses?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_config: Json | null
          avatar_url: string | null
          daily_best_streak: number
          daily_last_date: string | null
          daily_streak: number
          id: string
          is_admin: boolean
          last_seen: string | null
          push_lang: string
          push_token: string | null
          show_rank: boolean
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_config?: Json | null
          avatar_url?: string | null
          daily_best_streak?: number
          daily_last_date?: string | null
          daily_streak?: number
          id: string
          is_admin?: boolean
          last_seen?: string | null
          push_lang?: string
          push_token?: string | null
          show_rank?: boolean
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_config?: Json | null
          avatar_url?: string | null
          daily_best_streak?: number
          daily_last_date?: string | null
          daily_streak?: number
          id?: string
          is_admin?: boolean
          last_seen?: string | null
          push_lang?: string
          push_token?: string | null
          show_rank?: boolean
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      quest_claims: {
        Row: {
          created_at: string
          day: string
          quest_id: string
          reward: number
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          quest_id: string
          reward: number
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          quest_id?: string
          reward?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string | null
          game_mode: string
          id: number
          score: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          game_mode: string
          id?: number
          score: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          game_mode?: string
          id?: number
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      season_rewards: {
        Row: {
          coins: number
          created_at: string
          elo: number
          season_id: number
          tier: string
          user_id: string
        }
        Insert: {
          coins: number
          created_at?: string
          elo: number
          season_id: number
          tier: string
          user_id: string
        }
        Update: {
          coins?: number
          created_at?: string
          elo?: number
          season_id?: number
          tier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_rewards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          closed: boolean
          ends_at: string
          id: number
          name: string
          starts_at: string
        }
        Insert: {
          closed?: boolean
          ends_at: string
          id?: number
          name: string
          starts_at: string
        }
        Update: {
          closed?: boolean
          ends_at?: string
          id?: number
          name?: string
          starts_at?: string
        }
        Relationships: []
      }
      solo_coin_log: {
        Row: {
          count: number
          day: string
          game_mode: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          game_mode: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          game_mode?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solo_coin_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_cosmetics: {
        Row: {
          acquired_at: string
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cosmetics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_bot_ranked_result: {
        Args: {
          p_match_id: string
          p_player_rounds_won: number
          p_bot_rounds_won: number
        }
        Returns: Json
      }
      apply_ffa_result: { Args: { p_match_id: string }; Returns: Json }
      apply_online_result: { Args: { p_match_id: string }; Returns: Json }
      apply_ranked_result: { Args: { p_match_id: string }; Returns: Json }
      award_solo_coins: { Args: { p_game_mode: string }; Returns: Json }
      complete_daily: {
        Args: {
          p_date: string
          p_grid: string
          p_mode: string
          p_score: number
        }
        Returns: Json
      }
      claim_quest: { Args: { p_quest_id: string }; Returns: Json }
      claim_rewarded_ad: { Args: never; Returns: Json }
      close_season: { Args: { p_season_id: number }; Returns: Json }
      delete_user_account: { Args: never; Returns: undefined }
      elo_k_factor: { Args: { p_elo: number; p_won: boolean }; Returns: number }
      equip_cosmetics: { Args: { p_config: Json }; Returns: Json }
      featured_cosmetic_today: {
        Args: never
        Returns: {
          base_price: number
          item_id: string
          price: number
        }[]
      }
      finalize_round: { Args: { p_match_id: string }; Returns: Json }
      finalize_round_ffa: { Args: { p_match_id: string }; Returns: Json }
      forfeit_match: {
        Args: { p_match_id: string; p_window_seconds?: number }
        Returns: Json
      }
      get_daily_quests: { Args: never; Returns: Json }
      get_featured_cosmetic: { Args: never; Returns: Json }
      grant_iap_coins: {
        Args: { p_product: string; p_transaction_id: string; p_user: string }
        Returns: Json
      }
      host_ffa_match: { Args: { p_match_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      join_ffa_match: { Args: { p_match_id: string }; Returns: Json }
      purchase_bundle: { Args: { p_bundle_id: string }; Returns: Json }
      purchase_cosmetic: { Args: { p_item_id: string }; Returns: Json }
      quest_defs: {
        Args: never
        Returns: {
          quest_id: string
          reward: number
          target: number
        }[]
      }
      quest_progress: {
        Args: { p_day: string; p_quest_id: string; p_uid: string }
        Returns: number
      }
      rank_tier_from_elo: { Args: { p_elo: number }; Returns: string }
      todays_quest_ids: { Args: { p_day: string }; Returns: string[] }
      touch_last_seen: { Args: never; Returns: undefined }
      touch_match: { Args: { p_match_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
