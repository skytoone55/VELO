-- ============================================================
-- Migration : Suivi lot + facture ENEMAT par client
-- Date : 2026-04-27
-- Description : 2 colonnes sur clients pour tracer le numero de lot
--               fourni par ENEMAT et le numero de facture emise.
-- ============================================================

ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero_lot_enemat TEXT DEFAULT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS numero_facture_enemat TEXT DEFAULT NULL;

-- Index pour filtres rapides
CREATE INDEX IF NOT EXISTS idx_clients_numero_lot_enemat ON clients(numero_lot_enemat) WHERE numero_lot_enemat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_numero_facture_enemat ON clients(numero_facture_enemat) WHERE numero_facture_enemat IS NOT NULL;
