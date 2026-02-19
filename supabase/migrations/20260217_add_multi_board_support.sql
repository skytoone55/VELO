-- Migration: Ajout du support multi-board Monday
-- PPE Énergie a 7 boards Monday (un par régie/commercial)
-- Chaque client est lié à un board spécifique

-- 1. Ajouter board_id à monday_field_mapping
-- Permet d'avoir un mapping par board (les column IDs varient entre boards)
ALTER TABLE monday_field_mapping
  ADD COLUMN IF NOT EXISTS board_id TEXT;

-- Supprimer l'ancienne contrainte unique sur interface_field seul
ALTER TABLE monday_field_mapping
  DROP CONSTRAINT IF EXISTS monday_field_mapping_interface_field_key;

-- Créer une contrainte unique composite (interface_field + board_id)
-- board_id NULL = mode single-board (ECO-VOLT), non-NULL = multi-board (PPE)
CREATE UNIQUE INDEX IF NOT EXISTS idx_monday_field_mapping_field_board
  ON monday_field_mapping(interface_field, COALESCE(board_id, '__null__'));

-- Index pour filtrer par board_id
CREATE INDEX IF NOT EXISTS idx_monday_field_mapping_board_id
  ON monday_field_mapping(board_id)
  WHERE board_id IS NOT NULL;

-- 2. Ajouter monday_board_id à la table clients
-- Stocke le board Monday d'origine du client (pour multi-board)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monday_board_id TEXT;

-- Index pour les requêtes par board
CREATE INDEX IF NOT EXISTS idx_clients_monday_board_id
  ON clients(monday_board_id)
  WHERE monday_board_id IS NOT NULL;

-- 3. Table optionnelle pour stocker les infos de chaque board Monday
CREATE TABLE IF NOT EXISTS monday_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id TEXT NOT NULL UNIQUE,
  board_name TEXT NOT NULL,
  commercial_name TEXT,
  is_active BOOLEAN DEFAULT true,
  items_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS pour monday_boards
ALTER TABLE monday_boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage monday boards" ON monday_boards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users_profile
      WHERE users_profile.id = auth.uid()
      AND users_profile.role IN ('admin_general', 'admin_regional')
    )
  );

-- Service role bypass pour monday_boards
CREATE POLICY "Service role full access monday boards" ON monday_boards
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Service role bypass pour monday_field_mapping (si pas déjà fait)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'monday_field_mapping'
    AND policyname = 'Service role full access monday field mapping'
  ) THEN
    CREATE POLICY "Service role full access monday field mapping" ON monday_field_mapping
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE monday_boards IS 'Liste des boards Monday.com (multi-board pour PPE)';
COMMENT ON COLUMN monday_field_mapping.board_id IS 'Board ID Monday pour multi-board (NULL = single-board mode)';
COMMENT ON COLUMN clients.monday_board_id IS 'Board Monday d''origine du client (multi-board)';
