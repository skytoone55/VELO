-- ============================================
-- INITIALISATION BASE PPE ÉNERGIE
-- Structure identique à ECO-VOLT
-- ============================================

-- Extensions nécessaires
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLES
-- ============================================

-- Users Profile (DOIT être créé en premier car is_admin() en dépend)
CREATE TABLE IF NOT EXISTS public.users_profile (
  id UUID NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  nom VARCHAR(100),
  prenom VARCHAR(100),
  telephone VARCHAR(20),
  role VARCHAR(30) NOT NULL,
  territoire VARCHAR(10),
  depot_id UUID,
  actif BOOLEAN DEFAULT true,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_profile_email_key ON public.users_profile (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users_profile (role);
CREATE INDEX IF NOT EXISTS idx_users_territoire ON public.users_profile (territoire);
CREATE INDEX IF NOT EXISTS idx_users_depot ON public.users_profile (depot_id);

-- ============================================
-- FONCTION HELPER (après users_profile)
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM users_profile
    WHERE id = auth.uid()
    AND role IN ('admin_general', 'admin_regional', 'agent_regional', 'agent_depot', 'livreur')
    AND actif = true
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Depots
CREATE TABLE IF NOT EXISTS public.depots (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  type VARCHAR(20) DEFAULT 'retrait' NOT NULL,
  nom VARCHAR(100) NOT NULL,
  adresse VARCHAR(255) NOT NULL,
  code_postal VARCHAR(10) NOT NULL,
  ville VARCHAR(100) NOT NULL,
  agence VARCHAR(50) NOT NULL,
  telephone VARCHAR(20),
  email VARCHAR(255),
  latitude NUMERIC NOT NULL,
  longitude NUMERIC NOT NULL,
  rayon_couverture_km INTEGER DEFAULT 20 NOT NULL,
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  rayon_livraison_payant_km NUMERIC DEFAULT 0,
  prix_livraison_payante NUMERIC DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS depots_nom_unique ON public.depots (nom);
CREATE INDEX IF NOT EXISTS idx_depots_actif ON public.depots (actif);
CREATE INDEX IF NOT EXISTS idx_depots_agence ON public.depots (agence);
CREATE INDEX IF NOT EXISTS idx_depots_type ON public.depots (type);

-- Clients
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  monday_item_id BIGINT,
  siret TEXT,
  raison_sociale VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telephone VARCHAR(20),
  code_ape VARCHAR(10),
  format_juridique VARCHAR(100),
  nb_salaries INTEGER,
  contact_nom VARCHAR(100),
  contact_prenom VARCHAR(100),
  contact_fonction VARCHAR(100),
  adresse_societe_ligne1 VARCHAR(255) NOT NULL,
  adresse_societe_ligne2 VARCHAR(255),
  adresse_societe_cp VARCHAR(10) NOT NULL,
  adresse_societe_ville VARCHAR(100) NOT NULL,
  departement VARCHAR(3) NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  velo_devis INTEGER DEFAULT 1 NOT NULL,
  velo_valide INTEGER,
  commercial_assigne VARCHAR(100),
  date_signature_devis DATE,
  numero_facture VARCHAR(50),
  reference_dossier VARCHAR(50),
  date_visite_prealable DATE,
  notes_internes TEXT,
  fnuci_ids JSONB,
  statut_commercial VARCHAR(50),
  statut_formulaire VARCHAR(50) DEFAULT 'en_attente',
  code_enemat_valide BOOLEAN DEFAULT false,
  code_enemat_tentatives INTEGER DEFAULT 0,
  code_enemat_bloque BOOLEAN DEFAULT false,
  date_validation_code TIMESTAMP,
  monday_sync_status VARCHAR(20) DEFAULT 'synced',
  monday_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  token_formulaire TEXT,
  date_envoi_formulaire TIMESTAMPTZ,
  prenom_contact TEXT,
  nom_contact TEXT,
  adresse_livraison_ligne1 TEXT,
  adresse_livraison_ligne2 TEXT,
  adresse_livraison_cp TEXT,
  adresse_livraison_ville TEXT,
  depot_retrait_id UUID,
  depot_logistique_id UUID,
  agence TEXT,
  code_validation_hash TEXT,
  code_validation_envoye_at TIMESTAMPTZ,
  code_enemat_saisi TEXT,
  email_beneficiaire TEXT,
  numero_devis TEXT,
  devis_pdf_url TEXT,
  date_statut TIMESTAMPTZ,
  statut_retina TEXT,
  statut_mail TEXT,
  statut_anomalie TEXT,
  statut_make TEXT,
  statut_doublon TEXT,
  equipe_ids TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS clients_monday_item_id_key ON public.clients (monday_item_id);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_siret ON public.clients (siret);
CREATE INDEX IF NOT EXISTS idx_clients_departement ON public.clients (departement);
CREATE INDEX IF NOT EXISTS idx_clients_agence ON public.clients (agence);
CREATE INDEX IF NOT EXISTS idx_clients_statut_commercial ON public.clients (statut_commercial);
CREATE INDEX IF NOT EXISTS idx_clients_statut_formulaire ON public.clients (statut_formulaire);
CREATE INDEX IF NOT EXISTS idx_clients_monday ON public.clients (monday_item_id);
CREATE INDEX IF NOT EXISTS idx_clients_depot_retrait_id ON public.clients (depot_retrait_id);
CREATE INDEX IF NOT EXISTS idx_clients_depot_logistique_id ON public.clients (depot_logistique_id);
CREATE INDEX IF NOT EXISTS idx_clients_reference_dossier ON public.clients (reference_dossier);
CREATE INDEX IF NOT EXISTS idx_clients_numero_devis ON public.clients (numero_devis);

-- Livraisons
CREATE TABLE IF NOT EXISTS public.livraisons (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  client_id UUID,
  mode_livraison VARCHAR(20) NOT NULL,
  adresse_livraison_ligne1 VARCHAR(255),
  adresse_livraison_ligne2 VARCHAR(255),
  adresse_livraison_cp VARCHAR(10),
  adresse_livraison_ville VARCHAR(100),
  complement_adresse TEXT,
  depot_id UUID,
  assignation_manuelle BOOLEAN DEFAULT false,
  document_identite_url TEXT,
  document_identite_nom_fichier VARCHAR(255),
  document_identite_type VARCHAR(10),
  code_enemat_saisi VARCHAR(50),
  code_enemat_valide BOOLEAN DEFAULT false,
  date_validation_code TIMESTAMP,
  statut VARCHAR(50) DEFAULT 'en_attente',
  date_programmation TIMESTAMP,
  raison_annulation TEXT,
  date_livraison_effective TIMESTAMP,
  photos_livraison JSONB,
  signature_client TEXT,
  notes_admin TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  livreur_id UUID,
  creneau_debut TIME,
  creneau_fin TIME,
  date_livraison TIMESTAMPTZ,
  notes_internes TEXT
);
CREATE INDEX IF NOT EXISTS idx_livraisons_client ON public.livraisons (client_id);
CREATE INDEX IF NOT EXISTS idx_livraisons_depot ON public.livraisons (depot_id);
CREATE INDEX IF NOT EXISTS idx_livraisons_statut ON public.livraisons (statut);
CREATE INDEX IF NOT EXISTS idx_livraisons_mode ON public.livraisons (mode_livraison);

-- Codes ENEMAT
CREATE TABLE IF NOT EXISTS public.codes_enemat (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  utilise BOOLEAN DEFAULT false,
  client_id UUID,
  date_utilisation TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS codes_enemat_code_key ON public.codes_enemat (code);
CREATE INDEX IF NOT EXISTS idx_codes_enemat_code ON public.codes_enemat (code);

-- User Societes (liaison users <-> clients)
CREATE TABLE IF NOT EXISTS public.user_societes (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id UUID,
  client_id UUID,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS user_societes_user_id_client_id_key ON public.user_societes (user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_user_societes_user ON public.user_societes (user_id);
CREATE INDEX IF NOT EXISTS idx_user_societes_client ON public.user_societes (client_id);

-- Distances Cache
CREATE TABLE IF NOT EXISTS public.distances_cache (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  client_id UUID,
  depot_id UUID,
  distance_km NUMERIC NOT NULL,
  calculated_at TIMESTAMP DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS distances_cache_client_id_depot_id_key ON public.distances_cache (client_id, depot_id);
CREATE INDEX IF NOT EXISTS idx_distances_client ON public.distances_cache (client_id);
CREATE INDEX IF NOT EXISTS idx_distances_depot ON public.distances_cache (depot_id);

-- Clients Hors Zone
CREATE TABLE IF NOT EXISTS public.clients_hors_zone (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  client_id UUID,
  distance_depot_plus_proche_km NUMERIC,
  depot_plus_proche_id UUID,
  statut VARCHAR(20) DEFAULT 'en_attente',
  resolu_par UUID,
  date_resolution TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_clients_hors_zone_statut ON public.clients_hors_zone (statut);

-- Audit Log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log (created_at DESC);

-- Formulaires Log
CREATE TABLE IF NOT EXISTS public.formulaires_log (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  client_id UUID,
  etape_numero INTEGER NOT NULL,
  etape_nom VARCHAR(50) NOT NULL,
  donnees_saisies JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_formulaires_client ON public.formulaires_log (client_id);

-- Email Alerts
CREATE TABLE IF NOT EXISTS public.email_alerts (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  client_id UUID,
  message TEXT NOT NULL,
  details JSONB,
  envoye BOOLEAN DEFAULT false,
  date_envoi TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  statut VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_alerts_type ON public.email_alerts (type);
CREATE INDEX IF NOT EXISTS idx_email_alerts_envoye ON public.email_alerts (envoye);

-- Monday Field Mapping
CREATE TABLE IF NOT EXISTS public.monday_field_mapping (
  id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  interface_field TEXT NOT NULL,
  interface_label TEXT NOT NULL,
  interface_type TEXT DEFAULT 'text' NOT NULL,
  interface_section TEXT,
  monday_column_id TEXT,
  monday_column_title TEXT,
  monday_column_type TEXT,
  value_mapping JSONB DEFAULT '{}'::jsonb,
  is_required BOOLEAN DEFAULT false,
  is_synced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS monday_field_mapping_interface_field_key ON public.monday_field_mapping (interface_field);
CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_interface ON public.monday_field_mapping (interface_field);
CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_monday ON public.monday_field_mapping (monday_column_id);

-- Sync Monday Log
CREATE TABLE IF NOT EXISTS public.sync_monday_log (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  client_id UUID,
  monday_item_id BIGINT,
  action VARCHAR(50) NOT NULL,
  direction VARCHAR(30) NOT NULL,
  donnees_avant JSONB,
  donnees_apres JSONB,
  statut VARCHAR(20) NOT NULL,
  message_erreur TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_statut ON public.sync_monday_log (statut);
CREATE INDEX IF NOT EXISTS idx_sync_created ON public.sync_monday_log (created_at DESC);

-- Workflow Transitions
CREATE TABLE IF NOT EXISTS public.workflow_transitions (
  id UUID DEFAULT uuid_generate_v4() NOT NULL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL,
  entity_id UUID NOT NULL,
  statut_avant VARCHAR(50),
  statut_apres VARCHAR(50) NOT NULL,
  raison TEXT,
  user_id UUID,
  created_at TIMESTAMP DEFAULT now(),
  effectue_par UUID
);
CREATE INDEX IF NOT EXISTS idx_workflow_entity ON public.workflow_transitions (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_created ON public.workflow_transitions (created_at DESC);

-- ============================================
-- RLS (Row Level Security)
-- ============================================

ALTER TABLE public.users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.depots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.livraisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codes_enemat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_societes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distances_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients_hors_zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formulaires_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monday_field_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_monday_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Users Profile
CREATE POLICY "users_profile_select_own_or_admin" ON public.users_profile FOR SELECT USING ((id = auth.uid()) OR is_admin());
CREATE POLICY "users_profile_insert_own" ON public.users_profile FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "users_profile_update_own" ON public.users_profile FOR UPDATE USING (id = auth.uid());

-- Depots
CREATE POLICY "Admin general total depots" ON public.depots FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'admin_general' AND users_profile.actif = true));
CREATE POLICY "Agent depot voir son depot" ON public.depots FOR SELECT USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'agent_depot' AND users_profile.actif = true AND depots.id = users_profile.depot_id));
CREATE POLICY "Clients voient depots retrait" ON public.depots FOR SELECT USING (type = 'retrait' AND actif = true);

-- Clients
CREATE POLICY "clients_read_authenticated" ON public.clients FOR SELECT USING (true);
CREATE POLICY "clients_insert_authenticated" ON public.clients FOR INSERT WITH CHECK (true);
CREATE POLICY "clients_update_authenticated" ON public.clients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "clients_delete_authenticated" ON public.clients FOR DELETE USING (true);

-- Livraisons
CREATE POLICY "Admin general total livraisons" ON public.livraisons FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'admin_general' AND users_profile.actif = true));
CREATE POLICY "Admin regional livraisons territoire" ON public.livraisons FOR ALL USING (EXISTS (SELECT 1 FROM users_profile up JOIN clients c ON (livraisons.client_id = c.id) WHERE up.id = auth.uid() AND up.role = 'admin_regional' AND up.actif = true AND (c.departement = up.territoire OR up.territoire = 'ALL')));
CREATE POLICY "Agent regional livraisons territoire" ON public.livraisons FOR ALL USING (EXISTS (SELECT 1 FROM users_profile up JOIN clients c ON (livraisons.client_id = c.id) WHERE up.id = auth.uid() AND up.role = 'agent_regional' AND up.actif = true AND c.departement = up.territoire));
CREATE POLICY "Agent depot livraisons son depot" ON public.livraisons FOR SELECT USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'agent_depot' AND users_profile.actif = true AND livraisons.depot_id = users_profile.depot_id));
CREATE POLICY "Agent depot update livraisons" ON public.livraisons FOR UPDATE USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'agent_depot' AND users_profile.actif = true AND livraisons.depot_id = users_profile.depot_id));
CREATE POLICY "Clients voient leurs livraisons" ON public.livraisons FOR SELECT USING (EXISTS (SELECT 1 FROM user_societes WHERE user_societes.client_id = livraisons.client_id AND user_societes.user_id = auth.uid()));

-- Codes ENEMAT
CREATE POLICY "Validation code ENEMAT anonyme" ON public.codes_enemat FOR SELECT USING (true);
CREATE POLICY "Codes ENEMAT visibles par admins" ON public.codes_enemat FOR SELECT USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional', 'agent_regional')));
CREATE POLICY "Codes ENEMAT modifiables par admins" ON public.codes_enemat FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional')));

-- User Societes
CREATE POLICY "Users gerent leurs societes" ON public.user_societes FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Admins gerent toutes societes" ON public.user_societes FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional') AND users_profile.actif = true));

-- Distances Cache
CREATE POLICY "Admins acces distances cache" ON public.distances_cache FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional', 'agent_regional') AND users_profile.actif = true));

-- Clients Hors Zone
CREATE POLICY "Admins gerent clients hors zone" ON public.clients_hors_zone FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional') AND users_profile.actif = true));

-- Audit Log
CREATE POLICY "Admin general acces audit log" ON public.audit_log FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'admin_general' AND users_profile.actif = true));

-- Formulaires Log
CREATE POLICY "Admins acces formulaires log" ON public.formulaires_log FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional') AND users_profile.actif = true));

-- Email Alerts
CREATE POLICY "Admins acces email alerts" ON public.email_alerts FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional') AND users_profile.actif = true));

-- Monday Field Mapping
CREATE POLICY "Admin can manage field mappings" ON public.monday_field_mapping FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional')));

-- Sync Monday Log
CREATE POLICY "Admin general acces sync monday log" ON public.sync_monday_log FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role = 'admin_general' AND users_profile.actif = true));

-- Workflow Transitions
CREATE POLICY "Admins acces workflow transitions" ON public.workflow_transitions FOR ALL USING (EXISTS (SELECT 1 FROM users_profile WHERE users_profile.id = auth.uid() AND users_profile.role IN ('admin_general', 'admin_regional') AND users_profile.actif = true));
