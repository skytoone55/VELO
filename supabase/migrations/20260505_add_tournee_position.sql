-- Conserve l'ordre optimisé par l'optimizer NN (tournée intelligente).
-- La query .in('id', client_ids) ne respecte pas l'ordre du tableau ;
-- tournee_position permet de retrouver l'ordre exact côté planning.
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS tournee_position INTEGER NULL;
