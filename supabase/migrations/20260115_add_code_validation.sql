-- Ajout du code de validation hashé pour la sécurité
-- Ce code sera généré à la création du client et envoyé par email
-- Il sera utilisé pour valider l'identité lors du remplissage du formulaire

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS code_validation_hash TEXT,
ADD COLUMN IF NOT EXISTS code_validation_envoye_at TIMESTAMPTZ;

COMMENT ON COLUMN clients.code_validation_hash IS 'Hash SHA256 du code de validation à 6 chiffres';
COMMENT ON COLUMN clients.code_validation_envoye_at IS 'Date d envoi du code de validation par email';
