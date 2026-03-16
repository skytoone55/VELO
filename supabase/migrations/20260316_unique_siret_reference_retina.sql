-- Garde-fou anti-doublon : chaque référence Retina et chaque SIRET doit être unique
-- NULL autorisé (plusieurs clients sans SIRET OK), mais 2 clients avec le même SIRET = interdit

ALTER TABLE clients ADD CONSTRAINT clients_reference_retina_unique UNIQUE (reference_retina);
ALTER TABLE clients ADD CONSTRAINT clients_siret_unique UNIQUE (siret);
