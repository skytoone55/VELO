-- Fix: Erreur "infinite recursion detected in policy for relation clients"
-- Le problème vient probablement de policies qui se référencent mutuellement

-- Supprimer les anciennes policies problématiques
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;
DROP POLICY IF EXISTS "clients_delete_policy" ON clients;
DROP POLICY IF EXISTS "Allow authenticated users to read clients" ON clients;
DROP POLICY IF EXISTS "Allow authenticated users to update clients" ON clients;
DROP POLICY IF EXISTS "Allow service role full access" ON clients;

-- Désactiver temporairement RLS pour permettre l'accès admin
-- (le service_role bypass déjà RLS, mais on s'assure que ça fonctionne)

-- Créer des policies simples et non-récursives
-- Policy pour SELECT : tous les utilisateurs authentifiés peuvent lire
CREATE POLICY "clients_read_authenticated" ON clients
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy pour INSERT : tous les utilisateurs authentifiés peuvent insérer
CREATE POLICY "clients_insert_authenticated" ON clients
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy pour UPDATE : tous les utilisateurs authentifiés peuvent modifier
CREATE POLICY "clients_update_authenticated" ON clients
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy pour DELETE : tous les utilisateurs authentifiés peuvent supprimer
CREATE POLICY "clients_delete_authenticated" ON clients
  FOR DELETE
  TO authenticated
  USING (true);

-- Note: Le service_role (utilisé par l'API admin) bypass automatiquement RLS
-- donc pas besoin de policy spécifique pour lui
