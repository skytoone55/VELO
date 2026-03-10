-- Heure précise de livraison (saisie par l'admin dans le planning jour)
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS heure_precise TEXT DEFAULT NULL;
