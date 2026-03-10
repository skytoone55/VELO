-- Migration: Colonnes documents sur clients + pdf_livraison_url sur livraisons
-- Date: 2026-03-08
-- But: Support du bloc Documents (5 slots) dans la fiche client

-- Documents demandés au client (upload via formulaire de demande)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS attestation_urssaf_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS attestation_dsn_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS declaration_benevoles_url TEXT;

-- Statut de demande de documents (null = pas demandé, pending = demandé, received = reçu)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS documents_demandes JSONB DEFAULT '{}';
-- Format: { "urssaf": { "status": "pending"|"received", "demande_date": "...", "recu_date": "..." }, ... }

-- Token pour le formulaire de demande de pièces (lien envoyé au client)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS token_documents TEXT;

-- PDF de livraison généré (stocké sur la livraison)
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS pdf_livraison_url TEXT;

-- Pièce d'identité séparée (en plus de celle dans le PDF)
-- document_identite_url existe déjà sur livraisons, on ajoute sur clients aussi
ALTER TABLE clients ADD COLUMN IF NOT EXISTS piece_identite_url TEXT;
