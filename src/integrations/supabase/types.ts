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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      dossiers: {
        Row: {
          client_email: string | null
          client_nom: string | null
          client_token: string
          created_at: string
          id: string
          nom: string
          pennylane_company_id: string | null
        }
        Insert: {
          client_email?: string | null
          client_nom?: string | null
          client_token?: string
          created_at?: string
          id?: string
          nom: string
          pennylane_company_id?: string | null
        }
        Update: {
          client_email?: string | null
          client_nom?: string | null
          client_token?: string
          created_at?: string
          id?: string
          nom?: string
          pennylane_company_id?: string | null
        }
        Relationships: []
      }
      factures: {
        Row: {
          created_at: string
          date: string
          dossier_id: string
          fournisseur: string
          id: string
          libelle_ecriture: string
          libelle_generique: string
          numero: string
          pennylane_invoice_id: string | null
          pennylane_reponse: string | null
          regle_appliquee: string | null
          statut: string
          total_ht: number
          total_ttc: number
          total_tva: number
          valide_le: string | null
          valide_par: string | null
        }
        Insert: {
          created_at?: string
          date: string
          dossier_id: string
          fournisseur: string
          id?: string
          libelle_ecriture: string
          libelle_generique: string
          numero: string
          pennylane_invoice_id?: string | null
          pennylane_reponse?: string | null
          regle_appliquee?: string | null
          statut?: string
          total_ht: number
          total_ttc: number
          total_tva: number
          valide_le?: string | null
          valide_par?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          dossier_id?: string
          fournisseur?: string
          id?: string
          libelle_ecriture?: string
          libelle_generique?: string
          numero?: string
          pennylane_invoice_id?: string | null
          pennylane_reponse?: string | null
          regle_appliquee?: string | null
          statut?: string
          total_ht?: number
          total_ttc?: number
          total_tva?: number
          valide_le?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factures_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      journal: {
        Row: {
          auteur: string
          created_at: string
          dossier_id: string
          id: string
          message: string
        }
        Insert: {
          auteur: string
          created_at?: string
          dossier_id: string
          id?: string
          message: string
        }
        Update: {
          auteur?: string
          created_at?: string
          dossier_id?: string
          id?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
      lignes: {
        Row: {
          compte: string
          compte_libelle: string
          facture_id: string
          ht: number
          id: string
          libelle: string
          nature: string | null
          periode_mois: number | null
          position: number
          taux_tva: number
        }
        Insert: {
          compte: string
          compte_libelle?: string
          facture_id: string
          ht: number
          id?: string
          libelle: string
          nature?: string | null
          periode_mois?: number | null
          position?: number
          taux_tva?: number
        }
        Update: {
          compte?: string
          compte_libelle?: string
          facture_id?: string
          ht?: number
          id?: string
          libelle?: string
          nature?: string | null
          periode_mois?: number | null
          position?: number
          taux_tva?: number
        }
        Relationships: [
          {
            foreignKeyName: "lignes_facture_id_fkey"
            columns: ["facture_id"]
            isOneToOne: false
            referencedRelation: "factures"
            referencedColumns: ["id"]
          },
        ]
      }
      pieces_manquantes: {
        Row: {
          action: string
          commentaire_client: string | null
          date: string
          dossier_id: string
          fichier_path: string | null
          id: string
          libelle: string
          montant: number
          recu_le: string | null
          statut: string
        }
        Insert: {
          action: string
          commentaire_client?: string | null
          date: string
          dossier_id: string
          fichier_path?: string | null
          id?: string
          libelle: string
          montant: number
          recu_le?: string | null
          statut?: string
        }
        Update: {
          action?: string
          commentaire_client?: string | null
          date?: string
          dossier_id?: string
          fichier_path?: string | null
          id?: string
          libelle?: string
          montant?: number
          recu_le?: string | null
          statut?: string
        }
        Relationships: [
          {
            foreignKeyName: "pieces_manquantes_dossier_id_fkey"
            columns: ["dossier_id"]
            isOneToOne: false
            referencedRelation: "dossiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
