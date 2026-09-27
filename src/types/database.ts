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
          updated_at?: string;
          zodiac_visible?: boolean;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_terms: { Args: { p_version: string }; Returns: Json };
      add_profile_photo: {
        Args: { p_height: number; p_id: string; p_source: string; p_user: string; p_width: number };
        Returns: Json;
      };
      discovery_feed: { Args: { p_exclude?: string[]; p_limit?: number }; Returns: Json };
      get_my_profile: { Args: Record<PropertyKey, never>; Returns: Json };
      get_my_status: { Args: Record<PropertyKey, never>; Returns: Json };
      get_profile_card: { Args: { p_target: string }; Returns: Json };
      hook_before_user_created: { Args: { event: Json }; Returns: Json };
      remove_profile_photo: { Args: { p_id: string; p_user: string }; Returns: Json };
      reorder_profile_photos: { Args: { p_ids: string[] }; Returns: Json };
      set_date_of_birth: { Args: { p_dob: string }; Returns: Json };
      submit_profile: { Args: Record<PropertyKey, never>; Returns: Json };
      swipe_left: { Args: { p_target: string }; Returns: Json };
      swipe_right: { Args: { p_idempotency_key: string; p_target: string }; Returns: Json };
    };
    Enums: {
      account_state: 'active' | 'suspended' | 'banned' | 'deletion_pending';
      admin_role: 'moderator' | 'admin';
      gender: 'woman' | 'man' | 'non_binary';
      photo_status: 'pending' | 'approved' | 'rejected';
      privacy_mode: 'normal' | 'private' | 'anonymous';
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
      photo_status: ['pending', 'approved', 'rejected'],
      privacy_mode: ['normal', 'private', 'anonymous'],
    },
  },
} as const;
