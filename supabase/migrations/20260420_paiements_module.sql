-- Module Paiements — migration additive (zéro casse existant)
-- Table commerciaux + colonne depots.livreur_defaut_id + 11 colonnes paiement sur clients

-- ===========================================================================
-- 1. Table commerciaux (source de vérité commerciaux)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS commerciaux (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  nom             TEXT NOT NULL,
  parent_code     TEXT REFERENCES commerciaux(code) ON DELETE SET NULL,
  tenant          TEXT NOT NULL DEFAULT 'ppe',
  actif           BOOLEAN NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerciaux_tenant_actif ON commerciaux(tenant, actif);
CREATE INDEX IF NOT EXISTS idx_commerciaux_parent_code ON commerciaux(parent_code);

-- ===========================================================================
-- 2. depots.livreur_defaut_id (FK vers public.users, table métier)
-- ===========================================================================

ALTER TABLE depots
  ADD COLUMN IF NOT EXISTS livreur_defaut_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_depots_livreur_defaut ON depots(livreur_defaut_id);

-- ===========================================================================
-- 3. clients — 11 colonnes paiement (additives, non destructives)
--    On GARDE commercial_assigne (sync Monday continue d'écrire dedans)
--    On ajoute commercial_code en parallèle (source de vérité nouvelle)
-- ===========================================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS commercial_code TEXT,
  ADD COLUMN IF NOT EXISTS paiement_livreur_id UUID REFERENCES public.users_profile(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enemat_paye BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS enemat_paye_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_facture_envoyee BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commercial_facture_envoyee_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_paye BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commercial_paye_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livreur_facture_envoyee BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS livreur_facture_envoyee_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livreur_paye BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS livreur_paye_le TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paiement_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_commercial_code ON clients(commercial_code);
CREATE INDEX IF NOT EXISTS idx_clients_paiement_livreur_id ON clients(paiement_livreur_id);
CREATE INDEX IF NOT EXISTS idx_clients_statut_enemat_paiements
  ON clients(statut_enemat)
  WHERE statut_enemat = 'depose_enemat';

-- ===========================================================================
-- 4. Commentaires pour documenter l'intention
-- ===========================================================================

COMMENT ON TABLE commerciaux IS 'Liste normalisée des commerciaux (avant: texte libre dans clients.commercial_assigne)';
COMMENT ON COLUMN commerciaux.parent_code IS 'Pour les sous-commerciaux (ex: Dizien-Samira a parent_code=dizien)';
COMMENT ON COLUMN clients.commercial_code IS 'Nouveau champ FK vers commerciaux.code. Coexiste avec commercial_assigne (sync Monday) pendant la transition';
COMMENT ON COLUMN clients.paiement_livreur_id IS 'Livreur figé pour ce client (utilisé par module paiements). Peut différer de la logique tournée.';
COMMENT ON COLUMN depots.livreur_defaut_id IS 'Livreur par défaut du dépôt — pré-remplit paiement_livreur_id au passage ENEMAT';
