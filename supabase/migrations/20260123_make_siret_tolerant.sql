-- Migration: Rendre le champ SIRET plus tolérant
-- Date: 2026-01-23
-- Raison: Les données Monday contiennent des SIRET avec espaces, trop longs, ou en doublon

-- 1. Changer le type de SIRET de VARCHAR(14) à TEXT pour accepter toutes les valeurs
ALTER TABLE clients ALTER COLUMN siret TYPE TEXT;

-- 2. Supprimer la contrainte d'unicité sur SIRET si elle existe
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_siret_key;

-- 3. Rendre SIRET nullable (si pas déjà fait)
ALTER TABLE clients ALTER COLUMN siret DROP NOT NULL;
