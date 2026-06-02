-- Commentaire d'action livreur depuis le planning (a_relivrer / probleme_livraison / retractation)
-- Appliquee sur PPE (zfpzhhdovxllchlsihcr) + Ecovolt (irpnllwlxivlylclfjwd) le 2026-06-02.
ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS commentaire_action TEXT,
  ADD COLUMN IF NOT EXISTS commentaire_action_type TEXT,
  ADD COLUMN IF NOT EXISTS commentaire_action_at TIMESTAMPTZ;

COMMENT ON COLUMN livraisons.commentaire_action IS 'Commentaire libre saisi par le livreur lors d''une action depuis le planning (a_relivrer / probleme_livraison / retractation)';
COMMENT ON COLUMN livraisons.commentaire_action_type IS 'Type de la derniere action livreur: a_relivrer | probleme_livraison | retractation';
COMMENT ON COLUMN livraisons.commentaire_action_at IS 'Horodatage de la derniere action livreur depuis le planning';
