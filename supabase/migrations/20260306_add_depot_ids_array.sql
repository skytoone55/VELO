-- Add depot_ids array column to support multi-depot assignment
ALTER TABLE users_profile ADD COLUMN IF NOT EXISTS depot_ids uuid[] DEFAULT '{}';

-- Migrate existing single depot_id data
UPDATE users_profile
SET depot_ids = ARRAY[depot_id]::uuid[]
WHERE depot_id IS NOT NULL AND (depot_ids IS NULL OR depot_ids = '{}');
