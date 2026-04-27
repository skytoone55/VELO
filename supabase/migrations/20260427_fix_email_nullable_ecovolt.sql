-- ============================================================
-- Migration : Harmoniser nullabilite email entre PPE et Ecovolt
-- Date : 2026-04-27
-- Description : Sur Ecovolt, clients.email etait NOT NULL alors que
--               sur PPE elle est nullable. Cela bloquait le passage
--               d'un client de "data clients" vers "clients" si
--               aucun email n'etait disponible (erreur PCL: null value
--               in column "email" of relation "clients" violates
--               not-null constraint).
--
-- Cette migration aligne Ecovolt sur PPE en supprimant la contrainte
-- NOT NULL. Idempotent : ne fait rien si la colonne est deja nullable.
-- ============================================================

ALTER TABLE clients ALTER COLUMN email DROP NOT NULL;
