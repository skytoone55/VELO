-- Migration: SAV reactivation + CQ alert tracking
-- 2026-03-13

ALTER TABLE livraisons
  ADD COLUMN IF NOT EXISTS reactivated_by UUID REFERENCES users_profile(id),
  ADD COLUMN IF NOT EXISTS reactivation_comment TEXT,
  ADD COLUMN IF NOT EXISTS reactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cq_alerte_envoyee BOOLEAN DEFAULT false;
