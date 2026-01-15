-- Migration: Ajouter les colonnes depot_retrait_id et depot_logistique_id à la table clients
-- Ces colonnes permettent d'assigner automatiquement un dépôt au client selon sa localisation

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS depot_retrait_id UUID REFERENCES depots(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS depot_logistique_id UUID REFERENCES depots(id) ON DELETE SET NULL;

-- Index pour améliorer les performances des requêtes
CREATE INDEX IF NOT EXISTS idx_clients_depot_retrait_id ON clients(depot_retrait_id);
CREATE INDEX IF NOT EXISTS idx_clients_depot_logistique_id ON clients(depot_logistique_id);

-- Commentaires pour documenter les colonnes
COMMENT ON COLUMN clients.depot_retrait_id IS 'Dépôt de retrait assigné si le client est dans le rayon de couverture';
COMMENT ON COLUMN clients.depot_logistique_id IS 'Dépôt logistique assigné pour la livraison à domicile';
