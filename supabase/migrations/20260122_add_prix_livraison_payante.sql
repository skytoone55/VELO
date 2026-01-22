-- Migration: Ajouter le champ prix de livraison payante aux dépôts
-- Date: 2026-01-22
-- Description: Ajoute le prix de livraison pour les clients hors zone gratuite

-- Ajouter la colonne prix_livraison_payante à la table depots
ALTER TABLE depots
ADD COLUMN IF NOT EXISTS prix_livraison_payante numeric DEFAULT 0;

-- Commentaire sur la colonne
COMMENT ON COLUMN depots.prix_livraison_payante IS
'Prix en euros pour la livraison payante (clients entre rayon_couverture_km et rayon_livraison_payant_km)';
