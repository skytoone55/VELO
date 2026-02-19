-- Corriger le value_mapping pour type_livraison
-- Le code envoie 'livraison_gratuite' mais Monday attend 'LIVRAISON GRATUITE'
-- Erreur: "This status label doesn't exist, possible statuses are: {0: RETRAIT DEPOT, 1: LIVRAISON GRATUITE, 2: LIVRAISON PAYANTE}"

UPDATE monday_field_mapping
SET value_mapping = '{
  "livraison_gratuite": "LIVRAISON GRATUITE",
  "retrait_depot": "RETRAIT DEPOT",
  "livraison_payante": "LIVRAISON PAYANTE"
}'::jsonb,
updated_at = NOW()
WHERE interface_field = 'type_livraison';
