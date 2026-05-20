-- Contrôle qualité : tag de catégorie posé sur un dossier pendant qu'il est en contrôle.
-- Valeurs applicatives : radie | naf | mail_client_recu | mail_enemat_sav | client_nrp | autre
-- (NULL = aucun tag). Transitoire : visible tant que le dossier est dans la file de contrôle.
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS cq_categorie TEXT DEFAULT NULL;
