-- Migration: Process Client Schema
-- Date: 2026-03-08
-- Description: Ajoute reference_retina, table naf_codes, jours_ouverture depots
-- Exécuter sur les 2 Supabase (PPE + Ecovolt)

-- ============================================================
-- 1. Colonne reference_retina sur clients (clé de jointure universelle)
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS reference_retina VARCHAR(10) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS clients_reference_retina_idx ON clients (reference_retina) WHERE reference_retina IS NOT NULL;

-- ============================================================
-- 2. Table naf_codes (référentiel 199 codes NAF ENEMAT)
-- ============================================================
CREATE TABLE IF NOT EXISTS naf_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  label TEXT NOT NULL,
  validation VARCHAR(5) NOT NULL DEFAULT 'KO',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE naf_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "naf_codes_read_all" ON naf_codes FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 3. Jours d'ouverture et paramètres dépôt
-- ============================================================
ALTER TABLE depots ADD COLUMN IF NOT EXISTS jours_ouverture TEXT[] DEFAULT ARRAY['lundi','mardi','mercredi','jeudi','vendredi'];
ALTER TABLE depots ADD COLUMN IF NOT EXISTS capacite_velos_jour INTEGER DEFAULT 10;
ALTER TABLE depots ADD COLUMN IF NOT EXISTS creneau_duree_minutes INTEGER DEFAULT 30;

-- ============================================================
-- 4. Token formulaire livraison (sur table livraisons)
-- ============================================================
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS token_livraison VARCHAR(64) NULL;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS creneau_date DATE NULL;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS creneau_heure_debut TIME NULL;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS creneau_heure_fin TIME NULL;
CREATE UNIQUE INDEX IF NOT EXISTS livraisons_token_idx ON livraisons (token_livraison) WHERE token_livraison IS NOT NULL;
