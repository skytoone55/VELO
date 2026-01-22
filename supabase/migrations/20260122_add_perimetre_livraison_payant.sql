-- Migration: Ajouter le champ périmètre livraison payant aux dépôts
-- Date: 2026-01-22
-- Description: Ajoute un nouveau champ pour définir le rayon de livraison payante
--              au-delà du rayon de couverture gratuit (rayon_couverture_km)

-- Ajouter la colonne rayon_livraison_payant_km à la table depots
-- Ce rayon définit la zone où la livraison est possible mais payante
-- (au-delà de rayon_couverture_km mais dans rayon_livraison_payant_km)
ALTER TABLE depots
ADD COLUMN IF NOT EXISTS rayon_livraison_payant_km numeric DEFAULT 0;

-- Commentaire sur la colonne
COMMENT ON COLUMN depots.rayon_livraison_payant_km IS
'Rayon en km pour la livraison payante. Les clients entre rayon_couverture_km et rayon_livraison_payant_km peuvent choisir une livraison payante.';

-- Exemple de mise à jour pour définir un périmètre de 50km pour tous les dépôts
-- (à décommenter et adapter selon vos besoins)
-- UPDATE depots SET rayon_livraison_payant_km = 50 WHERE rayon_livraison_payant_km = 0;
