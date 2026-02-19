-- Ajouter le champ type_livraison au mapping Monday
-- Ce champ permet de synchroniser le type de livraison vers Monday.com
-- L'utilisateur devra configurer la colonne Monday dans les paramètres

INSERT INTO monday_field_mapping (
  interface_field,
  interface_label,
  interface_type,
  interface_section,
  monday_column_id,
  monday_column_title,
  monday_column_type,
  value_mapping,
  is_synced,
  is_required
) VALUES (
  'type_livraison',
  'Type de livraison',
  'status',
  'livraison',
  NULL, -- L'utilisateur mappera la colonne dans les paramètres
  NULL,
  NULL,
  '{"livraison_gratuite": "Livraison gratuite", "retrait_depot": "Retrait depot", "livraison_payante": "Livraison payante"}'::jsonb,
  false, -- Non synchronisé jusqu'à ce que l'utilisateur configure la colonne
  false
)
ON CONFLICT (interface_field) DO UPDATE SET
  value_mapping = EXCLUDED.value_mapping,
  updated_at = NOW();
