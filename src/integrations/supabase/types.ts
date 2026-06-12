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
      attendance_records: {
        Row: {
          attendance_date: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude: number | null
          longitude: number | null
          notes: string | null
          occurred_at: string
          office_location_id: string | null
          selfie_url: string | null
          shift_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          attendance_date?: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          occurred_at?: string
          office_location_id?: string | null
          selfie_url?: string | null
          shift_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["attendance_kind"]
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          occurred_at?: string
          office_location_id?: string | null
          selfie_url?: string | null
          shift_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_office_location_id_fkey"
            columns: ["office_location_id"]
            isOneToOne: false
            referencedRelation: "office_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          allotted: number
          id: string
          leave_type_id: string
          tenant_id: string
          used: number
          user_id: string
          year: number
        }
        Insert: {
          allotted?: number
          id?: string
          leave_type_id: string
          tenant_id: string
          used?: number
          user_id: string
          year?: number
        }
        Update: {
          allotted?: number
          id?: string
          leave_type_id?: string
          tenant_id?: string
          used?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          days: number
          end_date: string
          id: string
          leave_type_id: string | null
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days: number
          end_date: string
          id?: string
          leave_type_id?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days?: number
          end_date?: string
          id?: string
          leave_type_id?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey"
            columns: ["leave_type_id"]
            isOneToOne: false
            referencedRelation: "leave_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_types: {
        Row: {
          annual_quota: number
          created_at: string
          id: string
          is_paid: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          annual_quota?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          annual_quota?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      office_locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          latitude: number
          longitude: number
          name: string
          radius_meters: number
          tenant_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
          tenant_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          metadata: Json | null
          payer_email: string | null
          payer_name: string | null
          plan_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          metadata?: Json | null
          payer_email?: string | null
          payer_name?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          metadata?: Json | null
          payer_email?: string | null
          payer_name?: string | null
          plan_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          absent_days: number
          base_salary: number
          deductions: number
          generated_at: string
          id: string
          net_pay: number
          overtime_hours: number
          paid_leave_days: number
          period_month: number
          period_year: number
          present_days: number
          tenant_id: string
          unpaid_leave_days: number
          user_id: string
          working_days: number
        }
        Insert: {
          absent_days?: number
          base_salary: number
          deductions?: number
          generated_at?: string
          id?: string
          net_pay?: number
          overtime_hours?: number
          paid_leave_days?: number
          period_month: number
          period_year: number
          present_days?: number
          tenant_id: string
          unpaid_leave_days?: number
          user_id: string
          working_days?: number
        }
        Update: {
          absent_days?: number
          base_salary?: number
          deductions?: number
          generated_at?: string
          id?: string
          net_pay?: number
          overtime_hours?: number
          paid_leave_days?: number
          period_month?: number
          period_year?: number
          present_days?: number
          tenant_id?: string
          unpaid_leave_days?: number
          user_id?: string
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_reset_requests: {
        Row: {
          created_at: string
          id: string
          new_pin_preview: string | null
          phone: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_pin_preview?: string | null
          phone: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_pin_preview?: string | null
          phone?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pin_reset_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing: Database["public"]["Enums"]["plan_billing"]
          created_at: string
          description: string | null
          display_order: number | null
          employee_limit: number
          features: Json | null
          id: string
          is_active: boolean
          name: string
          price_inr: number
          updated_at: string
        }
        Insert: {
          billing: Database["public"]["Enums"]["plan_billing"]
          created_at?: string
          description?: string | null
          display_order?: number | null
          employee_limit: number
          features?: Json | null
          id?: string
          is_active?: boolean
          name: string
          price_inr: number
          updated_at?: string
        }
        Update: {
          billing?: Database["public"]["Enums"]["plan_billing"]
          created_at?: string
          description?: string | null
          display_order?: number | null
          employee_limit?: number
          features?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          price_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          designation: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          monthly_salary: number | null
          phone: string | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          monthly_salary?: number | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          monthly_salary?: number | null
          phone?: string | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          break_minutes: number | null
          created_at: string
          end_time: string
          id: string
          is_active: boolean
          name: string
          start_time: string
          tenant_id: string
          working_days: number[] | null
        }
        Insert: {
          break_minutes?: number | null
          created_at?: string
          end_time: string
          id?: string
          is_active?: boolean
          name: string
          start_time: string
          tenant_id: string
          working_days?: number[] | null
        }
        Update: {
          break_minutes?: number | null
          created_at?: string
          end_time?: string
          id?: string
          is_active?: boolean
          name?: string
          start_time?: string
          tenant_id?: string
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          shift_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          razorpay_subscription_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id: string
          razorpay_subscription_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          razorpay_subscription_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          employee_limit: number
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_limit?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_limit?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "client_admin" | "staff"
      attendance_kind: "check_in" | "check_out" | "break_out" | "break_in"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      payment_status: "pending" | "success" | "failed" | "refunded"
      plan_billing: "monthly" | "yearly" | "lifetime"
      subscription_status:
        | "trial"
        | "active"
        | "suspended"
        | "cancelled"
        | "expired"
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
      app_role: ["super_admin", "client_admin", "staff"],
      attendance_kind: ["check_in", "check_out", "break_out", "break_in"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      payment_status: ["pending", "success", "failed", "refunded"],
      plan_billing: ["monthly", "yearly", "lifetime"],
      subscription_status: [
        "trial",
        "active",
        "suspended",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
