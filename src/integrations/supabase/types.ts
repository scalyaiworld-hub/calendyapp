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
      api_keys: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "x_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          attempts: number
          business_id: string
          channel: string
          created_at: string
          error: string | null
          id: string
          provider_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          business_id: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          business_id?: string
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          provider_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reminders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          business_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          client_id: string
          created_at: string
          ends_at: string
          id: string
          location_id: string | null
          notes: string | null
          professional_id: string | null
          service_id: string
          source: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id: string
          created_at?: string
          ends_at: string
          id?: string
          location_id?: string | null
          notes?: string | null
          professional_id?: string | null
          service_id: string
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          client_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          professional_id?: string | null
          service_id?: string
          source?: Database["public"]["Enums"]["appointment_source"]
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          business_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          business_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          business_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          business_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_rules_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_invites: {
        Row: {
          business_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          professional_id: string | null
          role: Database["public"]["Enums"]["business_role"]
        }
        Insert: {
          business_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          professional_id?: string | null
          role: Database["public"]["Enums"]["business_role"]
        }
        Update: {
          business_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          professional_id?: string | null
          role?: Database["public"]["Enums"]["business_role"]
        }
        Relationships: [
          {
            foreignKeyName: "business_invites_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_invites_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          professional_id: string | null
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          professional_id?: string | null
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          professional_id?: string | null
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_members_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          brand_background: string | null
          brand_font: string | null
          brand_primary: string | null
          created_at: string
          deleted_at: string | null
          id: string
          industry: string | null
          logo_url: string | null
          name: string
          onboarding_completed: boolean
          onboarding_step: number
          owner_id: string
          phone: string | null
          plan: string
          reminder_hours_before: number
          reminders_enabled: boolean
          slug: string
          timezone: string
          updated_at: string
          whatsapp_country_code: string | null
          whatsapp_number: string | null
        }
        Insert: {
          brand_background?: string | null
          brand_font?: string | null
          brand_primary?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean
          onboarding_step?: number
          owner_id: string
          phone?: string | null
          plan?: string
          reminder_hours_before?: number
          reminders_enabled?: boolean
          slug: string
          timezone?: string
          updated_at?: string
          whatsapp_country_code?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          brand_background?: string | null
          brand_font?: string | null
          brand_primary?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean
          onboarding_step?: number
          owner_id?: string
          phone?: string | null
          plan?: string
          reminder_hours_before?: number
          reminders_enabled?: boolean
          slug?: string
          timezone?: string
          updated_at?: string
          whatsapp_country_code?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      calendar_feeds: {
        Row: {
          business_id: string
          created_at: string
          token: string
        }
        Insert: {
          business_id: string
          created_at?: string
          token: string
        }
        Update: {
          business_id?: string
          created_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_feeds_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          last_visit_at: string | null
          name: string
          no_show_count: number
          notes: string | null
          phone: string
          phone_country_code: string | null
          total_appointments: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name: string
          no_show_count?: number
          notes?: string | null
          phone: string
          phone_country_code?: string | null
          total_appointments?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string
          no_show_count?: number
          notes?: string | null
          phone?: string
          phone_country_code?: string | null
          total_appointments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      location_hours: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          location_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          location_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          location_id?: string
          start_time?: string
        }
        Relationships: []
      }
      location_professionals: {
        Row: {
          created_at: string
          location_id: string
          professional_id: string
        }
        Insert: {
          created_at?: string
          location_id: string
          professional_id: string
        }
        Update: {
          created_at?: string
          location_id?: string
          professional_id?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          deleted_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          phone: string | null
          phone_country_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      upgrade_requests: {
        Row: {
          business_id: string
          created_at: string
          details: Json
          email: string
          id: string
          industry: string
          message: string | null
          name: string
          phone: string | null
          plan: string
          status: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          details?: Json
          email: string
          id?: string
          industry: string
          message?: string | null
          name: string
          phone?: string | null
          plan: string
          status?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          details?: Json
          email?: string
          id?: string
          industry?: string
          message?: string | null
          name?: string
          phone?: string | null
          plan?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pro_preregistrations: {
        Row: {
          created_at: string
          email: string
          id: string
          negocio: string | null
          nombre: string
          telefono: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          negocio?: string | null
          nombre: string
          telefono?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          negocio?: string | null
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      professional_services: {
        Row: {
          created_at: string
          professional_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          professional_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          professional_id?: string
          service_id?: string
        }
        Relationships: []
      }
      professionals: {
        Row: {
          avatar_url: string | null
          business_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          phone_country_code: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          business_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          phone_country_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          business_id: string
          created_at: string
          deleted_at: string | null
          description: string | null
          display_order: number
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_order?: number
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_endpoints: {
        Row: {
          business_id: string
          created_at: string
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          secret: string
          url: string
        }
        Insert: {
          business_id: string
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          secret: string
          url: string
        }
        Update: {
          business_id?: string
          created_at?: string
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          secret?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "x_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          business_id: string
          created_at: string
          event: string
          id: string
          payload: Json
        }
        Insert: {
          business_id: string
          created_at?: string
          event: string
          id?: string
          payload: Json
        }
        Update: {
          business_id?: string
          created_at?: string
          event?: string
          id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "x_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          endpoint_id: string
          event_id: string
          id: string
          last_error: string | null
          next_attempt_at: string
          response_status: number | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          endpoint_id: string
          event_id: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          endpoint_id?: string
          event_id?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          response_status?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "x_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        
          {
            foreignKeyName: "x_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "webhook_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_appointment_slots: {
        Row: {
          business_id: string | null
          ends_at: string | null
          id: string | null
          location_id: string | null
          professional_id: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["appointment_status"] | null
        }
        Insert: {
          business_id?: string | null
          ends_at?: string | null
          id?: string | null
          location_id?: string | null
          professional_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
        }
        Update: {
          business_id?: string | null
          ends_at?: string | null
          id?: string | null
          location_id?: string | null
          professional_id?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["appointment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      public_businesses: {
        Row: {
          created_at: string | null
          id: string | null
          industry: string | null
          logo_url: string | null
          name: string | null
          slug: string | null
          timezone: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          industry?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          timezone?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          industry?: string | null
          logo_url?: string | null
          name?: string | null
          slug?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      public_locations: {
        Row: {
          address: string | null
          business_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          address?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          address?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
      public_professionals: {
        Row: {
          avatar_url: string | null
          business_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
        }
        Insert: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Update: {
          avatar_url?: string | null
          business_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_business_role: {
        Args: { _business_id: string; _roles: Database["public"]["Enums"]["business_role"][] }
        Returns: boolean
      }
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string }
        Returns: boolean
      }
      is_business_owner: { Args: { _business_id: string }; Returns: boolean }
      is_slug_available: {
        Args: { _slug: string; _exclude_id?: string }
        Returns: boolean
      }
      my_professional_id: { Args: { _business_id: string }; Returns: string }
      normalize_phone: { Args: { p: string }; Returns: string }
      plan_limit: {
        Args: { _plan: string; _resource: string }
        Returns: number
      }
      recalc_client_counters: {
        Args: { _client_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin"
      business_role: "manager" | "reception" | "professional"
      appointment_source: "manual" | "booking_page" | "chat_ai" | "whatsapp"
      appointment_status:
        | "pending"
        | "booked"
        | "completed"
        | "cancelled"
        | "no_show"
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
    Enums: {
      app_role: ["admin"],
      business_role: ["manager", "reception", "professional"],
      appointment_source: ["manual", "booking_page", "chat_ai", "whatsapp"],
      appointment_status: [
        "pending",
        "booked",
        "completed",
        "cancelled",
        "no_show",
      ],
    },
  },
} as const
