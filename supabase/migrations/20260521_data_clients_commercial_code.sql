-- Migration : ajout de la colonne commercial_code sur data_clients
-- Contexte : data_clients ne possédait que commercial_assigne (email brut).
-- Cette colonne commercial_code est la FK normalisée vers commerciaux.code,
-- alignée sur la table clients (même pattern).
--
-- Backfill : à réaliser manuellement après migration (voir rapport d'analyse).
-- La stratégie recommandée est un matching par email/nom partiel (cf. RAPPORT FINAL).
--
-- Créée le 2026-05-21 — NE PAS appliquer sans GO de John.

ALTER TABLE data_clients
  ADD COLUMN IF NOT EXISTS commercial_code TEXT;

-- Index optionnel pour les filtres fréquents
CREATE INDEX IF NOT EXISTS idx_data_clients_commercial_code
  ON data_clients (commercial_code);
