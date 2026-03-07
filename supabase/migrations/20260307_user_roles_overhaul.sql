-- ============================================================
-- Migration: Refonte systeme utilisateurs
-- Date: 2026-03-07
-- Roles: admin_general→super_admin, admin_regional→admin,
--        agent_regional/agent_depot→agent_secteur, livreur, client
-- ============================================================

-- 1A. Flag super_admin (securite)
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 1B. Renommer les roles
UPDATE users_profile SET role = 'super_admin'   WHERE role = 'admin_general';
UPDATE users_profile SET role = 'admin'         WHERE role = 'admin_regional';
UPDATE users_profile SET role = 'agent_secteur' WHERE role = 'agent_regional';
UPDATE users_profile SET role = 'agent_secteur' WHERE role = 'agent_depot';

-- 1C. Promouvoir Jonathan (unique super_admin)
UPDATE users_profile SET is_super_admin = true WHERE email = 'malai.jonathan@gmail.com';

-- 1D. Contrainte unicite super_admin (1 seul autorise)
CREATE UNIQUE INDEX IF NOT EXISTS users_profile_unique_super_admin
  ON users_profile (is_super_admin) WHERE is_super_admin = true;

-- 1E. Colonne departement (pour agent_secteur)
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS departement VARCHAR(10) NULL;
UPDATE users_profile SET departement = territoire
  WHERE role = 'agent_secteur' AND territoire IS NOT NULL;

-- 1F. Table de liaison Livreur <-> Agent Secteur (M2M)
CREATE TABLE IF NOT EXISTS livreur_agents (
  livreur_id UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES users_profile(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (livreur_id, agent_id)
);

CREATE INDEX IF NOT EXISTS livreur_agents_agent_id_idx
  ON livreur_agents (agent_id);

-- 1G. RLS pour livreur_agents
ALTER TABLE livreur_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "livreur_agents_read_auth" ON livreur_agents
  FOR SELECT TO authenticated
  USING (auth.uid() = livreur_id OR auth.uid() = agent_id);
