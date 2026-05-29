-- ============================================================
-- Auto-synchronisation de l'eligibilite NAF (clients.validation_naf)
-- Appliquee sur les DEUX bases : PPE (zfpzhhdovxllchlsihcr) + Ecovolt (irpnllwlxivlylclfjwd)
-- Date : 2026-05-29
--
-- SOURCE DE VERITE : table naf_codes (colonne `valide`).
-- Le champ clients.validation_naf / data_clients.validation_naf ('OUI'/'NON')
-- est un cache DERIVE de naf_codes. Avant cette migration il etait fige a
-- l'ingestion et jamais recalcule -> faux negatifs (ex AMR ENERGIE / 3530Z).
--
-- COMPORTEMENTS GARANTIS (decides avec John) :
--  1) Quand on bascule naf_codes.valide (true<->false), TOUTES les fiches
--     (clients + data_clients) de ce code sont resynchronisees, DANS LES 2 SENS.
--     -> valide=true  : les fiches passent 'OUI'
--     -> valide=false : les fiches passent 'NON' (toute la categorie, meme livrees)
--  2) Quand une fiche arrive avec un code_ape INCONNU du referentiel, le code est
--     cree automatiquement en valide=true et la fiche devient 'OUI'.
--     (par defaut tout nouveau metier est accepte ; on desactive a la main ensuite)
--
-- Normalisation du code : upper + suppression des points/espaces (3530Z == 35.30 z).
--
-- ROLLBACK :
--   DROP TRIGGER IF EXISTS trg_naf_resync_fiches ON naf_codes;
--   DROP TRIGGER IF EXISTS trg_clients_ensure_naf ON clients;
--   DROP TRIGGER IF EXISTS trg_data_clients_ensure_naf ON data_clients;
--   DROP FUNCTION IF EXISTS naf_resync_fiches();
--   DROP FUNCTION IF EXISTS fiche_ensure_naf();
-- ============================================================

-- 1. Resync des fiches d'un code quand naf_codes.valide change (ou a l'insert)
CREATE OR REPLACE FUNCTION naf_resync_fiches() RETURNS trigger AS $$
DECLARE
  v_norm text := upper(regexp_replace(NEW.code, '[ .]', '', 'g'));
  v_val  text := CASE WHEN NEW.valide THEN 'OUI' ELSE 'NON' END;
BEGIN
  UPDATE clients c SET validation_naf = v_val, updated_at = now()
    WHERE c.code_ape IS NOT NULL
      AND upper(regexp_replace(c.code_ape, '[ .]', '', 'g')) = v_norm
      AND c.validation_naf IS DISTINCT FROM v_val;
  UPDATE data_clients c SET validation_naf = v_val, updated_at = now()
    WHERE c.code_ape IS NOT NULL
      AND upper(regexp_replace(c.code_ape, '[ .]', '', 'g')) = v_norm
      AND c.validation_naf IS DISTINCT FROM v_val;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_naf_resync_fiches ON naf_codes;
CREATE TRIGGER trg_naf_resync_fiches
  AFTER INSERT OR UPDATE OF valide ON naf_codes
  FOR EACH ROW EXECUTE FUNCTION naf_resync_fiches();

-- 2. A l'arrivee/maj d'un code_ape : creer le code si inconnu (valide=true)
--    puis aligner validation_naf de la fiche sur le referentiel
CREATE OR REPLACE FUNCTION fiche_ensure_naf() RETURNS trigger AS $$
DECLARE
  v_norm   text;
  v_valide boolean;
BEGIN
  IF NEW.code_ape IS NULL OR btrim(NEW.code_ape) = '' THEN
    RETURN NEW;
  END IF;
  v_norm := upper(regexp_replace(NEW.code_ape, '[ .]', '', 'g'));
  SELECT n.valide INTO v_valide FROM naf_codes n
    WHERE upper(regexp_replace(n.code, '[ .]', '', 'g')) = v_norm
    LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO naf_codes(code, label, valide) VALUES (v_norm, v_norm, true)
      ON CONFLICT (code) DO NOTHING;
    v_valide := true;
  END IF;
  NEW.validation_naf := CASE WHEN v_valide THEN 'OUI' ELSE 'NON' END;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_ensure_naf ON clients;
CREATE TRIGGER trg_clients_ensure_naf
  BEFORE INSERT OR UPDATE OF code_ape ON clients
  FOR EACH ROW EXECUTE FUNCTION fiche_ensure_naf();

DROP TRIGGER IF EXISTS trg_data_clients_ensure_naf ON data_clients;
CREATE TRIGGER trg_data_clients_ensure_naf
  BEFORE INSERT OR UPDATE OF code_ape ON data_clients
  FOR EACH ROW EXECUTE FUNCTION fiche_ensure_naf();

-- 3. Rattrapage one-shot (deja execute le 2026-05-29) : creer les codes inconnus
--    existants en valide=true. Le trigger (1) debloque alors les fiches.
-- INSERT INTO naf_codes(code,label,valide)
--   SELECT DISTINCT upper(regexp_replace(code_ape,'[ .]','','g')), ... , true
--   FROM (clients UNION data_clients) WHERE code absent de naf_codes;
