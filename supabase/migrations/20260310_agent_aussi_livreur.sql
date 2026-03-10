-- Permet aux agent_secteur d'apparaître dans les listes livreur
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS est_aussi_livreur BOOLEAN DEFAULT false;
