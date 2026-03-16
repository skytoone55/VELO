-- ============================================================
-- Migration : Module ENEMAT (suivi post-livraison)
-- Date : 2026-03-16
-- Description : 6 colonnes sur clients (statut + dates ENEMAT)
--               1 table historique enemat_history
--               1 index pour performance
-- ============================================================

-- === CLIENTS : Colonnes module ENEMAT ===
ALTER TABLE clients ADD COLUMN IF NOT EXISTS in_enemat BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS statut_enemat TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_depot_enemat TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_apf_enemat TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_paye_enemat TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_entree_enemat TIMESTAMPTZ DEFAULT NULL;

-- === TABLE : Historique des transitions ENEMAT ===
CREATE TABLE IF NOT EXISTS enemat_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) NOT NULL,
  statut_avant TEXT,
  statut_apres TEXT NOT NULL,
  changed_by UUID REFERENCES users_profile(id),
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

-- === INDEX pour performance ===
CREATE INDEX IF NOT EXISTS idx_enemat_history_client ON enemat_history(client_id);
