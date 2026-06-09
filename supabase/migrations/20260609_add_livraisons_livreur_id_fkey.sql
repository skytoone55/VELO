-- 2026-06-09 — FK manquante livraisons.livreur_id -> users_profile (base PPE)
--
-- Contexte / incident :
--   Le commit 7fa4b74 (fix(livraisons): afficher le livreur quel que soit son role)
--   a ajoute la jointure PostgREST `livreur:livreur_id(id,prenom,nom)` dans
--   src/app/api/livraisons/route.ts.
--   Ecovolt possedait la FK livraisons_livreur_id_fkey -> users_profile, mais
--   PAS la base PPE. Sans cette FK, PostgREST ne peut pas resoudre l'embedding
--   `livreur:livreur_id(...)` et fait echouer TOUTE la requete /api/livraisons
--   => page Livraisons vide (0 client) sur PPE apres deploiement.
--
-- Fix : aligner PPE sur Ecovolt en ajoutant la FK (NO ACTION, comme Ecovolt).
--   Verifie avant application : 0 livreur_id orphelin sur PPE (1191 livraisons
--   avec livreur, toutes rattachees a un users_profile existant).
--
-- Idempotent : ne fait rien si la contrainte existe deja (cas Ecovolt).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'livraisons_livreur_id_fkey'
  ) THEN
    ALTER TABLE public.livraisons
      ADD CONSTRAINT livraisons_livreur_id_fkey
      FOREIGN KEY (livreur_id) REFERENCES public.users_profile(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
