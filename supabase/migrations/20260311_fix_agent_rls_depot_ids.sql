-- Fix agent_secteur RLS policies on livraisons
-- Ajoute depot_ids comme condition alternative (territoire seul ne fonctionne pas car tous les agents ont territoire='FR')
-- Appliqué sur PPE (zfpzhhdovxllchlsihcr) et Ecovolt (irpnllwlxivlylclfjwd) le 2026-03-11

-- SELECT
DROP POLICY IF EXISTS "Agent secteur livraisons territoire" ON livraisons;
CREATE POLICY "Agent secteur livraisons territoire" ON livraisons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users_profile up
    JOIN clients c ON (livraisons.client_id = c.id)
    WHERE up.id = auth.uid()
      AND up.role = 'agent_secteur' AND up.actif = true
      AND (
        c.depot_retrait_id = ANY(up.depot_ids)
        OR c.depot_logistique_id = ANY(up.depot_ids)
        OR c.departement = up.territoire
        OR c.departement = up.departement
      )
  ));

-- INSERT
DROP POLICY IF EXISTS "Agent secteur insert livraisons" ON livraisons;
CREATE POLICY "Agent secteur insert livraisons" ON livraisons
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM users_profile up
    JOIN clients c ON (livraisons.client_id = c.id)
    WHERE up.id = auth.uid()
      AND up.role = 'agent_secteur' AND up.actif = true
      AND (
        c.depot_retrait_id = ANY(up.depot_ids)
        OR c.depot_logistique_id = ANY(up.depot_ids)
        OR c.departement = up.territoire
        OR c.departement = up.departement
      )
  ));

-- UPDATE
DROP POLICY IF EXISTS "Agent secteur update livraisons" ON livraisons;
CREATE POLICY "Agent secteur update livraisons" ON livraisons
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users_profile up
    JOIN clients c ON (livraisons.client_id = c.id)
    WHERE up.id = auth.uid()
      AND up.role = 'agent_secteur' AND up.actif = true
      AND (
        c.depot_retrait_id = ANY(up.depot_ids)
        OR c.depot_logistique_id = ANY(up.depot_ids)
        OR c.departement = up.territoire
        OR c.departement = up.departement
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM users_profile up
    JOIN clients c ON (livraisons.client_id = c.id)
    WHERE up.id = auth.uid()
      AND up.role = 'agent_secteur' AND up.actif = true
      AND (
        c.depot_retrait_id = ANY(up.depot_ids)
        OR c.depot_logistique_id = ANY(up.depot_ids)
        OR c.departement = up.territoire
        OR c.departement = up.departement
      )
  ));
