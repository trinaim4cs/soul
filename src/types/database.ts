export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_private: {
        Row: {
          account_state: Database['public']['Enums']['account_state'];
          age_gate_failed_at: string | null;
          created_at: string;
          date_of_birth: string | null;
          id: string;
          institutional_email_verified_at: string | null;
          profile_completed_at: string | null;
          terms_accepted_at: string | null;
          terms_version: string | null;
          updated_at: string;
        };
        Insert: {
          account_state?: Database['public']['Enums']['account_state'];
          age_gate_failed_at?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          id: string;
          institutional_email_verified_at?: string | null;
          profile_completed_at?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Update: {
          account_state?: Database['public']['Enums']['account_state'];
          age_gate_failed_at?: string | null;
          created_at?: string;
          date_of_birth?: string | null;
          id?: string;
          institutional_email_verified_at?: string | null;
          profile_completed_at?: string | null;
          terms_accepted_at?: string | null;
          terms_version?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          role: Database['public']['Enums']['admin_role'];
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          role: Database['public']['Enums']['admin_role'];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          role?: Database['public']['Enums']['admin_role'];
          user_id?: string;
        };
        Relationships: [];
      };
      app_config: {
        Row: {
          client_visible: boolean;
          description: string;
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        Insert: {
          client_visible?: boolean;
          description: string;
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          client_visible?: boolean;
          description?: string;
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: number;
          metadata: NonNullable<Json>;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: never;
          metadata?: NonNullable<Json>;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          last_read_message_id: number;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          last_read_message_id?: number;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_message_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          closed_at: string | null;
          created_at: string;
          id: string;
          instant_session_id: string | null;
          last_message_at: string | null;
          match_id: string | null;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          instant_session_id?: string | null;
          last_message_at?: string | null;
          match_id?: string | null;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          instant_session_id?: string | null;
          last_message_at?: string | null;
          match_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_instant_session_id_fkey';
            columns: ['instant_session_id'];
            isOneToOne: true;
            referencedRelation: 'instant_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: true;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      date_review_flags: {
        Row: {
          created_at: string;
          date_round_id: string;
          id: number;
          reason: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          date_round_id: string;
          id?: never;
          reason: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          date_round_id?: string;
          id?: never;
          reason?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'date_review_flags_date_round_id_fkey';
            columns: ['date_round_id'];
            isOneToOne: false;
            referencedRelation: 'date_rounds';
            referencedColumns: ['id'];
          },
        ];
      };
      date_rounds: {
        Row: {
          a_answer: boolean | null;
          a_answered_at: string | null;
          b_answer: boolean | null;
          b_answered_at: string | null;
          closed_at: string | null;
          closes_at: string;
          confirmed_at: string | null;
          id: string;
          instant_session_id: string | null;
          invalidated_at: string | null;
          invalidated_by: string | null;
          invalidated_reason: string | null;
          match_id: string | null;
          opened_at: string;
          source: string;
          status: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          a_answer?: boolean | null;
          a_answered_at?: string | null;
          b_answer?: boolean | null;
          b_answered_at?: string | null;
          closed_at?: string | null;
          closes_at: string;
          confirmed_at?: string | null;
          id?: string;
          instant_session_id?: string | null;
          invalidated_at?: string | null;
          invalidated_by?: string | null;
          invalidated_reason?: string | null;
          match_id?: string | null;
          opened_at?: string;
          source: string;
          status?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          a_answer?: boolean | null;
          a_answered_at?: string | null;
          b_answer?: boolean | null;
          b_answered_at?: string | null;
          closed_at?: string | null;
          closes_at?: string;
          confirmed_at?: string | null;
          id?: string;
          instant_session_id?: string | null;
          invalidated_at?: string | null;
          invalidated_by?: string | null;
          invalidated_reason?: string | null;
          match_id?: string | null;
          opened_at?: string;
          source?: string;
          status?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'date_rounds_instant_session_id_fkey';
            columns: ['instant_session_id'];
            isOneToOne: false;
            referencedRelation: 'instant_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'date_rounds_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flags: {
        Row: {
          description: string;
          enabled: boolean;
          key: string;
          updated_at: string;
        };
        Insert: {
          description: string;
          enabled?: boolean;
          key: string;
          updated_at?: string;
        };
        Update: {
          description?: string;
          enabled?: boolean;
          key?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      instant_sessions: {
        Row: {
          end_reason: string | null;
          ended_at: string | null;
          ended_by: string | null;
          expires_at: string;
          id: string;
          started_at: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          expires_at: string;
          id?: string;
          started_at?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          end_reason?: string | null;
          ended_at?: string | null;
          ended_by?: string | null;
          expires_at?: string;
          id?: string;
          started_at?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [];
      };
      likes: {
        Row: {
          created_at: string;
          idempotency_key: string;
          liker_id: string;
          target_id: string;
        };
        Insert: {
          created_at?: string;
          idempotency_key: string;
          liker_id: string;
          target_id: string;
        };
        Update: {
          created_at?: string;
          idempotency_key?: string;
          liker_id?: string;
          target_id?: string;
        };
        Relationships: [];
      };
      matches: {
        Row: {
          a_seen_at: string | null;
          active: boolean;
          b_seen_at: string | null;
          created_at: string;
          ended_at: string | null;
          ended_by: string | null;
          id: string;
          user_a: string;
          user_b: string;
        };
        Insert: {
          a_seen_at?: string | null;
          active?: boolean;
          b_seen_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
          user_a: string;
          user_b: string;
        };
        Update: {
          a_seen_at?: string | null;
          active?: boolean;
          b_seen_at?: string | null;
          created_at?: string;
          ended_at?: string | null;
          ended_by?: string | null;
          id?: string;
          user_a?: string;
          user_b?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          body: string;
          client_id: string;
          conversation_id: string;
          created_at: string;
          id: number;
          reply_to_id: number | null;
          sender_id: string;
        };
        Insert: {
          body: string;
          client_id: string;
          conversation_id: string;
          created_at?: string;
          id?: never;
          reply_to_id?: number | null;
          sender_id: string;
        };
        Update: {
          body?: string;
          client_id?: string;
          conversation_id?: string;
          created_at?: string;
          id?: never;
          reply_to_id?: number | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_reply_to_id_fkey';
            columns: ['reply_to_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      passes: {
        Row: {
          passed_at: string;
          passer_id: string;
          target_id: string;
        };
        Insert: {
          passed_at?: string;
          passer_id: string;
          target_id: string;
        };
        Update: {
          passed_at?: string;
          passer_id?: string;
          target_id?: string;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          active: boolean;
          id: string;
          includes_instant: boolean;
          kind: Database['public']['Enums']['plan_kind'];
          period: string | null;
          period_label: string | null;
          price_paise: number;
          right_swipes: number;
          sort_order: number;
          title: string;
        };
        Insert: {
          active?: boolean;
          id: string;
          includes_instant?: boolean;
          kind: Database['public']['Enums']['plan_kind'];
          period?: string | null;
          period_label?: string | null;
          price_paise: number;
          right_swipes: number;
          sort_order: number;
          title: string;
        };
        Update: {
          active?: boolean;
          id?: string;
          includes_instant?: boolean;
          kind?: Database['public']['Enums']['plan_kind'];
          period?: string | null;
          period_label?: string | null;
          price_paise?: number;
          right_swipes?: number;
          sort_order?: number;
          title?: string;
        };
        Relationships: [];
      };
      preferences: {
        Row: {
          max_age: number;
          min_age: number;
          show_me: Database['public']['Enums']['gender'][];
          updated_at: string;
          user_id: string;
          zodiac_filter: string[] | null;
        };
        Insert: {
          max_age?: number;
          min_age?: number;
          show_me?: Database['public']['Enums']['gender'][];
          updated_at?: string;
          user_id: string;
          zodiac_filter?: string[] | null;
        };
        Update: {
          max_age?: number;
          min_age?: number;
          show_me?: Database['public']['Enums']['gender'][];
          updated_at?: string;
          user_id?: string;
          zodiac_filter?: string[] | null;
        };
        Relationships: [];
      };
      profile_photos: {
        Row: {
          blurred_path: string;
          created_at: string;
          height: number;
          id: string;
          position: number;
          rejection_reason: string | null;
          reviewed_at: string | null;
          source: string;
          status: Database['public']['Enums']['photo_status'];
          storage_path: string;
          user_id: string;
          width: number;
        };
        Insert: {
          blurred_path: string;
          created_at?: string;
          height: number;
          id: string;
          position: number;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          source: string;
          status: Database['public']['Enums']['photo_status'];
          storage_path: string;
          user_id: string;
          width: number;
        };
        Update: {
          blurred_path?: string;
          created_at?: string;
          height?: number;
          id?: string;
          position?: number;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          source?: string;
          status?: Database['public']['Enums']['photo_status'];
          storage_path?: string;
          user_id?: string;
          width?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          about: string | null;
          created_at: string;
          display_name: string | null;
          gender: Database['public']['Enums']['gender'] | null;
          hook: string | null;
          id: string;
          privacy_mode: Database['public']['Enums']['privacy_mode'];
          read_receipts: boolean;
          reveal_on_match: boolean;
          updated_at: string;
          zodiac_visible: boolean;
        };
        Insert: {
          about?: string | null;
          created_at?: string;
          display_name?: string | null;
          gender?: Database['public']['Enums']['gender'] | null;
          hook?: string | null;
          id: string;
          privacy_mode?: Database['public']['Enums']['privacy_mode'];
          read_receipts?: boolean;
          reveal_on_match?: boolean;
          updated_at?: string;
          zodiac_visible?: boolean;
        };
        Update: {
          about?: string | null;
          created_at?: string;
          display_name?: string | null;
          gender?: Database['public']['Enums']['gender'] | null;
          hook?: string | null;
          id?: string;
          privacy_mode?: Database['public']['Enums']['privacy_mode'];
          read_receipts?: boolean;
          reveal_on_match?: boolean;
          updated_at?: string;
          zodiac_visible?: boolean;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          ends_at: string;
          id: string;
          plan_id: string;
          source_key: string;
          starts_at: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          ends_at: string;
          id?: string;
          plan_id: string;
          source_key: string;
          starts_at: string;
          status?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          ends_at?: string;
          id?: string;
          plan_id?: string;
          source_key?: string;
          starts_at?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subscriptions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      swipe_credit_ledger: {
        Row: {
          bucket: Database['public']['Enums']['swipe_bucket'];
          created_at: string;
          delta: number;
          entry: Database['public']['Enums']['ledger_entry'];
          expires_at: string | null;
          id: number;
          idempotency_key: string;
          like_target: string | null;
          lot_id: number | null;
          subscription_id: string | null;
          user_id: string;
          valid_from: string | null;
        };
        Insert: {
          bucket: Database['public']['Enums']['swipe_bucket'];
          created_at?: string;
          delta: number;
          entry: Database['public']['Enums']['ledger_entry'];
          expires_at?: string | null;
          id?: never;
          idempotency_key: string;
          like_target?: string | null;
          lot_id?: number | null;
          subscription_id?: string | null;
          user_id: string;
          valid_from?: string | null;
        };
        Update: {
          bucket?: Database['public']['Enums']['swipe_bucket'];
          created_at?: string;
          delta?: number;
          entry?: Database['public']['Enums']['ledger_entry'];
          expires_at?: string | null;
          id?: never;
          idempotency_key?: string;
          like_target?: string | null;
          lot_id?: number | null;
          subscription_id?: string | null;
          user_id?: string;
          valid_from?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'swipe_credit_ledger_lot_id_fkey';
            columns: ['lot_id'];
            isOneToOne: false;
            referencedRelation: 'swipe_credit_ledger';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'swipe_credit_ledger_subscription_id_fkey';
            columns: ['subscription_id'];
            isOneToOne: false;
            referencedRelation: 'subscriptions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_terms: { Args: { p_version: string }; Returns: Json };
      activate_plan: { Args: { p_key: string; p_plan: string; p_user: string }; Returns: Json };
      add_profile_photo: {
        Args: { p_height: number; p_id: string; p_source: string; p_user: string; p_width: number };
        Returns: Json;
      };
      answer_date: { Args: { p_met: boolean; p_other: string }; Returns: Json };
      date_state: { Args: { p_other: string }; Returns: Json };
      discovery_feed: { Args: { p_exclude?: string[]; p_limit?: number }; Returns: Json };
      get_match: { Args: { p_match: string }; Returns: Json };
      get_messages: {
        Args: { p_before?: number; p_conversation: string; p_limit?: number };
        Returns: Json;
      };
      get_my_dates: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_matches: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_status: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_swipes: { Args: Record<PropertyKey, never>; Returns: Json };
      get_profile_card: { Args: { p_target: string }; Returns: Json };
      hook_before_user_created: { Args: { event: Json }; Returns: Json };
      hook_custom_access_token: { Args: { event: Json }; Returns: Json };
      instant_accept: { Args: { p_candidate: string }; Returns: Json };
      instant_candidates: { Args: Record<PropertyKey, never>; Returns: Json };
      instant_end_session: { Args: Record<PropertyKey, never>; Returns: Json };
      instant_skip: { Args: { p_candidate: string }; Returns: Json };
      instant_start: { Args: { p_minutes: number }; Returns: Json };
      instant_state: { Args: Record<PropertyKey, never>; Returns: Json };
      instant_stop: { Args: Record<PropertyKey, never>; Returns: Json };
      instant_update_location: {
        Args: { p_accuracy: number; p_latitude: number; p_longitude: number };
        Returns: Json;
      };
      invalidate_date: { Args: { p_reason: string; p_round: string }; Returns: Json };
      mark_conversation_read: {
        Args: { p_conversation: string; p_message: number };
        Returns: Json;
      };
      mark_match_seen: { Args: { p_match: string }; Returns: Json };
      remove_profile_photo: { Args: { p_id: string; p_user: string }; Returns: Json };
      reorder_profile_photos: { Args: { p_ids: string[] }; Returns: Json };
      send_message: {
        Args: { p_body: string; p_client_id: string; p_conversation: string; p_reply_to?: number };
        Returns: Json;
      };
      set_date_of_birth: { Args: { p_dob: string }; Returns: Json };
      submit_profile: { Args: Record<PropertyKey, never>; Returns: Json };
      swipe_left: { Args: { p_target: string }; Returns: Json };
      swipe_right: { Args: { p_idempotency_key: string; p_target: string }; Returns: Json };
      unmatch: { Args: { p_match: string }; Returns: Json };
    };
    Enums: {
      account_state: 'active' | 'suspended' | 'banned' | 'deletion_pending';
      admin_role: 'moderator' | 'admin';
      gender: 'woman' | 'man' | 'non_binary';
      ledger_entry: 'grant' | 'consume' | 'refund' | 'reverse' | 'expire';
      photo_status: 'pending' | 'approved' | 'rejected';
      plan_kind: 'subscription' | 'topup';
      privacy_mode: 'normal' | 'private' | 'anonymous';
      swipe_bucket: 'free' | 'plan' | 'topup';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_state: ['active', 'suspended', 'banned', 'deletion_pending'],
      admin_role: ['moderator', 'admin'],
      gender: ['woman', 'man', 'non_binary'],
      ledger_entry: ['grant', 'consume', 'refund', 'reverse', 'expire'],
      photo_status: ['pending', 'approved', 'rejected'],
      plan_kind: ['subscription', 'topup'],
      privacy_mode: ['normal', 'private', 'anonymous'],
      swipe_bucket: ['free', 'plan', 'topup'],
    },
  },
} as const;
