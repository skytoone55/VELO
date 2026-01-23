-- Création de la table monday_field_mapping pour le mapping dynamique
-- Cette table stocke les associations entre les champs de l'interface et les colonnes Monday

CREATE TABLE IF NOT EXISTS monday_field_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Champ interface (Supabase)
  interface_field TEXT NOT NULL UNIQUE,
  interface_label TEXT NOT NULL,
  interface_type TEXT NOT NULL DEFAULT 'text',
  interface_section TEXT NOT NULL DEFAULT 'other',

  -- Colonne Monday
  monday_column_id TEXT,
  monday_column_title TEXT,
  monday_column_type TEXT,

  -- Mapping de valeurs (pour les champs status)
  -- Ex: { "controle_valide": "CONTROLE VALIDÉ", "devis_signe": "DEVIS SIGNÉ" }
  value_mapping JSONB DEFAULT '{}'::jsonb,

  -- Métadonnées
  is_synced BOOLEAN DEFAULT false,
  is_required BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les recherches fréquentes
CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_interface_field
  ON monday_field_mapping(interface_field);

CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_monday_column_id
  ON monday_field_mapping(monday_column_id)
  WHERE monday_column_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_is_synced
  ON monday_field_mapping(is_synced)
  WHERE is_synced = true;

-- RLS
ALTER TABLE monday_field_mapping ENABLE ROW LEVEL SECURITY;

-- Policy: Les admins peuvent tout faire
CREATE POLICY "Admin can manage field mappings" ON monday_field_mapping
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE users_profile.id = auth.uid()
      AND users_profile.role IN ('admin_general', 'admin_regional')
    )
  );

-- Commentaire
COMMENT ON TABLE monday_field_mapping IS 'Mapping dynamique entre les champs interface et les colonnes Monday.com';
