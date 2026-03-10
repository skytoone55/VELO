-- Migration: delivery module + tournées workflow
-- Scope: PPE livraison (non-destructif pour Ecovolt)

-- 1. Colonne nb_velos_livres sur livraisons
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS nb_velos_livres INTEGER NULL;

-- 2. Table tournées
CREATE TABLE IF NOT EXISTS tournees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  livreur_id UUID REFERENCES users_profile(id),
  depot_id UUID REFERENCES depots(id),
  creneau_debut VARCHAR(5) NULL, -- ex: "09:00"
  creneau_fin VARCHAR(5) NULL,   -- ex: "12:00"
  notes TEXT NULL,
  created_by UUID REFERENCES users_profile(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tournees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournees_admin" ON tournees FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users_profile WHERE id = auth.uid() AND role IN ('super_admin', 'admin')));

-- 3. Colonnes confirmation sur livraisons
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS tournee_id UUID NULL REFERENCES tournees(id);
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS confirmation_statut VARCHAR(20) NULL;
-- valeurs: null, 'en_attente', 'confirmee', 'refusee'
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS confirmation_commentaire TEXT NULL;
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS confirmation_date TIMESTAMPTZ NULL;

-- 4. Index pour requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_livraisons_tournee_id ON livraisons(tournee_id);
CREATE INDEX IF NOT EXISTS idx_livraisons_confirmation_statut ON livraisons(confirmation_statut);
CREATE INDEX IF NOT EXISTS idx_tournees_date ON tournees(date);
