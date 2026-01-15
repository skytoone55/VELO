-- Ajout du code ENEMAT saisi dans la table clients pour affichage dans la fiche
-- Ce code est stocké lorsque le client valide son code de validation

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS code_enemat_saisi TEXT;

COMMENT ON COLUMN clients.code_enemat_saisi IS 'Code de validation saisi par le client lors de la validation';
