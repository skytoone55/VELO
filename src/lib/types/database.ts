export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse_livraison_cp: string | null
          adresse_livraison_ligne1: string | null
          adresse_livraison_ligne2: string | null
          adresse_livraison_ville: string | null
          adresse_societe_cp: string
          adresse_societe_ligne1: string
          adresse_societe_ligne2: string | null
          adresse_societe_ville: string
          code_ape: string | null
          code_enemat_bloque: boolean | null
          code_enemat_saisi: string | null
          code_enemat_tentatives: number | null
          code_enemat_valide: boolean | null
          code_validation_hash: string | null
          code_validation_envoye_at: string | null
          commercial_assigne: string | null
          contact_fonction: string | null
          contact_nom: string | null
          contact_prenom: string | null
          created_at: string
          date_envoi_formulaire: string | null
          date_signature_devis: string | null
          date_statut: string | null
          date_validation_code: string | null
          date_visite_prealable: string | null
          departement: string
          depot_logistique_id: string | null
          depot_retrait_id: string | null
          devis_pdf_url: string | null
          agence: string | null
          email: string
          email_beneficiaire: string | null
          equipe_ids: string | null
          fnuci_ids: Json | null
          format_juridique: string | null
          id: string
          latitude: number | null
          longitude: number | null
          monday_board_id: string | null
          monday_item_id: number | null
          monday_sync_status: string | null
          monday_synced_at: string | null
          nb_salaries: number | null
          nom_contact: string | null
          notes_internes: string | null
          numero_devis: string | null
          numero_facture: string | null
          prenom_contact: string | null
          raison_sociale: string
          reference_dossier: string | null
          siret: string
          statut_anomalie: string | null
          statut_commercial: string | null
          statut_doublon: string | null
          statut_formulaire: string | null
          statut_mail: string | null
          statut_make: string | null
          statut_retina: string | null
          telephone: string | null
          token_formulaire: string | null
          updated_at: string
          validation_naf: string | null
          velo_devis: number
          velo_valide: number | null
          preferences_livraison: string | null
          type_de_zone: string | null
          reference_retina: string | null
          token_documents: string | null
          documents_requis: Json | null
          documents_recus: Json | null
          token_relance: string | null
        }
        Insert: {
          adresse_livraison_cp?: string | null
          adresse_livraison_ligne1?: string | null
          adresse_livraison_ligne2?: string | null
          adresse_livraison_ville?: string | null
          adresse_societe_cp: string
          adresse_societe_ligne1: string
          adresse_societe_ligne2?: string | null
          adresse_societe_ville: string
          code_ape?: string | null
          code_enemat_bloque?: boolean | null
          code_enemat_saisi?: string | null
          code_enemat_tentatives?: number | null
          code_enemat_valide?: boolean | null
          code_validation_hash?: string | null
          code_validation_envoye_at?: string | null
          commercial_assigne?: string | null
          contact_fonction?: string | null
          contact_nom?: string | null
          contact_prenom?: string | null
          created_at?: string
          date_envoi_formulaire?: string | null
          date_signature_devis?: string | null
          date_statut?: string | null
          date_validation_code?: string | null
          date_visite_prealable?: string | null
          departement: string
          depot_logistique_id?: string | null
          depot_retrait_id?: string | null
          devis_pdf_url?: string | null
          agence?: string | null
          email: string
          email_beneficiaire?: string | null
          equipe_ids?: string | null
          fnuci_ids?: Json | null
          format_juridique?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          monday_board_id?: string | null
          monday_item_id?: number | null
          monday_sync_status?: string | null
          monday_synced_at?: string | null
          nb_salaries?: number | null
          nom_contact?: string | null
          notes_internes?: string | null
          numero_devis?: string | null
          numero_facture?: string | null
          prenom_contact?: string | null
          raison_sociale: string
          reference_dossier?: string | null
          siret: string
          statut_anomalie?: string | null
          statut_commercial?: string | null
          statut_doublon?: string | null
          statut_formulaire?: string | null
          statut_mail?: string | null
          statut_make?: string | null
          statut_retina?: string | null
          telephone?: string | null
          token_formulaire?: string | null
          updated_at?: string
          validation_naf?: string | null
          velo_devis?: number
          velo_valide?: number | null
          preferences_livraison?: string | null
          type_de_zone?: string | null
          reference_retina?: string | null
          token_documents?: string | null
          documents_requis?: Json | null
          documents_recus?: Json | null
          token_relance?: string | null
        }
        Update: {
          adresse_livraison_cp?: string | null
          adresse_livraison_ligne1?: string | null
          adresse_livraison_ligne2?: string | null
          adresse_livraison_ville?: string | null
          adresse_societe_cp?: string
          adresse_societe_ligne1?: string
          adresse_societe_ligne2?: string | null
          adresse_societe_ville?: string
          code_ape?: string | null
          code_enemat_bloque?: boolean | null
          code_enemat_saisi?: string | null
          code_enemat_tentatives?: number | null
          code_enemat_valide?: boolean | null
          code_validation_hash?: string | null
          code_validation_envoye_at?: string | null
          commercial_assigne?: string | null
          contact_fonction?: string | null
          contact_nom?: string | null
          contact_prenom?: string | null
          created_at?: string
          date_envoi_formulaire?: string | null
          date_signature_devis?: string | null
          date_statut?: string | null
          date_validation_code?: string | null
          date_visite_prealable?: string | null
          departement?: string
          depot_logistique_id?: string | null
          depot_retrait_id?: string | null
          devis_pdf_url?: string | null
          agence?: string | null
          email?: string
          email_beneficiaire?: string | null
          equipe_ids?: string | null
          fnuci_ids?: Json | null
          format_juridique?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          monday_board_id?: string | null
          monday_item_id?: number | null
          monday_sync_status?: string | null
          monday_synced_at?: string | null
          nb_salaries?: number | null
          nom_contact?: string | null
          notes_internes?: string | null
          numero_devis?: string | null
          numero_facture?: string | null
          prenom_contact?: string | null
          raison_sociale?: string
          reference_dossier?: string | null
          siret?: string
          statut_anomalie?: string | null
          statut_commercial?: string | null
          statut_doublon?: string | null
          statut_formulaire?: string | null
          statut_mail?: string | null
          statut_make?: string | null
          statut_retina?: string | null
          telephone?: string | null
          token_formulaire?: string | null
          updated_at?: string
          validation_naf?: string | null
          velo_devis?: number
          velo_valide?: number | null
          preferences_livraison?: string | null
          type_de_zone?: string | null
          reference_retina?: string | null
          token_documents?: string | null
          documents_requis?: Json | null
          documents_recus?: Json | null
          token_relance?: string | null
        }
        Relationships: []
      }
      clients_hors_zone: {
        Row: {
          client_id: string | null
          created_at: string | null
          date_resolution: string | null
          depot_plus_proche_id: string | null
          distance_depot_plus_proche_km: number | null
          id: string
          resolu_par: string | null
          statut: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date_resolution?: string | null
          depot_plus_proche_id?: string | null
          distance_depot_plus_proche_km?: number | null
          id?: string
          resolu_par?: string | null
          statut?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date_resolution?: string | null
          depot_plus_proche_id?: string | null
          distance_depot_plus_proche_km?: number | null
          id?: string
          resolu_par?: string | null
          statut?: string | null
        }
        Relationships: []
      }
      depots: {
        Row: {
          actif: boolean | null
          adresse: string
          agence: string
          code_postal: string
          created_at: string | null
          departement: string
          email: string | null
          id: string
          latitude: number
          longitude: number
          nom: string
          prix_livraison_payante: number | null
          rayon_couverture_km: number
          rayon_livraison_payant_km: number | null
          telephone: string | null
          type: string
          updated_at: string | null
          ville: string
          jours_ouverture: string[] | null
          capacite_velos_jour: number | null
          creneau_duree_minutes: number | null
          creneaux: Json | null
        }
        Insert: {
          actif?: boolean | null
          adresse: string
          agence: string
          code_postal: string
          created_at?: string | null
          departement?: string
          email?: string | null
          id?: string
          latitude: number
          longitude: number
          nom: string
          prix_livraison_payante?: number | null
          rayon_couverture_km?: number
          rayon_livraison_payant_km?: number | null
          telephone?: string | null
          type?: string
          updated_at?: string | null
          ville: string
          jours_ouverture?: string[] | null
          capacite_velos_jour?: number | null
          creneau_duree_minutes?: number | null
          creneaux?: Json | null
        }
        Update: {
          actif?: boolean | null
          adresse?: string
          agence?: string
          code_postal?: string
          created_at?: string | null
          departement?: string
          email?: string | null
          id?: string
          latitude?: number
          longitude?: number
          nom?: string
          prix_livraison_payante?: number | null
          rayon_couverture_km?: number
          rayon_livraison_payant_km?: number | null
          telephone?: string | null
          type?: string
          updated_at?: string | null
          ville?: string
          jours_ouverture?: string[] | null
          capacite_velos_jour?: number | null
          creneau_duree_minutes?: number | null
          creneaux?: Json | null
        }
        Relationships: []
      }
      distances_cache: {
        Row: {
          calculated_at: string | null
          client_id: string | null
          depot_id: string | null
          distance_km: number
          id: string
        }
        Insert: {
          calculated_at?: string | null
          client_id?: string | null
          depot_id?: string | null
          distance_km: number
          id?: string
        }
        Update: {
          calculated_at?: string | null
          client_id?: string | null
          depot_id?: string | null
          distance_km?: number
          id?: string
        }
        Relationships: []
      }
      email_alerts: {
        Row: {
          client_id: string | null
          created_at: string | null
          date_envoi: string | null
          details: Json | null
          envoye: boolean | null
          id: string
          message: string
          type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          date_envoi?: string | null
          details?: Json | null
          envoye?: boolean | null
          id?: string
          message: string
          type: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          date_envoi?: string | null
          details?: Json | null
          envoye?: boolean | null
          id?: string
          message?: string
          type?: string
        }
        Relationships: []
      }
      formulaires_log: {
        Row: {
          client_id: string | null
          created_at: string | null
          donnees_saisies: Json | null
          etape_nom: string
          etape_numero: number
          id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          donnees_saisies?: Json | null
          etape_nom: string
          etape_numero: number
          id?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          donnees_saisies?: Json | null
          etape_nom?: string
          etape_numero?: number
          id?: string
        }
        Relationships: []
      }
      livraisons: {
        Row: {
          adresse_livraison_cp: string | null
          adresse_livraison_ligne1: string | null
          adresse_livraison_ligne2: string | null
          adresse_livraison_ville: string | null
          assignation_manuelle: boolean | null
          client_id: string | null
          code_enemat_saisi: string | null
          code_enemat_valide: boolean | null
          complement_adresse: string | null
          created_at: string
          creneau_debut: string | null
          creneau_fin: string | null
          date_livraison: string | null
          date_livraison_effective: string | null
          date_programmation: string | null
          date_validation_code: string | null
          depot_id: string | null
          document_identite_nom_fichier: string | null
          document_identite_type: string | null
          document_identite_url: string | null
          id: string
          livreur_id: string | null
          mode_livraison: string
          notes_admin: string | null
          notes_internes: string | null
          photos_livraison: Json | null
          raison_annulation: string | null
          signature_client: string | null
          statut: string | null
          updated_at: string
          token_livraison: string | null
          creneau_date: string | null
          creneau_heure_debut: string | null
          creneau_heure_fin: string | null
          nb_velos_livres: number | null
          tournee_id: string | null
          confirmation_statut: string | null
          confirmation_commentaire: string | null
          confirmation_date: string | null
        }
        Insert: {
          adresse_livraison_cp?: string | null
          adresse_livraison_ligne1?: string | null
          adresse_livraison_ligne2?: string | null
          adresse_livraison_ville?: string | null
          assignation_manuelle?: boolean | null
          client_id?: string | null
          code_enemat_saisi?: string | null
          code_enemat_valide?: boolean | null
          complement_adresse?: string | null
          created_at?: string
          creneau_debut?: string | null
          creneau_fin?: string | null
          date_livraison?: string | null
          date_livraison_effective?: string | null
          date_programmation?: string | null
          date_validation_code?: string | null
          depot_id?: string | null
          document_identite_nom_fichier?: string | null
          document_identite_type?: string | null
          document_identite_url?: string | null
          id?: string
          livreur_id?: string | null
          mode_livraison: string
          notes_admin?: string | null
          notes_internes?: string | null
          photos_livraison?: Json | null
          raison_annulation?: string | null
          signature_client?: string | null
          statut?: string | null
          updated_at?: string
          token_livraison?: string | null
          creneau_date?: string | null
          creneau_heure_debut?: string | null
          creneau_heure_fin?: string | null
          nb_velos_livres?: number | null
          tournee_id?: string | null
          confirmation_statut?: string | null
          confirmation_commentaire?: string | null
          confirmation_date?: string | null
        }
        Update: {
          adresse_livraison_cp?: string | null
          adresse_livraison_ligne1?: string | null
          adresse_livraison_ligne2?: string | null
          adresse_livraison_ville?: string | null
          assignation_manuelle?: boolean | null
          client_id?: string | null
          code_enemat_saisi?: string | null
          code_enemat_valide?: boolean | null
          complement_adresse?: string | null
          created_at?: string
          creneau_debut?: string | null
          creneau_fin?: string | null
          date_livraison?: string | null
          date_livraison_effective?: string | null
          date_programmation?: string | null
          date_validation_code?: string | null
          depot_id?: string | null
          document_identite_nom_fichier?: string | null
          document_identite_type?: string | null
          document_identite_url?: string | null
          id?: string
          livreur_id?: string | null
          mode_livraison?: string
          notes_admin?: string | null
          notes_internes?: string | null
          photos_livraison?: Json | null
          raison_annulation?: string | null
          signature_client?: string | null
          statut?: string | null
          updated_at?: string
          token_livraison?: string | null
          creneau_date?: string | null
          creneau_heure_debut?: string | null
          creneau_heure_fin?: string | null
          nb_velos_livres?: number | null
          tournee_id?: string | null
          confirmation_statut?: string | null
          confirmation_commentaire?: string | null
          confirmation_date?: string | null
        }
        Relationships: []
      }
      tournees: {
        Row: {
          id: string
          date: string
          livreur_id: string | null
          depot_id: string | null
          creneau_debut: string | null
          creneau_fin: string | null
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          livreur_id?: string | null
          depot_id?: string | null
          creneau_debut?: string | null
          creneau_fin?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          date?: string
          livreur_id?: string | null
          depot_id?: string | null
          creneau_debut?: string | null
          creneau_fin?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournees_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "users_profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournees_depot_id_fkey"
            columns: ["depot_id"]
            isOneToOne: false
            referencedRelation: "depots"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_monday_log: {
        Row: {
          action: string
          client_id: string | null
          created_at: string | null
          direction: string
          donnees_apres: Json | null
          donnees_avant: Json | null
          id: string
          message_erreur: string | null
          monday_item_id: number | null
          statut: string
        }
        Insert: {
          action: string
          client_id?: string | null
          created_at?: string | null
          direction: string
          donnees_apres?: Json | null
          donnees_avant?: Json | null
          id?: string
          message_erreur?: string | null
          monday_item_id?: number | null
          statut: string
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string | null
          direction?: string
          donnees_apres?: Json | null
          donnees_avant?: Json | null
          id?: string
          message_erreur?: string | null
          monday_item_id?: number | null
          statut?: string
        }
        Relationships: []
      }
      user_societes: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      users_profile: {
        Row: {
          actif: boolean | null
          created_at: string | null
          departement: string | null
          depot_id: string | null
          depot_ids: string[] | null
          email: string
          id: string
          is_super_admin: boolean
          nom: string | null
          preferences: Json | null
          prenom: string | null
          role: string
          telephone: string | null
          territoire: string | null
          updated_at: string | null
        }
        Insert: {
          actif?: boolean | null
          created_at?: string | null
          departement?: string | null
          depot_id?: string | null
          depot_ids?: string[] | null
          email: string
          id: string
          is_super_admin?: boolean
          nom?: string | null
          preferences?: Json | null
          prenom?: string | null
          role: string
          telephone?: string | null
          territoire?: string | null
          updated_at?: string | null
        }
        Update: {
          actif?: boolean | null
          created_at?: string | null
          departement?: string | null
          depot_id?: string | null
          depot_ids?: string[] | null
          email?: string
          id?: string
          is_super_admin?: boolean
          nom?: string | null
          preferences?: Json | null
          prenom?: string | null
          role?: string
          telephone?: string | null
          territoire?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      workflow_transitions: {
        Row: {
          created_at: string | null
          effectue_par: string | null
          entity_id: string
          entity_type: string
          id: string
          raison: string | null
          statut_apres: string
          statut_avant: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          effectue_par?: string | null
          entity_id: string
          entity_type: string
          id?: string
          raison?: string | null
          statut_apres: string
          statut_avant?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          effectue_par?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          raison?: string | null
          statut_apres?: string
          statut_avant?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      naf_codes: {
        Row: {
          id: number
          code: string
          label: string
          validation: string
          created_at: string
        }
        Insert: {
          id?: number
          code: string
          label: string
          validation?: string
          created_at?: string
        }
        Update: {
          id?: number
          code?: string
          label?: string
          validation?: string
          created_at?: string
        }
        Relationships: []
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

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Convenient type aliases
export type Client = Tables<'clients'>
export type ClientInsert = TablesInsert<'clients'>
export type ClientUpdate = TablesUpdate<'clients'>

export type UsersProfile = Tables<'users_profile'>
export type UsersProfileInsert = TablesInsert<'users_profile'>
export type UsersProfileUpdate = TablesUpdate<'users_profile'>

export type Depot = Tables<'depots'>
export type DepotInsert = TablesInsert<'depots'>
export type DepotUpdate = TablesUpdate<'depots'>

export type Livraison = Tables<'livraisons'>
export type LivraisonInsert = TablesInsert<'livraisons'>
export type LivraisonUpdate = TablesUpdate<'livraisons'>

export type Tournee = Tables<'tournees'>
export type TourneeInsert = TablesInsert<'tournees'>
export type TourneeUpdate = TablesUpdate<'tournees'>

export type ConfirmationStatut = 'en_attente' | 'confirmee' | 'refusee'

export type UserSociete = Tables<'user_societes'>
export type EmailAlert = Tables<'email_alerts'>
export type AuditLog = Tables<'audit_log'>
export type WorkflowTransition = Tables<'workflow_transitions'>
export type SyncMondayLog = Tables<'sync_monday_log'>
export type FormulairesLog = Tables<'formulaires_log'>
export type DistancesCache = Tables<'distances_cache'>
export type ClientHorsZone = Tables<'clients_hors_zone'>

// Role types
export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'agent_secteur'
  | 'livreur'
  | 'client'

// Agence types (zones opérationnelles ECO-VOLT)
export type Agence = 'reunion' | 'martinique' | 'guadeloupe' | 'guyane' | 'france_metro'

// Departement types (codes INSEE des départements)
export type Departement = '974' | '972' | '971' | '973' | string

// Statut formulaire
export type StatutFormulaire =
  | 'en_attente'
  | 'formulaire_envoye'
  | 'formulaire_complete'
  | 'formulaire_bloque'
  | 'valide'

// Statut commercial — 10 statuts process (parcours client)
export type ProcessStatut =
  | 'controle_valide'
  | 'formulaire_envoye'
  | 'formulaire_valide'
  | 'a_livrer'
  | 'en_livraison'
  | 'livre'
  | 'probleme_livraison'
  | 'a_relivrer'
  | 'retractation'
  | 'anomalie'

// Statut commercial — inclut process + legacy Monday (backward compat DB)
export type StatutCommercial =
  | ProcessStatut
  | 'dossier_complet'
  | 'devis_signe'
  | 'client_hs'
  | 'devis_cree'
  | 'inconnu'
  | 'client_injoignable'
  | 'doublon'
  | 'controle_a_regulariser'
  | 'ah_signee'
  | 'paye'
  | 'controle_a_jour'
  | 'client_contacte'
  | 'franck'

// Statut livraison
export type StatutLivraison =
  | 'en_attente'
  | 'programmee'
  | 'en_cours'
  | 'annulee'
  | 'livree'

// Mode livraison
export type ModeLivraison = 'domicile' | 'point_relais'

// Type depot
export type TypeDepot = 'retrait' | 'logistique'
