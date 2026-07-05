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
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_pinned: boolean
          tenant_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          tenant_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          accuracy_meters: number | null
          address_text: string | null
          attendance_date: string
          branch_id: string | null
          created_at: string
          distance_from_office_m: number | null
          enforcement_status: Database["public"]["Enums"]["enforcement_status"]
          face_verified: boolean
          id: string
          is_mock_location: boolean
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
          accuracy_meters?: number | null
          address_text?: string | null
          attendance_date?: string
          branch_id?: string | null
          created_at?: string
          distance_from_office_m?: number | null
          enforcement_status?: Database["public"]["Enums"]["enforcement_status"]
          face_verified?: boolean
          id?: string
          is_mock_location?: boolean
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
          accuracy_meters?: number | null
          address_text?: string | null
          attendance_date?: string
          branch_id?: string | null
          created_at?: string
          distance_from_office_m?: number | null
          enforcement_status?: Database["public"]["Enums"]["enforcement_status"]
          face_verified?: boolean
          id?: string
          is_mock_location?: boolean
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
            foreignKeyName: "attendance_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          checkin_window_end: string | null
          checkin_window_start: string | null
          checkout_window_end: string | null
          checkout_window_start: string | null
          city: string | null
          code: string | null
          country: string | null
          created_at: string
          default_radius_meters: number
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          state: string | null
          tenant_id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          checkin_window_end?: string | null
          checkin_window_start?: string | null
          checkout_window_end?: string | null
          checkout_window_start?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          default_radius_meters?: number
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          state?: string | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          checkin_window_end?: string | null
          checkin_window_start?: string | null
          checkout_window_end?: string | null
          checkout_window_start?: string | null
          city?: string | null
          code?: string | null
          country?: string | null
          created_at?: string
          default_radius_meters?: number
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          state?: string | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          branch_id: string | null
          created_at: string
          grade: string | null
          id: string
          name: string
          section: string | null
          teacher_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          name: string
          section?: string | null
          teacher_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          name?: string
          section?: string | null
          teacher_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          key: string
          scope: string
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          scope: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          scope?: string
        }
        Relationships: []
      }
      impersonation_audit: {
        Row: {
          id: string
          magic_link_preview: string | null
          reason: string | null
          started_at: string
          super_admin_id: string
          target_tenant_id: string | null
          target_user_id: string
        }
        Insert: {
          id?: string
          magic_link_preview?: string | null
          reason?: string | null
          started_at?: string
          super_admin_id: string
          target_tenant_id?: string | null
          target_user_id: string
        }
        Update: {
          id?: string
          magic_link_preview?: string | null
          reason?: string | null
          started_at?: string
          super_admin_id?: string
          target_tenant_id?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_audit_target_tenant_id_fkey"
            columns: ["target_tenant_id"]
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
          {
            foreignKeyName: "leave_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          ref_id: string | null
          ref_table: string | null
          tenant_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          tenant_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          ref_id?: string | null
          ref_table?: string | null
          tenant_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_locations: {
        Row: {
          address: string | null
          branch_id: string | null
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
          branch_id?: string | null
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
          branch_id?: string | null
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
            foreignKeyName: "office_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_orders: {
        Row: {
          amount_paise: number
          created_at: string
          id: string
          plan_id: string
          purpose: string
          razorpay_order_id: string
          razorpay_payment_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          id?: string
          plan_id: string
          purpose?: string
          razorpay_order_id: string
          razorpay_payment_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          id?: string
          plan_id?: string
          purpose?: string
          razorpay_order_id?: string
          razorpay_payment_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans_with_label"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_tenant_id_fkey"
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
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans_with_label"
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
          amount_paid: number
          base_salary: number
          branch_id: string | null
          deductions: number
          generated_at: string
          id: string
          last_paid_at: string | null
          late_days: number
          late_fine: number
          net_pay: number
          overtime_hours: number
          paid_leave_days: number
          payment_status: string
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
          amount_paid?: number
          base_salary: number
          branch_id?: string | null
          deductions?: number
          generated_at?: string
          id?: string
          last_paid_at?: string | null
          late_days?: number
          late_fine?: number
          net_pay?: number
          overtime_hours?: number
          paid_leave_days?: number
          payment_status?: string
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
          amount_paid?: number
          base_salary?: number
          branch_id?: string | null
          deductions?: number
          generated_at?: string
          id?: string
          last_paid_at?: string | null
          late_days?: number
          late_fine?: number
          net_pay?: number
          overtime_hours?: number
          paid_leave_days?: number
          payment_status?: string
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
            foreignKeyName: "payslips_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_bank_changes: {
        Row: {
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          created_at: string
          id: string
          prev_bank_account_holder: string | null
          prev_bank_account_number: string | null
          prev_bank_ifsc: string | null
          prev_bank_name: string | null
          prev_upi_id: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          upi_id: string | null
          user_id: string
        }
        Insert: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          prev_bank_account_holder?: string | null
          prev_bank_account_number?: string | null
          prev_bank_ifsc?: string | null
          prev_bank_name?: string | null
          prev_upi_id?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          upi_id?: string | null
          user_id: string
        }
        Update: {
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          created_at?: string
          id?: string
          prev_bank_account_holder?: string | null
          prev_bank_account_number?: string | null
          prev_bank_ifsc?: string | null
          prev_bank_name?: string | null
          prev_upi_id?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          upi_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_bank_changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_photo_changes: {
        Row: {
          created_at: string
          id: string
          photo_path: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_path: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_path?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_photo_changes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_signature_changes: {
        Row: {
          created_at: string
          id: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          signature_path: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_path: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          signature_path?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_signature_changes_tenant_id_fkey"
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
          {
            foreignKeyName: "pin_reset_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pin_reset_requests_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing: Database["public"]["Enums"]["plan_billing"]
          billing_period_months: number | null
          created_at: string
          description: string | null
          display_order: number | null
          employee_limit: number
          features: Json | null
          id: string
          is_active: boolean
          maintenance_fee_inr: number | null
          maintenance_grace_months: number | null
          maintenance_period_months: number
          name: string
          price_inr: number
          updated_at: string
        }
        Insert: {
          billing: Database["public"]["Enums"]["plan_billing"]
          billing_period_months?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          employee_limit: number
          features?: Json | null
          id?: string
          is_active?: boolean
          maintenance_fee_inr?: number | null
          maintenance_grace_months?: number | null
          maintenance_period_months?: number
          name: string
          price_inr: number
          updated_at?: string
        }
        Update: {
          billing?: Database["public"]["Enums"]["plan_billing"]
          billing_period_months?: number | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          employee_limit?: number
          features?: Json | null
          id?: string
          is_active?: boolean
          maintenance_fee_inr?: number | null
          maintenance_grace_months?: number | null
          maintenance_period_months?: number
          name?: string
          price_inr?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          bank_account_holder: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          blood_group: string | null
          branch_id: string | null
          created_at: string
          date_of_birth: string | null
          date_of_joining: string | null
          designation: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          gender: string | null
          home_latitude: number | null
          home_longitude: number | null
          id: string
          id_proof_number: string | null
          id_proof_type: string | null
          is_active: boolean
          is_field_staff: boolean
          monthly_salary: number | null
          phone: string | null
          photo_locked: boolean
          profile_completion: number | null
          signature_locked: boolean
          staff_id: string | null
          tenant_id: string | null
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          blood_group?: string | null
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_joining?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          is_active?: boolean
          is_field_staff?: boolean
          monthly_salary?: number | null
          phone?: string | null
          photo_locked?: boolean
          profile_completion?: number | null
          signature_locked?: boolean
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          bank_account_holder?: string | null
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          blood_group?: string | null
          branch_id?: string | null
          created_at?: string
          date_of_birth?: string | null
          date_of_joining?: string | null
          designation?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          gender?: string | null
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          id_proof_number?: string | null
          id_proof_type?: string | null
          is_active?: boolean
          is_field_staff?: boolean
          monthly_salary?: number | null
          phone?: string | null
          photo_locked?: boolean
          profile_completion?: number | null
          signature_locked?: boolean
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          banner_text: string
          created_at: string
          cta_text: string
          ends_at: string | null
          highlight_plan_id: string | null
          id: string
          is_active: boolean
          max_claims: number
          slug: string
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_text: string
          created_at?: string
          cta_text?: string
          ends_at?: string | null
          highlight_plan_id?: string | null
          id?: string
          is_active?: boolean
          max_claims: number
          slug: string
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_text?: string
          created_at?: string
          cta_text?: string
          ends_at?: string | null
          highlight_plan_id?: string | null
          id?: string
          is_active?: boolean
          max_claims?: number
          slug?: string
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_highlight_plan_id_fkey"
            columns: ["highlight_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_highlight_plan_id_fkey"
            columns: ["highlight_plan_id"]
            isOneToOne: false
            referencedRelation: "plans_with_label"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string | null
          platform: string
          user_id: string
        }
        Insert: {
          auth?: string | null
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform?: string
          user_id: string
        }
        Update: {
          auth?: string | null
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string | null
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          note: string | null
          paid_at: string
          paid_by: string | null
          payslip_id: string
          reference: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payslip_id: string
          reference?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payslip_id?: string
          reference?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          id: string
          reason: string | null
          reject_reason: string | null
          requester_date: string
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_date: string
          target_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason?: string | null
          reject_reason?: string | null
          requester_date: string
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_date: string
          target_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string | null
          reject_reason?: string | null
          requester_date?: string
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_date?: string
          target_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          branch_id: string | null
          break_minutes: number | null
          created_at: string
          end_time: string
          grace_minutes: number
          half_day_after_minutes: number
          id: string
          is_active: boolean
          late_fine_amount: number
          late_fine_type: string
          location_mode: Database["public"]["Enums"]["location_mode"]
          name: string
          start_time: string
          tenant_id: string
          working_days: number[] | null
        }
        Insert: {
          branch_id?: string | null
          break_minutes?: number | null
          created_at?: string
          end_time: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_fine_amount?: number
          late_fine_type?: string
          location_mode?: Database["public"]["Enums"]["location_mode"]
          name: string
          start_time: string
          tenant_id: string
          working_days?: number[] | null
        }
        Update: {
          branch_id?: string | null
          break_minutes?: number | null
          created_at?: string
          end_time?: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_fine_amount?: number
          late_fine_type?: string
          location_mode?: Database["public"]["Enums"]["location_mode"]
          name?: string
          start_time?: string
          tenant_id?: string
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          content: Json
          id: string
          key: string
          scope: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: Json
          id?: string
          key: string
          scope: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: Json
          id?: string
          key?: string
          scope?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      staff_remarks: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          remark: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          remark: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          remark?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_remarks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_remarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_shifts: {
        Row: {
          branch_id: string | null
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          shift_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
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
            foreignKeyName: "staff_shifts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "staff_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_attendance: {
        Row: {
          attendance_date: string
          class_id: string
          created_at: string
          id: string
          marked_by: string | null
          note: string | null
          status: Database["public"]["Enums"]["student_attendance_status"]
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          class_id: string
          created_at?: string
          id?: string
          marked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["student_attendance_status"]
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          class_id?: string
          created_at?: string
          id?: string
          marked_by?: string | null
          note?: string | null
          status?: Database["public"]["Enums"]["student_attendance_status"]
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          branch_id: string | null
          class_id: string
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          parent_phone: string | null
          roll_no: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          class_id: string
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean
          parent_phone?: string | null
          roll_no?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          class_id?: string
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          parent_phone?: string | null
          roll_no?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
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
          maintenance_due_at: string | null
          plan_id: string
          razorpay_payment_id: string | null
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
          maintenance_due_at?: string | null
          plan_id: string
          razorpay_payment_id?: string | null
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
          maintenance_due_at?: string | null
          plan_id?: string
          razorpay_payment_id?: string | null
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
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans_with_label"
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
          id_card_accent: string | null
          id_card_template: string
          is_active: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          slug: string
          tenant_type: Database["public"]["Enums"]["tenant_type"]
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_limit?: number
          id?: string
          id_card_accent?: string | null
          id_card_template?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          slug: string
          tenant_type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          employee_limit?: number
          id?: string
          id_card_accent?: string | null
          id_card_template?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          slug?: string
          tenant_type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
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
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey_profiles"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      plans_with_label: {
        Row: {
          billing: Database["public"]["Enums"]["plan_billing"] | null
          billing_label: string | null
          billing_period_months: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          employee_limit: number | null
          features: Json | null
          id: string | null
          is_active: boolean | null
          name: string | null
          price_inr: number | null
          updated_at: string | null
        }
        Insert: {
          billing?: Database["public"]["Enums"]["plan_billing"] | null
          billing_label?: never
          billing_period_months?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          employee_limit?: number | null
          features?: Json | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price_inr?: number | null
          updated_at?: string | null
        }
        Update: {
          billing?: Database["public"]["Enums"]["plan_billing"] | null
          billing_label?: never
          billing_period_months?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          employee_limit?: number | null
          features?: Json | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          price_inr?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cron_birthday_anniversary_wishes: { Args: never; Returns: number }
      cron_notify_expiring_subs: { Args: never; Returns: number }
      cron_notify_irregular_attendance: { Args: never; Returns: number }
      cron_notify_missed_checkins: { Args: never; Returns: number }
      current_tenant_id: { Args: never; Returns: string }
      daily_attendance_trend: {
        Args: { _branch_id?: string; _days?: number; _tenant_id: string }
        Returns: {
          absent_count: number
          attendance_date: string
          present_count: number
          total_staff: number
        }[]
      }
      expire_overdue_subscriptions: { Args: never; Returns: number }
      get_active_promotion: {
        Args: never
        Returns: {
          banner_text: string
          claimed_count: number
          cta_text: string
          ends_at: string
          highlight_plan_id: string
          id: string
          is_exhausted: boolean
          is_expired: boolean
          max_claims: number
          remaining: number
          slug: string
          starts_at: string
          title: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_permission: {
        Args: { _perm: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_branch_manager: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_active: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      ist_today: { Args: never; Returns: string }
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: number }
      my_attendance_stats: {
        Args: { _user_id: string }
        Returns: {
          current_streak: number
          hours_this_month: number
          present_days_this_month: number
          punctuality_pct: number
          total_working_days_this_month: number
        }[]
      }
      notify: {
        Args: {
          _action_url?: string
          _body: string
          _kind: Database["public"]["Enums"]["notification_kind"]
          _ref_id?: string
          _ref_table?: string
          _tenant_id: string
          _title: string
          _user_id: string
        }
        Returns: string
      }
      plan_billing_label: {
        Args: { _billing: string; _months: number }
        Returns: string
      }
      staff_attendance_summary: {
        Args: { _branch_id?: string; _days?: number; _tenant_id: string }
        Returns: {
          attendance_pct: number
          branch_id: string
          branch_name: string
          days_absent: number
          days_on_leave: number
          days_present: number
          days_window: number
          designation: string
          full_name: string
          is_field_staff: boolean
          last_checkin_date: string
          phone: string
          staff_id: string
          staff_user_id: string
        }[]
      }
      tenant_can_write: { Args: { _tenant_id: string }; Returns: boolean }
      tenant_maintenance_info: {
        Args: { _tenant_id: string }
        Returns: {
          days_until_lockout: number
          is_overdue: boolean
          maintenance_due_at: string
          maintenance_fee_inr: number
        }[]
      }
      tenant_maintenance_overdue: {
        Args: { _tenant_id: string }
        Returns: boolean
      }
      tenant_punctuality_leaderboard: {
        Args: { _limit?: number; _tenant_id: string }
        Returns: {
          avatar_url: string
          checkin_count: number
          full_name: string
          on_time_count: number
          present_days: number
          punctuality_pct: number
          staff_id: string
          user_id: string
        }[]
      }
      tenant_staff_count: { Args: { _tenant_id: string }; Returns: number }
      tenant_subscription_state: {
        Args: { _tenant_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "super_admin" | "client_admin" | "staff" | "branch_manager"
      attendance_kind: "check_in" | "check_out" | "break_out" | "break_in"
      enforcement_status: "inside" | "outside_allowed" | "outside_blocked"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      location_mode: "office_only" | "field" | "hybrid"
      notification_kind:
        | "check_in_missed"
        | "leave_approved"
        | "leave_rejected"
        | "leave_pending_admin"
        | "payslip_ready"
        | "salary_paid"
        | "bank_change_approved"
        | "bank_change_rejected"
        | "subscription_expiring"
        | "irregular_attendance"
        | "announcement"
        | "birthday"
        | "work_anniversary"
        | "shift_swap_requested"
        | "shift_swap_approved"
        | "shift_swap_rejected"
      payment_status: "pending" | "success" | "failed" | "refunded"
      plan_billing: "monthly" | "yearly" | "lifetime"
      student_attendance_status: "present" | "absent" | "late"
      subscription_status:
        | "trial"
        | "active"
        | "suspended"
        | "cancelled"
        | "expired"
      tenant_type: "business" | "school"
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
      app_role: ["super_admin", "client_admin", "staff", "branch_manager"],
      attendance_kind: ["check_in", "check_out", "break_out", "break_in"],
      enforcement_status: ["inside", "outside_allowed", "outside_blocked"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      location_mode: ["office_only", "field", "hybrid"],
      notification_kind: [
        "check_in_missed",
        "leave_approved",
        "leave_rejected",
        "leave_pending_admin",
        "payslip_ready",
        "salary_paid",
        "bank_change_approved",
        "bank_change_rejected",
        "subscription_expiring",
        "irregular_attendance",
        "announcement",
        "birthday",
        "work_anniversary",
        "shift_swap_requested",
        "shift_swap_approved",
        "shift_swap_rejected",
      ],
      payment_status: ["pending", "success", "failed", "refunded"],
      plan_billing: ["monthly", "yearly", "lifetime"],
      student_attendance_status: ["present", "absent", "late"],
      subscription_status: [
        "trial",
        "active",
        "suspended",
        "cancelled",
        "expired",
      ],
      tenant_type: ["business", "school"],
    },
  },
} as const
